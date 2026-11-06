import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/session";
import { db } from "@/lib/db";
import { toTx } from "@/lib/portfolio";
import { eurCloses } from "@/lib/ema-server";
import { wealthHistory } from "@/lib/wealth";

const DAY = 86_400_000;
// Kurse ändern sich nur einmal je Handelstag sichtbar: Ergebnis 30 Minuten halten, solange Buchungen und Kontostände gleich sind
const cache = new Map<string, { at: number; body: unknown }>();

export async function GET() {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [stocks, cash] = await Promise.all([
    db.stock.findMany({ where: { purchases: { some: {} } }, include: { purchases: true } }),
    db.cashBalance.findMany({ orderBy: { date: "asc" } }),
  ]);
  const inputs = stocks.map((s) => ({ symbol: s.symbol, assetClass: s.assetClass, txs: s.purchases.map(toTx) }));
  const cashRows = cash.map((c) => ({ date: c.date.toISOString().slice(0, 10), amount: Number(c.amount) }));
  const key = JSON.stringify([inputs, cashRows]);
  const hit = cache.get(key);
  // Nie im Browser zwischenspeichern: die Antwort ändert sich mit jeder Buchung und jedem Kontostand
  const headers = { "Cache-Control": "no-store" };
  if (hit && Date.now() - hit.at < 30 * 60_000) return NextResponse.json(hit.body, { headers });

  const first = inputs.flatMap((i) => i.txs.map((t) => t.date)).sort()[0];
  const from = first ? new Date(Date.parse(first) - 7 * DAY) : new Date();
  // Über zwei Jahre reichen Wochenkurse und halten die Linie ruhig
  const interval = Date.now() - from.getTime() > 2 * 365 * DAY ? "1wk" : "1d";
  const closes = await Promise.all(inputs.map((i) => eurCloses(i.symbol, from, interval)));
  const missing = inputs.filter((_, n) => !closes[n].length).map((i) => i.symbol);

  const today = new Date().toISOString().slice(0, 10);
  const points = wealthHistory(
    inputs.map((i, n) => ({ assetClass: i.assetClass, txs: i.txs, closes: closes[n] })),
    cashRows,
    today,
  );
  const body = { points, cashSince: cashRows[0]?.date, missing };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, { headers });
}
