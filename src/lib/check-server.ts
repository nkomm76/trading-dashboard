import "server-only";
import { evaluateCheck, type CheckResult } from "./check";
import { convert, fetchEcbRates } from "./data/fx";
import { fetchEulerpoolAnnual } from "./data/eulerpool";
import { extendHistory, type Extension } from "./data/eulerpool-normalize";
import { fetchSecAnnual, fetchSecQuarterly, lookupCik } from "./data/sec";
import { mergeRows, samePeriod } from "./refresh";
import { fetchMarketData, searchStocks, type SearchHit } from "./data/yahoo";
import type { StatementRow } from "./data/types";
import { getFxRates, getThresholds } from "./settings";

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/** Bevorzugt die Heimatbörse: US-ISIN → US-Notierung, sonst Xetra, dann die erste Notierung. */
function pickListing(query: string, hits: SearchHit[]): SearchHit | undefined {
  const q = query.toUpperCase();
  if (q.startsWith("US")) return hits.find((h) => !h.symbol.includes(".")) ?? hits[0];
  return hits.find((h) => h.symbol.endsWith(".DE")) ?? hits[0];
}

export type CheckResponse = { result?: CheckResult; listings: SearchHit[]; error?: string; isin?: string; watched?: boolean };

export async function runCheck(query: string, symbol?: string): Promise<CheckResponse> {
  const q = query.trim().toUpperCase();
  let listings: SearchHit[] = [];
  try {
    listings = await searchStocks(q);
  } catch {
    // Suche fehlgeschlagen – ggf. direkt als Symbol versuchen
  }
  const target = symbol ?? pickListing(q, listings)?.symbol ?? (ISIN.test(q) ? undefined : q);
  if (!target) return { listings, error: "Zu dieser ISIN wurde keine Aktie gefunden." };

  // Eulerpool parallel laden (nur per ISIN); dient ausschließlich zum Verlängern der Jahreshistorie
  const isin = ISIN.test(q) ? q : undefined;
  const eulerpool = isin ? fetchEulerpoolAnnual(isin) : Promise.resolve([]);

  let market;
  try {
    market = await fetchMarketData(target);
  } catch {
    return { listings, error: `Für ${target} wurden keine Kursdaten gefunden.` };
  }

  // US-Werte: längere Jahreshistorie aus SEC-Berichten, wenn sie mehr Jahre abdeckt
  let growthRows = market.annual;
  let chartQuarterly: StatementRow[] | undefined;
  if (!target.includes(".") && market.currency === "USD") {
    const cik = await lookupCik(target).catch(() => undefined);
    const [sec, secQuarterly] = cik
      ? await Promise.all([fetchSecAnnual(cik).catch(() => []), fetchSecQuarterly(cik).catch(() => [])])
      : [[], []];
    // Fehlende Quartals-EPS aus SEC-Berichten ergänzen
    market.quarterly = mergeRows(market.quarterly, secQuarterly);
    // Fürs Diagramm auch ältere Quartale aus SEC übernehmen (Yahoo liefert nur gut ein Jahr)
    const yahooQ = market.quarterly;
    chartQuarterly = [...yahooQ, ...secQuarterly.filter((r) => !yahooQ.some((y) => samePeriod(y.date, r.date)))].sort((a, b) => a.date.localeCompare(b.date));
    const secYears = sec.filter((r) => r.totalRevenue !== undefined || r.dilutedEPS !== undefined).length;
    const yahooYears = market.annual.filter((r) => r.totalRevenue !== undefined || r.dilutedEPS !== undefined).length;
    if (secYears > yahooYears) growthRows = sec;
  }

  const sources = ["Yahoo Finance", ...(growthRows !== market.annual || chartQuarterly ? ["SEC"] : [])];
  const ep = await eulerpool;
  const describe = (x: Extension) =>
    x.addedYears.length
      ? x.addedYears.length === 1
        ? `Jahr ${x.addedYears[0]} ergänzt aus Eulerpool`
        : `Jahre ${Math.min(...x.addedYears)}–${Math.max(...x.addedYears)} ergänzt aus Eulerpool`
      : x.rejected && ep.length
        ? `Eulerpool nicht verwendet: ${x.rejected}`
        : undefined;
  const growthExt = extendHistory(growthRows, ep);
  // Für das Ø-KGV bis zu 10 Jahre Gewinnhistorie
  const epsExt = extendHistory(growthRows, ep, 11);
  // REITs: Eulerpool zieht Immobilienkäufe vom Free Cashflow ab – für den DCF nicht vergleichbar
  const dcfExt = market.sector === "Real Estate" ? undefined : extendHistory(market.annual, ep);
  if (growthExt.addedYears.length || dcfExt?.addedYears.length || epsExt.addedYears.length) sources.push("Eulerpool");

  const rates = (await getFxRates())?.rates ?? (await fetchEcbRates().catch(() => undefined))?.value;
  const result = evaluateCheck(market, {
    growthRows: growthExt.rows,
    growthNote: describe(growthExt),
    dcfHistory: dcfExt && { annual: dcfExt.rows, note: describe(dcfExt) },
    epsHistory: { annual: epsExt.rows, note: describe(epsExt) },
    sources,
    chartQuarterly,
    dcf: (await getThresholds()).dcf,
    toTradingCurrency: (v) => (rates && market.financialCurrency ? convert(v, market.financialCurrency, market.currency, rates) : undefined),
  });
  return { result, listings, isin };
}
