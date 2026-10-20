import "server-only";
import type { StatementRow } from "./types";

// SEC EDGAR verlangt einen User-Agent mit Kontaktangabe.
const UA = process.env.SEC_USER_AGENT ?? "dividenden-dashboard (private use)";

let tickerMap: Map<string, string> | null = null;

export async function lookupCik(ticker: string): Promise<string | undefined> {
  if (!tickerMap) {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": UA } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
    tickerMap = new Map(Object.values(json).map((e) => [e.ticker.toUpperCase(), String(e.cik_str).padStart(10, "0")]));
  }
  return tickerMap.get(ticker.toUpperCase().replace(".", "-"));
}

type Fact = { start?: string; end: string; val: number; form: string; fp?: string };

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

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

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  return [...rows.values()]
    .filter((r) => r.date >= cutoff.toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));
}
