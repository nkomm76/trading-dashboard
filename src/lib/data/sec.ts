import "server-only";
import { daysBetween, quarterlyFromYtd, type Fact } from "./sec-quarters";
import type { StatementRow } from "./types";

// SEC EDGAR verlangt einen User-Agent mit Kontaktangabe.
const UA = process.env.SEC_USER_AGENT ?? "dividenden-dashboard (private use)";

const cikCache = new Map<string, string | undefined>();

// Über die EDGAR-Suche – die Ticker-Liste auf www.sec.gov verlangt eine E-Mail im User-Agent
export async function lookupCik(ticker: string): Promise<string | undefined> {
  const t = ticker.toUpperCase().replace(".", "-");
  if (cikCache.has(t)) return cikCache.get(t);
  const res = await fetch(`https://efts.sec.gov/LATEST/search-index?keysTyped=${encodeURIComponent(t)}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { hits?: { hits?: { _id: string; _source?: { tickers?: string } }[] } };
  const hit = json.hits?.hits?.find((h) => (h._source?.tickers ?? "").split(/,\s*/).some((x) => x.toUpperCase() === t));
  const cik = hit ? hit._id.padStart(10, "0") : undefined;
  cikCache.set(t, cik);
  return cik;
}



// Ergänzt US-Quartalszahlen aus den offiziellen 10-Q/10-K-Daten, wo Yahoo Lücken hat.
export async function fetchSecQuarterly(cik: string): Promise<StatementRow[]> {
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { facts?: { "us-gaap"?: Record<string, { units: Record<string, Fact[]> }> } };
  const gaap = json.facts?.["us-gaap"] ?? {};
  const facts = (tag: string, unit: string) => gaap[tag]?.units[unit] ?? [];

  const rows = new Map<string, StatementRow>();
  const row = (end: string) => rows.get(end) ?? rows.set(end, { date: end }).get(end)!;

  // EPS: nur echte Dreimonatswerte
  for (const f of facts("EarningsPerShareDiluted", "USD/shares")) {
    if (f.start && Math.abs(daysBetween(f.start, f.end) - 91) <= 10) row(f.end).dilutedEPS = f.val;
  }
  // Bilanzwerte sind Stichtagswerte
  for (const f of facts("StockholdersEquity", "USD")) {
    if (f.form === "10-Q" || f.form === "10-K") row(f.end).stockholdersEquity = f.val;
  }
  // Cashflows stehen in 10-Q/10-K kumuliert ab Geschäftsjahresbeginn: Quartal = Stand − Vorstand
  for (const [k, end] of quarterlyFromYtd(facts("NetCashProvidedByUsedInOperatingActivities", "USD"))) row(k).operatingCashFlow = end;
  for (const [k, end] of quarterlyFromYtd(facts("PaymentsToAcquirePropertyPlantAndEquipment", "USD"))) row(k).capitalExpenditure = -end;

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  return [...rows.values()]
    .filter((r) => r.date >= cutoff.toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const REVENUE_TAGS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"];

/** Jahreswerte (10-K, Geschäftsjahr) für Umsatz und verwässertes EPS – längere Historie als Yahoo. */
export async function fetchSecAnnual(cik: string): Promise<StatementRow[]> {
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const json = (await res.json()) as { facts?: { "us-gaap"?: Record<string, { units: Record<string, Fact[]> }> } };
  const gaap = json.facts?.["us-gaap"] ?? {};
  const isYear = (f: Fact) => f.form === "10-K" && f.start !== undefined && Math.abs(daysBetween(f.start, f.end) - 365) <= 20;

  const rows = new Map<string, StatementRow>();
  const row = (end: string) => rows.get(end) ?? rows.set(end, { date: end }).get(end)!;
  for (const f of gaap.EarningsPerShareDiluted?.units["USD/shares"] ?? []) if (isYear(f)) row(f.end).dilutedEPS = f.val;
  // Erste Umsatz-Kennung mit Daten je Jahr verwenden (Unternehmen wechseln die Kennung über die Jahre)
  for (const tag of REVENUE_TAGS) {
    for (const f of gaap[tag]?.units.USD ?? []) if (isYear(f)) row(f.end).totalRevenue ??= f.val;
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}
