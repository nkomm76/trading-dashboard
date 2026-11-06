import "server-only";
import { db } from "./db";
import type { Metrics } from "./metrics";
import type { Sourced } from "./data/types";
import type { LightColor, Reason } from "./rating";
import { getFxRates } from "./settings";
import { localToday } from "./format";
import { toEur } from "./data/fx";
import { computePosition, type Tx } from "./position";
import { BUCKETS, holdingPeriod, type AssetClass, type Bucket, type Holding } from "./wealth";

export type Position = {
  stockId: number;
  symbol: string;
  name: string;
  currency: string;
  sector?: string;
  assetClass: AssetClass;
  /** Nur Krypto: wie viel länger als ein Jahr gehalten ist (FIFO) */
  holding?: Holding;
  quantity: number;
  avgCost: number; // EUR (Kaufkurse laut Abrechnung)
  priceEur?: Sourced; // letzter Kurs, zum aktuellen EZB-Kurs in Euro
  fcfEur?: Sourced; // Free Cashflow (12 Monate) aus der Bilanzwährung in Euro
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

  const today = localToday();
  const all: Position[] = stocks.map((s) => {
    const txs = s.purchases.map(toTx);
    const pos = computePosition(txs);
    const metrics = (s.snapshots[0]?.metrics ?? {}) as Metrics;
    const eur = (v: number | undefined) => (v === undefined || !rates ? undefined : toEur(v, s.currency, rates));

    // Käufe und Verkäufe sind in Euro erfasst; nur Kurs und Dividende kommen in Handelswährung und werden umgerechnet
    const costEur = pos.quantity > 0 ? pos.cost + pos.openFeesEur : undefined;
    const valueEur = pos.quantity > 0 && metrics.price ? eur(metrics.price.value * pos.quantity) : undefined;
    // Krypto, thesaurierende ETFs und Aktien ohne (oder mit eingestellter) Dividende: „keine Ausschüttung“ zählt als 0
    // statt als fehlender Wert – sonst blieben Dividendensumme und Renditen des ganzen Depots leer
    const status = metrics.dividendStatus?.value;
    const noPayout =
      s.assetClass === "CRYPTO" ||
      (s.assetClass === "ETF" && metrics.price !== undefined) ||
      (s.assetClass === "STOCK" && (status === "none" || status === "suspended"));
    const annualDividendEur =
      pos.quantity > 0 && metrics.dividendTTM ? eur(metrics.dividendTTM.value * pos.quantity) : pos.quantity > 0 && noPayout ? 0 : undefined;
    const priceEur = metrics.price && eur(metrics.price.value);
    const fcfCur = metrics.financialCurrency ?? s.currency;
    const fcfEur = metrics.fcfTTM && rates ? toEur(metrics.fcfTTM.value, fcfCur, rates) : undefined;

    return {
      stockId: s.id,
      symbol: s.symbol,
      name: s.name,
      currency: s.currency,
      sector: s.sector ?? undefined,
      assetClass: s.assetClass,
      holding: s.assetClass === "CRYPTO" && pos.quantity > 0 ? holdingPeriod(txs, today) : undefined,
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      priceEur: metrics.price && priceEur !== undefined ? { ...metrics.price, value: priceEur, note: `aus ${s.currency} zum EZB-Kurs umgerechnet` } : undefined,
      fcfEur: metrics.fcfTTM && fcfEur !== undefined ? { ...metrics.fcfTTM, value: fcfEur, note: `aus ${fcfCur} zum EZB-Kurs umgerechnet` } : undefined,
      costEur,
      valueEur,
      gainEur: valueEur !== undefined && costEur !== undefined ? valueEur - costEur : undefined,
      realizedEur: pos.soldQuantity > 0 ? pos.realized - pos.realizedFeesEur : undefined,
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

  // Barbestand: zuletzt eingetragener Kontostand
  const cashRow = await db.cashBalance.findFirst({ orderBy: { date: "desc" } });
  const cash = cashRow ? { amount: Number(cashRow.amount), date: cashRow.date.toISOString().slice(0, 10) } : undefined;
  const cashEur = cash?.amount ?? 0;
  // Ohne Wertpapiere zählt nur der Barbestand; fehlt bei einer Position der Kurs, bleibt die Summe offen
  const securities = positions.length ? totalValue : 0;
  const total = securities !== undefined ? securities + cashEur : undefined;
  const byClass = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const p of positions) byClass[p.assetClass] += p.valueEur ?? 0;
  byClass.CASH = cashEur;

  return {
    positions,
    closed,
    fxAsOf: fx?.asOf,
    cash,
    byClass,
    totals: {
      total,
      cash: cashEur,
      cashShare: total ? cashEur / total : undefined,
      yieldTotal: totalDividend !== undefined && total ? totalDividend / total : undefined,
      value: securities,
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
