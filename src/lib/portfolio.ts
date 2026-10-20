import "server-only";
import { db } from "./db";
import type { Metrics } from "./metrics";
import type { LightColor, Reason } from "./rating";
import { getFxRates } from "./settings";
import { toEur } from "./data/fx";

export type Position = {
  stockId: number;
  symbol: string;
  name: string;
  currency: string;
  sector?: string;
  quantity: number;
  avgCost: number; // Handelswährung
  costEur?: number; // inkl. Gebühren
  valueEur?: number;
  gainEur?: number;
  annualDividendEur?: number;
  metrics: Metrics;
  snapshotDate?: string;
  light: LightColor;
  reasons: Reason[];
  outlookStatus?: string;
};

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

  const positions: Position[] = stocks.map((s) => {
    const quantity = s.purchases.reduce((a, p) => a + Number(p.quantity), 0);
    const gross = s.purchases.reduce((a, p) => a + Number(p.price) * Number(p.quantity), 0);
    const fees = s.purchases.reduce((a, p) => a + Number(p.fees), 0);
    const avgCost = quantity ? gross / quantity : 0;
    const metrics = (s.snapshots[0]?.metrics ?? {}) as Metrics;
    const eur = (v: number | undefined) => (v === undefined || !rates ? undefined : toEur(v, s.currency, rates));

    // Kaufkosten zum aktuellen Wechselkurs (Kurs bei Kauf wird nicht erfasst)
    const costTrading = eur(gross);
    const costEur = costTrading === undefined ? undefined : costTrading + fees;
    const valueEur = metrics.price ? eur(metrics.price.value * quantity) : undefined;
    const annualDividendEur = metrics.dividendTTM ? eur(metrics.dividendTTM.value * quantity) : undefined;

    return {
      stockId: s.id,
      symbol: s.symbol,
      name: s.name,
      currency: s.currency,
      sector: s.sector ?? undefined,
      quantity,
      avgCost,
      costEur,
      valueEur,
      gainEur: valueEur !== undefined && costEur !== undefined ? valueEur - costEur : undefined,
      annualDividendEur,
      metrics,
      snapshotDate: s.snapshots[0]?.date.toISOString().slice(0, 10),
      light: (s.ratings[0]?.light ?? "GREY") as LightColor,
      reasons: (s.ratings[0]?.reasons ?? []) as Reason[],
      outlookStatus: s.outlooks[0]?.status,
    };
  });

  const sum = (k: "costEur" | "valueEur" | "annualDividendEur") => {
    const vals = positions.map((p) => p[k]);
    return vals.length && vals.every((v) => v !== undefined) ? vals.reduce((a, v) => a + v!, 0) : undefined;
  };
  const totalValue = sum("valueEur");
  const totalCost = sum("costEur");
  const totalDividend = sum("annualDividendEur");

  return {
    positions,
    fxAsOf: fx?.asOf,
    totals: {
      value: totalValue,
      cost: totalCost,
      gain: totalValue !== undefined && totalCost !== undefined ? totalValue - totalCost : undefined,
      dividend: totalDividend,
      yield: totalDividend !== undefined && totalValue ? totalDividend / totalValue : undefined,
      yieldOnCost: totalDividend !== undefined && totalCost ? totalDividend / totalCost : undefined,
    },
  };
}
