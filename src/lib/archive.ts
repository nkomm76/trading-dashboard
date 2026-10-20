import "server-only";
import { db } from "./db";
import { toEur } from "./data/fx";
import { closedCycles } from "./position";
import { toTx } from "./portfolio";
import { getFxRates } from "./settings";

export type ArchiveRow = {
  key: string;
  stockId: number;
  symbol: string;
  name: string;
  currency: string;
  firstBuy: string;
  buyCount: number;
  avgBuyPrice: number;
  lastSell: string;
  sellCount: number;
  avgSellPrice: number;
  quantity: number;
  holdingDays: number;
  gainEur?: number; // Kursgewinn nach allen Gebühren
  dividendsEur: number; // netto, erfasste Zahlungen im Haltezeitraum
  totalEur?: number;
  returnPct?: number; // (Kursgewinn + Dividenden) / Einstand
};

export async function loadArchive() {
  const fx = await getFxRates();
  const rates = fx?.rates;
  const stocks = await db.stock.findMany({
    where: { purchases: { some: { type: "SELL" } } },
    include: { purchases: true, dividends: { where: { status: "CONFIRMED" } } },
  });

  const rows: ArchiveRow[] = [];
  for (const s of stocks) {
    const eur = (v: number) => (rates ? toEur(v, s.currency, rates) : undefined);
    for (const c of closedCycles(s.purchases.map(toTx))) {
      // Dividenden mit Ex-Tag im Haltezeitraum (am Verkaufstag ex zählt noch)
      const dividendsEur = s.dividends
        .filter((d) => {
          const ex = d.exDate.toISOString().slice(0, 10);
          return ex > c.firstBuy && ex <= c.lastSell;
        })
        .reduce((a, d) => a + Number(d.netEur ?? 0), 0);
      const realized = eur(c.realizedTrading);
      const gainEur = realized === undefined ? undefined : realized - c.feesEur;
      const costEur = eur(c.costTrading);
      const totalEur = gainEur === undefined ? undefined : gainEur + dividendsEur;
      rows.push({
        key: `${s.id}-${c.firstBuy}`,
        stockId: s.id,
        symbol: s.symbol,
        name: s.name,
        currency: s.currency,
        firstBuy: c.firstBuy,
        buyCount: c.txs.filter((t) => t.type === "BUY").length,
        avgBuyPrice: c.avgBuyPrice,
        lastSell: c.lastSell,
        sellCount: c.txs.filter((t) => t.type === "SELL").length,
        avgSellPrice: c.avgSellPrice,
        quantity: c.boughtQuantity,
        holdingDays: Math.round((Date.parse(c.lastSell) - Date.parse(c.firstBuy)) / 86_400_000),
        gainEur,
        dividendsEur,
        totalEur,
        returnPct: totalEur !== undefined && costEur ? totalEur / costEur : undefined,
      });
    }
  }
  rows.sort((a, b) => b.lastSell.localeCompare(a.lastSell));

  const sumOf = (k: "gainEur" | "totalEur") => (rows.every((r) => r[k] !== undefined) ? rows.reduce((a, r) => a + r[k]!, 0) : undefined);
  return {
    rows,
    fxAsOf: fx?.asOf,
    totals: { gain: sumOf("gainEur"), dividends: rows.reduce((a, r) => a + r.dividendsEur, 0), total: sumOf("totalEur") },
  };
}
