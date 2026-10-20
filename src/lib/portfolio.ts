import "server-only";
import { db } from "./db";
import type { Metrics } from "./metrics";
import type { LightColor, Reason } from "./rating";
import { getFxRates } from "./settings";
import { toEur } from "./data/fx";
import { computePosition, type Tx } from "./position";

export type Position = {
  stockId: number;
  symbol: string;
  name: string;
  currency: string;
  sector?: string;
  quantity: number;
  avgCost: number; // Handelswährung
  costEur?: number; // inkl. anteiliger Kaufgebühren
  valueEur?: number;
  gainEur?: number;
  realizedEur?: number; // aus Verkäufen, nach Gebühren
  annualDividendEur?: number;
  metrics: Metrics;
  snapshotDate?: string;
  light: LightColor;
  reasons: Reason[];
  outlookStatus?: string;
};

export const toTx = (p: { id: number; type: "BUY" | "SELL"; date: Date; price: unknown; quantity: unknown; fees: unknown }): Tx => ({
  id: p.id,
  type: p.type,
  date: p.date.toISOString().slice(0, 10),
  price: Number(p.price),
  quantity: Number(p.quantity),
  fees: Number(p.fees),
});

export async function loadPortfolio() {
  const fx = await getFxRates();
  const rates = fx?.rates;
  const stocks = await db.stock.findMany({
    where: { purchases: { some: {} } },
    include: {
      purchases: true,
      snapshots: { orderBy: { date: "desc" }, take: 1 },
      ratings: { orderBy: { date: "desc" }, take: 1 },
      outlooks: { orderBy: { period: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  const all: Position[] = stocks.map((s) => {
    const pos = computePosition(s.purchases.map(toTx));
    const metrics = (s.snapshots[0]?.metrics ?? {}) as Metrics;
    const eur = (v: number | undefined) => (v === undefined || !rates ? undefined : toEur(v, s.currency, rates));

    // Umrechnung zum aktuellen Wechselkurs (Kurs am Kauftag wird nicht erfasst)
    const costTradingEur = eur(pos.costTrading);
    const costEur = pos.quantity > 0 && costTradingEur !== undefined ? costTradingEur + pos.openFeesEur : undefined;
    const valueEur = pos.quantity > 0 && metrics.price ? eur(metrics.price.value * pos.quantity) : undefined;
    const annualDividendEur = pos.quantity > 0 && metrics.dividendTTM ? eur(metrics.dividendTTM.value * pos.quantity) : undefined;
    const realizedTradingEur = pos.soldQuantity > 0 ? eur(pos.realizedTrading) : undefined;

    return {
      stockId: s.id,
      symbol: s.symbol,
      name: s.name,
      currency: s.currency,
      sector: s.sector ?? undefined,
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      costEur,
      valueEur,
      gainEur: valueEur !== undefined && costEur !== undefined ? valueEur - costEur : undefined,
      realizedEur: realizedTradingEur === undefined ? undefined : realizedTradingEur - pos.realizedFeesEur,
      annualDividendEur,
      metrics,
      snapshotDate: s.snapshots[0]?.date.toISOString().slice(0, 10),
      light: (s.ratings[0]?.light ?? "GREY") as LightColor,
      reasons: (s.ratings[0]?.reasons ?? []) as Reason[],
      outlookStatus: s.outlooks[0]?.status,
    };
  });

  const positions = all.filter((p) => p.quantity > 0);
  const closed = all.filter((p) => p.quantity === 0);

  const sum = (list: Position[], k: "costEur" | "valueEur" | "annualDividendEur") => {
    const vals = list.map((p) => p[k]);
    return vals.length && vals.every((v) => v !== undefined) ? vals.reduce((a, v) => a + v!, 0) : undefined;
  };
  const totalValue = sum(positions, "valueEur");
  const totalCost = sum(positions, "costEur");
  const totalDividend = sum(positions, "annualDividendEur");
  const withSales = all.filter((p) => p.realizedEur !== undefined || p.quantity === 0);
  const realized = withSales.length && withSales.every((p) => p.realizedEur !== undefined) ? withSales.reduce((a, p) => a + p.realizedEur!, 0) : undefined;

  return {
    positions,
    closed,
    fxAsOf: fx?.asOf,
    totals: {
      value: totalValue,
      cost: totalCost,
      gain: totalValue !== undefined && totalCost !== undefined ? totalValue - totalCost : undefined,
      realized,
      hasSales: withSales.length > 0,
      dividend: totalDividend,
      yield: totalDividend !== undefined && totalValue ? totalDividend / totalValue : undefined,
      yieldOnCost: totalDividend !== undefined && totalCost ? totalDividend / totalCost : undefined,
    },
  };
}
