import "server-only";
import { cache } from "react";
import { db } from "./db";
import { toEur } from "./data/fx";
import type { DividendPayment } from "./data/types";
import { suggestDividends } from "./dividends";
import { toTx } from "./portfolio";
import { getFxRates } from "./settings";

export type SuggestionRow = {
  stockId: number;
  symbol: string;
  name: string;
  currency: string;
  exDate: string;
  quantity: number;
  perShare: number;
  grossTrading: number;
  grossEurEstimate?: number; // zum aktuellen Wechselkurs
};

export type ReceivedRow = {
  id: number;
  stockId: number;
  symbol: string;
  name: string;
  exDate: string;
  quantity?: number;
  grossEur?: number;
  netEur?: number;
  note?: string;
};

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

/** Einmal je Anfrage: Layout (Zahl im Menü) und Übersicht teilen sich das Ergebnis. */
export const loadDividends = cache(async () => {
  const rates = (await getFxRates())?.rates;
  const stocks = await db.stock.findMany({
    where: { purchases: { some: {} } },
    // Nur die Zeitreihen des letzten Snapshots, nicht die Kennzahlen
    include: { purchases: true, dividends: true, snapshots: { orderBy: { date: "desc" }, take: 1, select: { series: true } } },
  });

  const suggestions: SuggestionRow[] = [];
  const received: ReceivedRow[] = [];
  const dismissed: { stockId: number; name: string; exDate: string }[] = [];
  const stockOptions = stocks.map((s) => ({ id: s.id, name: s.name, symbol: s.symbol })).sort((a, b) => a.name.localeCompare(b.name, "de"));

  for (const s of stocks) {
    const payments = ((s.snapshots[0]?.series as { dividends?: DividendPayment[] } | undefined)?.dividends ?? []) as DividendPayment[];
    const known = new Set(s.dividends.map((d) => d.exDate.toISOString().slice(0, 10)));
    for (const sug of suggestDividends(s.purchases.map(toTx), payments, known)) {
      suggestions.push({
        stockId: s.id,
        symbol: s.symbol,
        name: s.name,
        currency: s.currency,
        ...sug,
        grossEurEstimate: rates ? toEur(sug.grossTrading, s.currency, rates) : undefined,
      });
    }
    for (const d of s.dividends) {
      if (d.status !== "CONFIRMED") {
        dismissed.push({ stockId: s.id, name: s.name, exDate: d.exDate.toISOString().slice(0, 10) });
        continue;
      }
      received.push({
        id: d.id,
        stockId: s.id,
        symbol: s.symbol,
        name: s.name,
        exDate: d.exDate.toISOString().slice(0, 10),
        quantity: num(d.quantity),
        grossEur: num(d.grossEur),
        netEur: num(d.netEur),
        note: d.note ?? undefined,
      });
    }
  }

  suggestions.sort((a, b) => b.exDate.localeCompare(a.exDate) || a.name.localeCompare(b.name, "de"));
  received.sort((a, b) => b.exDate.localeCompare(a.exDate));

  // Summen je Jahr und je Monat (laufendes Jahr), netto und brutto
  const byYear = new Map<number, { net: number; gross: number }>();
  const thisYear = new Date().getFullYear();
  const byMonth = Array.from({ length: 12 }, (_, m) => ({ month: m + 1, net: 0 }));
  for (const r of received) {
    const y = Number(r.exDate.slice(0, 4));
    const e = byYear.get(y) ?? { net: 0, gross: 0 };
    e.net += r.netEur ?? 0;
    e.gross += r.grossEur ?? 0;
    byYear.set(y, e);
    if (y === thisYear) byMonth[Number(r.exDate.slice(5, 7)) - 1].net += r.netEur ?? 0;
  }
  const years = [...byYear].map(([year, v]) => ({ year, ...v })).sort((a, b) => a.year - b.year);

  return {
    suggestions,
    received,
    dismissed: dismissed.sort((a, b) => b.exDate.localeCompare(a.exDate)),
    stockOptions,
    years,
    byMonth,
    thisYear,
    totals: {
      thisYear: byYear.get(thisYear)?.net ?? 0,
      lastYear: byYear.get(thisYear - 1)?.net ?? 0,
      all: received.reduce((a, r) => a + (r.netEur ?? 0), 0),
    },
  };
});

export async function countOpenSuggestions() {
  return (await loadDividends()).suggestions.length;
}
