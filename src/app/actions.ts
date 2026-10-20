"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, requireAuth } from "@/lib/session";
import { fetchMarketData } from "@/lib/data/yahoo";
import { refreshAll, refreshStock } from "@/lib/refresh";
import { getFxRates, saveThresholds } from "@/lib/settings";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/rating";

export type FormState = { error?: string; ok?: string } | undefined;

// Einfache Bremse gegen Passwort-Raten (pro Server-Prozess)
let failedLogins = 0;
let lockedUntil = 0;

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  if (Date.now() < lockedUntil) return { error: "Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen." };
  const pw = String(formData.get("password") ?? "");
  const b64 = process.env.ADMIN_PASSWORD_HASH_B64;
  if (!b64) return { error: "Kein Passwort eingerichtet (ADMIN_PASSWORD_HASH_B64 fehlt)." };
  const ok = await bcrypt.compare(pw, Buffer.from(b64, "base64").toString("utf8"));
  if (!ok) {
    failedLogins++;
    if (failedLogins >= 5) {
      lockedUntil = Date.now() + 10 * 60_000;
      failedLogins = 0;
    }
    await new Promise((r) => setTimeout(r, 800));
    return { error: "Passwort falsch." };
  }
  failedLogins = 0;
  await createSession();
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const PurchaseSchema = z.object({
  symbol: z.string().trim().min(1, "Bitte eine Aktie auswählen").max(32),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum fehlt"),
  price: z.coerce.number().positive("Kurs muss größer als 0 sein"),
  quantity: z.coerce.number().positive("Stückzahl muss größer als 0 sein"),
  fees: z.coerce.number().min(0).default(0),
  isin: z.string().trim().max(12).optional(),
  note: z.string().trim().max(255).optional(),
});

// Akzeptiert deutsche (1.234,56) und englische (1234.56) Schreibweise
const parseNum = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
};

export async function savePurchase(_: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const parsed = PurchaseSchema.safeParse({
    symbol: String(formData.get("symbol") ?? "").toUpperCase(),
    date: formData.get("date"),
    price: parseNum(formData.get("price")),
    quantity: parseNum(formData.get("quantity")),
    fees: parseNum(formData.get("fees")) || "0",
    isin: String(formData.get("isin") ?? "") || undefined,
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  const id = Number(formData.get("id") ?? 0);

  let stock = await db.stock.findUnique({ where: { symbol: p.symbol } });
  if (!stock) {
    let market;
    try {
      market = await fetchMarketData(p.symbol);
    } catch {
      return { error: `Zum Symbol ${p.symbol} wurden keine Kursdaten gefunden.` };
    }
    stock = await db.stock.create({
      data: { symbol: p.symbol, name: market.name, currency: market.currency, exchange: market.exchange, sector: market.sector, isin: p.isin },
    });
  }

  const data = { stockId: stock.id, date: new Date(p.date), price: p.price, quantity: p.quantity, fees: p.fees, note: p.note };
  if (id) await db.purchase.update({ where: { id }, data });
  else await db.purchase.create({ data });

  // Kennzahlen direkt laden, damit der Kauf sofort im Dashboard erscheint (KI-Ausblick folgt beim nächtlichen Lauf)
  try {
    await refreshStock(stock.id, (await getFxRates())?.rates, { outlook: false });
  } catch {
    // Daten folgen beim nächsten Refresh
  }
  revalidatePath("/", "layout");
  return { ok: id ? "Kauf aktualisiert." : `Kauf von ${stock.name} gespeichert.` };
}

export async function deletePurchase(formData: FormData) {
  await requireAuth();
  const id = Number(formData.get("id"));
  const purchase = await db.purchase.delete({ where: { id } });
  const remaining = await db.purchase.count({ where: { stockId: purchase.stockId } });
  if (!remaining) await db.stock.delete({ where: { id: purchase.stockId } });
  revalidatePath("/", "layout");
}

export async function runRefresh(withOutlook: boolean): Promise<FormState> {
  await requireAuth();
  const res = await refreshAll({ outlook: withOutlook });
  revalidatePath("/", "layout");
  return res.errors.length
    ? { error: `${res.count - res.errors.length} von ${res.count} aktualisiert. Fehler: ${res.errors.join("; ")}` }
    : { ok: `${res.count} Werte aktualisiert.` };
}

export async function saveSettings(_: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const n = (k: string) => Number(parseNum(formData.get(k))) / 100;
  const t: Thresholds = {
    ...DEFAULT_THRESHOLDS,
    payoutEps: { green: n("payoutEps.green"), orange: n("payoutEps.orange") },
    payoutFcf: { green: n("payoutFcf.green"), orange: n("payoutFcf.orange") },
    debtToEquity: { green: n("debtToEquity.green") * 100, orange: n("debtToEquity.orange") * 100 }, // Verhältnis, kein Prozentwert
    debtChangeYoY: { green: n("debtChangeYoY.green"), orange: n("debtChangeYoY.orange") },
    dividendCagr5: { green: n("dividendCagr5.green"), orange: n("dividendCagr5.orange") },
    minCriteria: Number(formData.get("minCriteria") ?? 3),
  };
  const bands = [t.payoutEps, t.payoutFcf, t.debtToEquity, t.debtChangeYoY];
  if ([...bands, t.dividendCagr5].some((b) => !Number.isFinite(b.green) || !Number.isFinite(b.orange)))
    return { error: "Bitte alle Felder mit Zahlen füllen." };
  if (bands.some((b) => b.green > b.orange)) return { error: "Die Grün-Grenze muss unter der Rot-Grenze liegen." };
  await saveThresholds(t);
  return { ok: "Gespeichert. Die Ampeln werden beim nächsten Aktualisieren neu berechnet." };
}
