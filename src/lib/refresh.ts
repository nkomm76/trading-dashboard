import "server-only";
import { db } from "./db";
import { fetchMarketData } from "./data/yahoo";
import { fetchSecQuarterly, lookupCik } from "./data/sec";
import { convert, fetchEcbRates } from "./data/fx";
import type { MarketData, StatementRow } from "./data/types";
import { annualTotals, computeMetrics, fcfOf } from "./metrics";
import { evaluateOutlook } from "./outlook";
import { rate } from "./rating";
import { getThresholds } from "./settings";

const today = () => new Date(new Date().toISOString().slice(0, 10));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Füllt Lücken in Yahoo-Quartalsdaten mit SEC-Werten (nur US). */
function mergeRows(base: StatementRow[], extra: StatementRow[]): StatementRow[] {
  const map = new Map(base.map((r) => [r.date, { ...r }]));
  for (const e of extra) {
    const r = map.get(e.date);
    if (!r) continue; // nur bestehende Perioden ergänzen, keine neuen anlegen
    r.dilutedEPS ??= e.dilutedEPS;
    r.stockholdersEquity ??= e.stockholdersEquity;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildSeries(market: MarketData) {
  return {
    dividends: market.dividends,
    dividendsByYear: [...annualTotals(market.dividends)].map(([year, total]) => ({ year, total })),
    quarterly: market.quarterly.map((r) => ({ date: r.date, eps: r.dilutedEPS ?? null, fcf: fcfOf(r) ?? null })),
    annual: market.annual.map((r) => ({ date: r.date, eps: r.dilutedEPS ?? null, fcf: fcfOf(r) ?? null })),
  };
}

export async function refreshStock(stockId: number, rates: Record<string, number> | undefined, opts: { outlook: boolean }) {
  const stock = await db.stock.findUniqueOrThrow({ where: { id: stockId }, include: { purchases: true } });
  const market = await fetchMarketData(stock.symbol);

  let cik = stock.cik ?? undefined;
  if (!stock.symbol.includes(".") && market.currency === "USD") {
    cik ??= await lookupCik(stock.symbol).catch(() => undefined);
    if (cik) market.quarterly = mergeRows(market.quarterly, await fetchSecQuarterly(cik).catch(() => []));
  }

  const qty = stock.purchases.reduce((s, p) => s + Number(p.quantity), 0);
  const avgCost = qty > 0 ? stock.purchases.reduce((s, p) => s + Number(p.price) * Number(p.quantity), 0) / qty : undefined;

  const metrics = computeMetrics({
    market,
    avgCost,
    toTradingCurrency: (v) => (rates && market.financialCurrency ? convert(v, market.financialCurrency, market.currency, rates) : undefined),
  });

  const date = today();
  await db.stock.update({
    where: { id: stockId },
    data: { name: market.name, currency: market.currency, sector: market.sector ?? stock.sector, exchange: market.exchange ?? stock.exchange, cik: cik ?? null },
  });
  await db.snapshot.upsert({
    where: { stockId_date: { stockId, date } },
    create: { stockId, date, metrics, series: buildSeries(market) },
    update: { metrics, series: buildSeries(market) },
  });

  // KI-Ausblick nur einmal je neuer Berichtsperiode (und nur für Berichte der letzten ~7 Monate)
  if (opts.outlook && metrics.latestPeriod && Date.now() - Date.parse(metrics.latestPeriod) < 210 * 86_400_000) {
    const exists = await db.outlook.findUnique({ where: { stockId_period: { stockId, period: metrics.latestPeriod } } });
    if (!exists) {
      // Ein Fehler der KI (z. B. ungültiger Schlüssel) darf die Kennzahlen und die Ampel nicht blockieren
      const o = await evaluateOutlook({ name: market.name, symbol: stock.symbol, period: metrics.latestPeriod }).catch((e) => {
        console.error(`KI-Ausblick ${stock.symbol}:`, e instanceof Error ? e.message : e);
        return undefined;
      });
      if (o) {
        await db.outlook.create({
          data: { stockId, period: metrics.latestPeriod, status: o.status, dividendCut: o.dividendCut, summary: o.summary, risks: o.risks, sources: o.sources, model: o.model },
        });
      }
    }
  }

  const outlook = await db.outlook.findFirst({ where: { stockId }, orderBy: { period: "desc" } });
  const { light, reasons } = rate(metrics, market.sector ?? stock.sector ?? undefined, outlook ?? undefined, await getThresholds());
  await db.rating.upsert({
    where: { stockId_date: { stockId, date } },
    create: { stockId, date, light, reasons },
    update: { light, reasons },
  });
}

export async function refreshAll(opts: { outlook: boolean } = { outlook: true }) {
  const log = await db.refreshLog.create({ data: {} });
  const errors: string[] = [];

  const fx = await fetchEcbRates().catch(() => undefined);
  if (fx) {
    const value = { rates: fx.value, asOf: fx.asOf };
    await db.setting.upsert({ where: { key: "fx" }, create: { key: "fx", value }, update: { value } });
  }
  const rates = fx?.value ?? undefined;

  const stocks = await db.stock.findMany({ where: { purchases: { some: {} } }, select: { id: true, symbol: true } });
  for (const s of stocks) {
    try {
      await refreshStock(s.id, rates, opts);
    } catch (e) {
      errors.push(`${s.symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(500); // Quellen schonen
  }

  await db.refreshLog.update({
    where: { id: log.id },
    data: { finishedAt: new Date(), ok: errors.length === 0, message: errors.length ? errors.join("\n") : `${stocks.length} Werte aktualisiert` },
  });
  return { count: stocks.length, errors };
}
