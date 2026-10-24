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
import { computePosition } from "@/lib/position";
import { toTx } from "@/lib/portfolio";
import { runCheck, type CheckResponse } from "@/lib/check-server";
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
  type: z.enum(["BUY", "SELL"]),
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
    type: formData.get("type") === "SELL" ? "SELL" : "BUY",
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

  let stock = await db.stock.findUnique({ where: { symbol: p.symbol }, include: { purchases: true } });
  if (!stock && p.type === "SELL") return { error: "Diese Aktie ist nicht in deinem Depot." };
  if (!stock) {
    let market;
    try {
      market = await fetchMarketData(p.symbol);
    } catch {
      return { error: `Zum Symbol ${p.symbol} wurden keine Kursdaten gefunden.` };
    }
    stock = await db.stock.create({
      data: { symbol: p.symbol, name: market.name, currency: market.currency, exchange: market.exchange, sector: market.sector, isin: p.isin },
      include: { purchases: true },
    });
  }

  // Bestand mit der neuen bzw. geänderten Buchung prüfen: nie mehr verkaufen als vorhanden
  const others = stock.purchases.filter((x) => x.id !== id).map(toTx);
  const after = computePosition([...others, { type: p.type, date: p.date, price: p.price, quantity: p.quantity, fees: p.fees }]);
  if (after.oversold) {
    return { error: `Am ${new Date(after.oversold.date).toLocaleDateString("de-DE")} wären ${after.oversold.missing.toLocaleString("de-DE")} Stück mehr verkauft als im Bestand.` };
  }

  const data = { type: p.type, stockId: stock.id, date: new Date(p.date), price: p.price, quantity: p.quantity, fees: p.fees, note: p.note };
  if (id) await db.purchase.update({ where: { id }, data });
  else await db.purchase.create({ data });

  // Kennzahlen direkt laden, damit die Position sofort im Dashboard erscheint (KI-Ausblick folgt beim nächsten Lauf)
  if (after.quantity > 0) {
    try {
      await refreshStock(stock.id, (await getFxRates())?.rates, { outlook: false });
    } catch {
      // Daten folgen beim nächsten Refresh
    }
  }
  revalidatePath("/", "layout");
  const label = p.type === "SELL" ? "Verkauf" : "Kauf";
  if (id) return { ok: `${label} aktualisiert.` };
  if (p.type === "SELL" && after.quantity === 0) return { ok: `Verkauf gespeichert – ${stock.name} ist komplett verkauft.` };
  return { ok: `${label} von ${stock.name} gespeichert.` };
}

export async function deletePurchase(_: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const id = Number(formData.get("id"));
  const tx = await db.purchase.findUnique({ where: { id }, include: { stock: { include: { purchases: true } } } });
  if (!tx) return { error: "Buchung nicht gefunden." };
  const remaining = tx.stock.purchases.filter((x) => x.id !== id);
  if (computePosition(remaining.map(toTx)).oversold) {
    return { error: "Löschen nicht möglich: Danach wären mehr Aktien verkauft als gekauft. Lösche zuerst den Verkauf." };
  }
  await db.purchase.delete({ where: { id } });
  if (!remaining.length) await db.stock.delete({ where: { id: tx.stockId } });
  revalidatePath("/", "layout");
  return { ok: "Gelöscht." };
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
    dcf: { discountRate: n("dcf.discountRate"), terminalGrowth: n("dcf.terminalGrowth"), maxGrowth: n("dcf.maxGrowth") },
  };
  const bands = [t.payoutEps, t.payoutFcf, t.debtToEquity, t.debtChangeYoY];
  if ([...bands, t.dividendCagr5].some((b) => !Number.isFinite(b.green) || !Number.isFinite(b.orange)))
    return { error: "Bitte alle Felder mit Zahlen füllen." };
  if (bands.some((b) => b.green > b.orange)) return { error: "Die Grün-Grenze muss unter der Rot-Grenze liegen." };
  if (Object.values(t.dcf).some((v) => !Number.isFinite(v) || v < 0)) return { error: "Bitte alle DCF-Annahmen als Prozentwerte eingeben." };
  if (t.dcf.discountRate <= t.dcf.terminalGrowth) return { error: "Der Abzinsungssatz muss über dem ewigen Wachstum liegen." };
  await saveThresholds(t);
  return { ok: "Gespeichert. Die Ampeln werden beim nächsten Aktualisieren neu berechnet." };
}

// --- Dividenden ---

const DividendSchema = z.object({
  stockId: z.coerce.number().int().positive("Bitte eine Aktie wählen"),
  exDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum fehlt"),
  netEur: z.coerce.number().nonnegative("Nettobetrag fehlt"),
  grossEur: z.coerce.number().nonnegative().optional(),
  quantity: z.coerce.number().positive().optional(),
  perShare: z.coerce.number().positive().optional(),
  note: z.string().trim().max(255).optional(),
});

const optNum = (v: FormDataEntryValue | null) => {
  const n = parseNum(v);
  return n === "" ? undefined : n;
};

export async function saveDividend(_: FormState, formData: FormData): Promise<FormState> {
  await requireAuth();
  const parsed = DividendSchema.safeParse({
    stockId: formData.get("stockId"),
    exDate: formData.get("exDate"),
    netEur: parseNum(formData.get("netEur")) || undefined,
    grossEur: optNum(formData.get("grossEur")),
    quantity: optNum(formData.get("quantity")),
    perShare: optNum(formData.get("perShare")),
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.grossEur !== undefined && d.netEur > d.grossEur) return { error: "Netto kann nicht höher sein als brutto." };
  const data = { status: "CONFIRMED" as const, quantity: d.quantity, perShare: d.perShare, grossEur: d.grossEur, netEur: d.netEur, note: d.note };
  await db.dividend.upsert({
    where: { stockId_exDate: { stockId: d.stockId, exDate: new Date(d.exDate) } },
    create: { stockId: d.stockId, exDate: new Date(d.exDate), ...data },
    update: data,
  });
  revalidatePath("/", "layout");
  return { ok: "Dividende gespeichert." };
}

export async function dismissDividend(formData: FormData) {
  await requireAuth();
  const stockId = Number(formData.get("stockId"));
  const exDate = new Date(String(formData.get("exDate")));
  await db.dividend.upsert({
    where: { stockId_exDate: { stockId, exDate } },
    create: { stockId, exDate, status: "DISMISSED" },
    update: { status: "DISMISSED" },
  });
  revalidatePath("/", "layout");
}

export async function deleteDividend(formData: FormData) {
  await requireAuth();
  await db.dividend.delete({ where: { id: Number(formData.get("id")) } });
  revalidatePath("/", "layout");
}

export async function restoreDividend(formData: FormData) {
  await requireAuth();
  const stockId = Number(formData.get("stockId"));
  const exDate = new Date(String(formData.get("exDate")));
  await db.dividend.deleteMany({ where: { stockId, exDate, status: "DISMISSED" } });
  revalidatePath("/", "layout");
}

// --- Aktien Check ---

export async function checkStock(_: CheckResponse | undefined, formData: FormData): Promise<CheckResponse> {
  await requireAuth();
  const query = String(formData.get("query") ?? "").trim();
  if (query.length < 2) return { listings: [], error: "Bitte eine ISIN oder ein Kürzel eingeben." };
  const symbol = String(formData.get("symbol") ?? "") || undefined;
  return runCheck(query, symbol);
}
