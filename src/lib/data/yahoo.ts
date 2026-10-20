import "server-only";
import YahooFinance from "yahoo-finance2";
import type { MarketData, StatementRow } from "./types";

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
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type SearchHit = { symbol: string; name: string; exchange?: string; type?: string };

export async function searchStocks(query: string): Promise<SearchHit[]> {
  const res = await yf.search(query, { quotesCount: 10, newsCount: 0 });
  return res.quotes
    .filter((q) => "symbol" in q && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
    .map((q) => {
      const r = q as { symbol: string; longname?: string; shortname?: string; exchDisp?: string; quoteType?: string };
      return { symbol: r.symbol, name: r.longname ?? r.shortname ?? r.symbol, exchange: r.exchDisp, type: r.quoteType };
    });
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
    nextExDividend:
      exDiv && new Date(exDiv) > now ? { value: day(exDiv), source: SOURCE, asOf: day(now) } : undefined,
    dividends: (chart?.events?.dividends ?? [])
      .map((d) => ({ date: day(d.date), amount: d.amount }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    quarterly: toRows(quarterly as Record<string, unknown>[]),
    annual: toRows(annual as Record<string, unknown>[]),
    fetchedAt: now.toISOString(),
  };
}
