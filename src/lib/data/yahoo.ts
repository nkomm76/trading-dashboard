import "server-only";
import YahooFinance from "yahoo-finance2";
import type { MarketData, PricePoint, StatementRow } from "./types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SOURCE = "Yahoo Finance";

const day = (d: Date | string | number) => new Date(d).toISOString().slice(0, 10);

function toRows(rows: Record<string, unknown>[]): StatementRow[] {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return rows
    .filter((r) => r.date)
    .map((r) => ({
      date: day(r.date as Date),
      dilutedEPS: num(r.dilutedEPS),
      operatingCashFlow: num(r.operatingCashFlow),
      capitalExpenditure: num(r.capitalExpenditure),
      freeCashFlow: num(r.freeCashFlow),
      totalDebt: num(r.totalDebt),
      stockholdersEquity: num(r.stockholdersEquity),
      cashDividendsPaid: num(r.cashDividendsPaid),
      totalRevenue: num(r.totalRevenue),
      dilutedAverageShares: num(r.dilutedAverageShares),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type SearchHit = { symbol: string; name: string; exchange?: string; type?: string };

/** Aktien und ETFs; mit crypto auch Kryptowährungen (Euro-Paare wie BTC-EUR zuerst). */
export async function searchStocks(query: string, opts: { crypto?: boolean } = {}): Promise<SearchHit[]> {
  const types = opts.crypto ? ["EQUITY", "ETF", "CRYPTOCURRENCY"] : ["EQUITY", "ETF"];
  const res = await yf.search(query, { quotesCount: opts.crypto ? 15 : 10, newsCount: 0 });
  const toHits = (quotes: typeof res.quotes) =>
    quotes
      .filter((q) => "symbol" in q && types.includes(String(q.quoteType)))
      .map((q) => {
        const r = q as { symbol: string; longname?: string; shortname?: string; exchDisp?: string; quoteType?: string };
        return { symbol: r.symbol, name: r.longname ?? r.shortname ?? r.symbol, exchange: r.exchDisp, type: r.quoteType };
      });
  const hits = toHits(res.quotes);
  if (opts.crypto) {
    // Die Namenssuche liefert meist nur Dollar-Paare (BTC-USD); das Euro-Paar findet Yahoo nur über sein Kürzel
    const bases = [...new Set(hits.filter((h) => h.type === "CRYPTOCURRENCY").map((h) => h.symbol.split("-")[0]))]
      .filter((b) => !hits.some((h) => h.symbol === `${b}-EUR`))
      .slice(0, 3);
    const extra = await Promise.all(
      bases.map((b) =>
        yf
          .search(`${b}-EUR`, { quotesCount: 3, newsCount: 0 })
          .then((r) => toHits(r.quotes).filter((h) => h.symbol === `${b}-EUR`))
          .catch(() => []),
      ),
    );
    hits.push(...extra.flat());
  }
  const rank = (h: SearchHit) => (h.type !== "CRYPTOCURRENCY" ? 0 : h.symbol.endsWith("-EUR") ? 0 : 1);
  return hits.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i).map((x) => x.h);
}

export async function fetchMarketData(symbol: string): Promise<MarketData> {
  const now = new Date();
  const tenYearsAgo = new Date(now.getFullYear() - 11, 0, 1);
  const fiveYearsAgo = new Date(now.getFullYear() - 5, 0, 1);

  const [quote, chart, summary, quarterly, annual] = await Promise.all([
    yf.quote(symbol),
    yf.chart(symbol, { period1: tenYearsAgo, interval: "1mo", events: "div" }).catch(() => null),
    yf
      .quoteSummary(symbol, { modules: ["financialData", "calendarEvents", "assetProfile"] })
      .catch(() => null),
    yf
      .fundamentalsTimeSeries(symbol, { period1: fiveYearsAgo, type: "quarterly", module: "all" })
      .catch(() => []),
    yf
      .fundamentalsTimeSeries(symbol, { period1: tenYearsAgo, type: "annual", module: "all" })
      .catch(() => []),
  ]);

  const priceTime = quote.regularMarketTime ? day(quote.regularMarketTime) : day(now);
  const exDiv = summary?.calendarEvents?.exDividendDate;

  return {
    symbol,
    name: quote.longName ?? quote.shortName ?? symbol,
    currency: quote.currency ?? "USD",
    quoteType: quote.quoteType ?? undefined,
    financialCurrency: summary?.financialData?.financialCurrency ?? undefined,
    exchange: quote.fullExchangeName ?? quote.exchange,
    sector: summary?.assetProfile?.sector ?? undefined,
    price:
      typeof quote.regularMarketPrice === "number"
        ? { value: quote.regularMarketPrice, source: SOURCE, asOf: priceTime }
        : undefined,
    epsTTM:
      typeof quote.epsTrailingTwelveMonths === "number"
        ? { value: quote.epsTrailingTwelveMonths, source: SOURCE, asOf: day(now), period: "TTM" }
        : undefined,
    sharesOutstanding: typeof quote.sharesOutstanding === "number" && quote.sharesOutstanding > 0 ? quote.sharesOutstanding : undefined,
    nextExDividend:
      exDiv && new Date(exDiv) > now ? { value: day(exDiv), source: SOURCE, asOf: day(now) } : undefined,
    dividends: (chart?.events?.dividends ?? [])
      .map((d) => ({ date: day(d.date), amount: d.amount }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    monthlyCloses: (chart?.quotes ?? [])
      .filter((q) => typeof q.close === "number")
      .map((q) => ({ date: day(q.date), close: q.close as number })),
    quarterly: toRows(quarterly as Record<string, unknown>[]),
    annual: toRows(annual as Record<string, unknown>[]),
    fetchedAt: now.toISOString(),
  };
}

export type ChartRange = "1d" | "1w" | "6m" | "1y" | "5y";

// Intervall je Zeitraum: intraday fein, über Jahre wöchentlich
const RANGES: Record<ChartRange, { days: number; interval: "5m" | "30m" | "1d" | "1wk" }> = {
  "1d": { days: 7, interval: "5m" }, // Puffer für Wochenenden und Feiertage, unten auf den letzten Handelstag gekürzt
  "1w": { days: 7, interval: "30m" },
  "6m": { days: 183, interval: "1d" },
  "1y": { days: 365, interval: "1d" },
  "5y": { days: 5 * 365 + 2, interval: "1wk" },
};

type TimedPoint = PricePoint & { time: number };

/**
 * Tageskerzen enden oft am Vortag: aktuellen Kurs als letzten Punkt anhängen.
 * Bei Tageskerzen, die den heutigen Tag schon enthalten, nur deren Schlusskurs aktualisieren – sonst zählt heute doppelt.
 */
function appendLatest(points: TimedPoint[], meta: { regularMarketPrice?: number; regularMarketTime?: Date }, daily = false) {
  const { regularMarketPrice: lastPrice, regularMarketTime: lastTime } = meta;
  if (typeof lastPrice !== "number" || !lastTime) return;
  const t = new Date(lastTime).getTime();
  const prev = points[points.length - 1];
  if (prev && daily && day(prev.time) === day(t)) prev.close = lastPrice;
  else if (!prev || t > prev.time) points.push({ date: new Date(t).toISOString(), time: t, close: lastPrice });
}

export async function fetchPriceHistory(symbol: string, range: ChartRange): Promise<{ currency?: string; points: (PricePoint & { time: number })[] }> {
  const { days, interval } = RANGES[range];
  // Nur reguläre Handelszeit, ohne vor- und nachbörslichen Handel
  const chart = await yf.chart(symbol, { period1: new Date(Date.now() - days * 86_400_000), interval, includePrePost: false });
  let points = chart.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => ({ date: new Date(q.date).toISOString(), time: new Date(q.date).getTime(), close: q.close as number }));
  appendLatest(points, chart.meta, interval === "1d");
  if (range === "1d" && points.length) {
    const tz = chart.meta.exchangeTimezoneName;
    const localDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: tz });
    const last = localDay(points[points.length - 1].time);
    points = points.filter((p) => localDay(p.time) === last);
  }
  return { currency: chart.meta.currency, points };
}

/** Tagesschlusskurse, dividendenbereinigt (adjclose), ab dem angegebenen Datum. */
/** Schlusskurse wie im Kurschart (nicht dividendenbereinigt) für gleitende Durchschnitte; täglich inkl. aktuellem Kurs. */
export async function fetchCloses(symbol: string, from: Date, interval: "1d" | "1wk"): Promise<{ currency?: string; points: TimedPoint[] }> {
  const chart = await yf.chart(symbol, { period1: from, interval, includePrePost: false });
  const points = chart.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => ({ date: new Date(q.date).toISOString(), time: new Date(q.date).getTime(), close: q.close as number }));
  // Die letzte Wochenkerze enthält den aktuellen Kurs schon
  if (interval === "1d") appendLatest(points, chart.meta, true);
  return { currency: chart.meta.currency, points };
}

export async function fetchAdjustedDaily(symbol: string, from: Date): Promise<PricePoint[]> {
  const chart = await yf.chart(symbol, { period1: from, interval: "1d" });
  return chart.quotes
    .map((q) => ({ date: day(q.date), close: typeof q.adjclose === "number" ? q.adjclose : q.close }))
    .filter((p): p is PricePoint => typeof p.close === "number" && p.close > 0);
}

/** Kurse für einen frei gewählten Ausschnitt (Zoom); das Intervall richtet sich nach Länge und Alter des Ausschnitts. */
export async function fetchPriceWindow(symbol: string, from: number, to: number): Promise<{ currency?: string; points: (PricePoint & { time: number })[] }> {
  const span = to - from;
  const age = Date.now() - from;
  const DAY = 86_400_000;
  // Intraday-Kurse gibt Yahoo nur für etwa 60 Tage zurück
  const interval = age <= 55 * DAY && span <= 3 * DAY ? "5m" : age <= 55 * DAY && span <= 45 * DAY ? "30m" : span <= 3 * 365 * DAY ? "1d" : "1wk";
  const chart = await yf.chart(symbol, { period1: new Date(from), period2: new Date(to + DAY), interval, includePrePost: false });
  const points = chart.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => ({ date: new Date(q.date).toISOString(), time: new Date(q.date).getTime(), close: q.close as number }))
    .filter((p) => p.time >= from && p.time <= to);
  return { currency: chart.meta.currency, points };
}

/** Wechselkurse je Tag als Einheiten der Fremdwährung je 1 EUR (Yahoo-Kürzel z. B. EURUSD=X). */
export async function fetchFxDaily(code: string, from: Date): Promise<{ time: number; value: number }[]> {
  const chart = await yf.chart(`EUR${code}=X`, { period1: from, interval: "1d" });
  return chart.quotes
    .filter((q) => typeof q.close === "number" && q.close > 0)
    .map((q) => ({ time: new Date(q.date).getTime(), value: q.close as number }));
}
