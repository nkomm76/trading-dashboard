import type { DividendPayment, MarketData, StatementRow } from "./data/types";
import { annualTotals, computeMetrics, detectFrequency } from "./metrics";
import type { LightColor } from "./rating";

// Schnellbewertung vor dem Kauf. Jede Prüfung ist GREY, wenn die Datenbasis fehlt – nichts wird geschätzt.

export type CheckItem = {
  key: "dividends" | "payout" | "growth";
  title: string;
  light: LightColor;
  verdict: string;
  details: string[];
};

export type CheckResult = {
  symbol: string;
  name: string;
  currency: string;
  exchange?: string;
  sector?: string;
  price?: { value: number; asOf: string };
  expectedYield?: { value: number; basis: string };
  trailingYield?: number;
  schedule?: { frequency?: string; months?: string[]; last?: { date: string; amount: number }; nextExDate?: string };
  items: CheckItem[];
  overall: LightColor;
  passed: number;
};

const ORDER: Record<LightColor, number> = { GREEN: 0, ORANGE: 1, RED: 2, GREY: -1 };
const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`;
const deDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const num = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 4 });

const PER_YEAR = { monatlich: 12, quartalsweise: 4, halbjährlich: 2, jährlich: 1, unregelmäßig: 0 } as const;

/**
 * Jahresrate je Kalenderjahr. Bei mehreren Zahlungen pro Jahr: Ø-Zahlung × übliche Anzahl –
 * so verzerren 11 oder 13 Monatszahlungen in einem Kalenderjahr (Terminverschiebung) das Bild nicht.
 */
function annualRates(divs: DividendPayment[], asOf: string): { rates: Map<number, number>; perYear: number } {
  const perYear = PER_YEAR[detectFrequency(divs, asOf) ?? "unregelmäßig"];
  const totals = annualTotals(divs);
  if (perYear < 2) return { rates: totals, perYear };
  const counts = new Map<number, number>();
  for (const d of divs) counts.set(Number(d.date.slice(0, 4)), (counts.get(Number(d.date.slice(0, 4))) ?? 0) + 1);
  return { rates: new Map([...totals].map(([y, t]) => [y, (t / counts.get(y)!) * perYear])), perYear };
}

/** Dividenden der letzten 5 abgeschlossenen Kalenderjahre: stabil oder steigend? */
export function checkDividends(divs: DividendPayment[], currentYear: number, asOf = `${currentYear}-12-31`): CheckItem {
  const base = { key: "dividends" as const, title: "Dividende der letzten 5 Jahre stabil oder steigend" };
  const { rates: totals, perYear } = annualRates(divs, asOf);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 5 + i);
  const firstYear = divs.length ? Number(divs[0].date.slice(0, 4)) : undefined;
  const details = years.map((y) => `${y}: ${totals.has(y) ? num(totals.get(y)!) : "keine Zahlung"}`);
  if (perYear >= 2) details.push(`auf Jahresbasis: Ø Zahlung je Jahr × ${perYear}`);

  if (!divs.length) return { ...base, light: "RED", verdict: "Keine Dividendenzahlungen gefunden", details: ["Quelle: Yahoo Finance"] };
  // Historie muss bis vor das Startjahr reichen, sonst ist „keine Zahlung“ nicht von „keine Daten“ zu unterscheiden
  if (firstYear === undefined || firstYear > years[0]) {
    return { ...base, light: "GREY", verdict: "Dividendenhistorie kürzer als 5 Jahre", details };
  }

  const missing = years.filter((y) => !totals.has(y));
  let declines = 0;
  let bigDecline = false;
  for (let i = 1; i < years.length; i++) {
    const a = totals.get(years[i - 1]);
    const b = totals.get(years[i]);
    if (a && b && b < a * 0.98) {
      declines++;
      if (b < a * 0.85) bigDecline = true;
    }
  }

  if (missing.length) return { ...base, light: "RED", verdict: `Jahr ohne Dividende (${missing.join(", ")})`, details };
  if (declines === 0) {
    const first = totals.get(years[0])!;
    const last = totals.get(years[4])!;
    return { ...base, light: "GREEN", verdict: last > first * 1.02 ? "Sehr gut – steigend" : "Sehr gut – stabil", details };
  }
  if (declines === 1 && !bigDecline) return { ...base, light: "ORANGE", verdict: "Einmal leicht gesunken", details };
  return { ...base, light: "RED", verdict: bigDecline ? "Deutliche Kürzung" : `${declines}-mal gesunken`, details };
}

/** Ausschüttungsquote unter 80 %? Bei Immobilienwerten (REITs) zählt der Free Cashflow statt des Gewinns. */
export function checkPayout(market: MarketData, toTradingCurrency?: (v: number) => number | undefined): CheckItem {
  const base = { key: "payout" as const, title: "Ausschüttungsquote unter 80 %" };
  const m = computeMetrics({ market, toTradingCurrency });
  const reit = market.sector === "Real Estate";
  const value = reit ? m.payoutFcf : m.payoutEps;
  const label = reit ? "Free Cashflow (Immobilienwert)" : "Gewinn je Aktie";

  if (!m.dividendTTM) return { ...base, light: "GREY", verdict: "Zahlt aktuell keine Dividende – nicht anwendbar", details: [] };
  if (!reit && m.epsTTM && m.epsTTM.value <= 0) {
    return { ...base, light: "RED", verdict: "Kein Gewinn – Dividende nicht aus dem Gewinn gedeckt", details: [`EPS: ${num(m.epsTTM.value)}`] };
  }
  if (!value) return { ...base, light: "GREY", verdict: "Keine Daten zur Ausschüttungsquote", details: [] };
  const v = value.value;
  const details = [`${pct(v)} vom ${label}`, `Stand ${deDate(value.asOf)}${value.period ? ` (${value.period})` : ""}`];
  if (v < 0.8) return { ...base, light: "GREEN", verdict: `Sehr gut – ${pct(v)}`, details };
  if (v <= 1) return { ...base, light: "ORANGE", verdict: `${pct(v)} – wenig Puffer`, details };
  return { ...base, light: "RED", verdict: `${pct(v)} – mehr ausgeschüttet als verdient`, details };
}

type Growth = { from: string; to: string; first: number; last: number; years: number; cagr?: number };

function growthOf(rows: StatementRow[], key: "totalRevenue" | "dilutedEPS"): Growth | undefined {
  const withVal = rows.filter((r) => typeof r[key] === "number");
  if (withVal.length < 2) return undefined;
  // Höchstens die letzten 5 Jahre (6 Stichtage) betrachten
  const recent = withVal.slice(-6);
  const a = recent[0];
  const b = recent[recent.length - 1];
  const years = (Date.parse(b.date) - Date.parse(a.date)) / (365.25 * 86_400_000);
  if (years < 0.9) return undefined;
  const first = a[key] as number;
  const last = b[key] as number;
  return { from: a.date, to: b.date, first, last, years, cagr: first > 0 && last > 0 ? Math.pow(last / first, 1 / years) - 1 : undefined };
}

/** Positives Umsatz- und Gewinnwachstum über (bis zu) 5 Jahre. */
export function checkGrowth(annual: StatementRow[]): CheckItem {
  const base = { key: "growth" as const, title: "Positives Gewinn- und Umsatzwachstum (5 Jahre)" };
  const rev = growthOf(annual, "totalRevenue");
  const eps = growthOf(annual, "dilutedEPS");
  // Geschäftsjahre, die in den ersten Januartagen enden (52/53-Wochen-Jahr), dem Vorjahr zuordnen
  const fy = (d: string) => (d.slice(5, 7) === "01" && Number(d.slice(8, 10)) <= 10 ? Number(d.slice(0, 4)) - 1 : Number(d.slice(0, 4)));
  const describe = (label: string, g: Growth | undefined) =>
    g
      ? `${label}: ${fy(g.from)} → ${fy(g.to)}${g.cagr !== undefined ? `, ${pct(g.cagr)} p. a.` : g.last > g.first ? ", gestiegen" : ", gesunken"}`
      : `${label}: keine Daten`;
  const details = [describe("Umsatz", rev), describe("Gewinn je Aktie", eps)];

  if (!rev && !eps) return { ...base, light: "GREY", verdict: "Keine Daten zum Wachstum", details };
  const span = Math.max(rev?.years ?? 0, eps?.years ?? 0);
  if (span < 4.5) details.push(`Hinweis: nur ${span.toFixed(0)} Jahre Historie in der Quelle verfügbar`);

  const up = [rev, eps].filter((g) => g && g.last > g.first).length;
  const down = [rev, eps].filter((g) => g && g.last <= g.first).length;
  if (down === 0 && up === 2) return { ...base, light: "GREEN", verdict: "Sehr gut – Umsatz und Gewinn gewachsen", details };
  if (down === 0) return { ...base, light: "ORANGE", verdict: "Gewachsen, aber nur eine Kennzahl verfügbar", details };
  if (up === 1) return { ...base, light: "ORANGE", verdict: rev && rev.last > rev.first ? "Umsatz gewachsen, Gewinn nicht" : "Gewinn gewachsen, Umsatz nicht", details };
  return { ...base, light: "RED", verdict: "Umsatz und Gewinn nicht gewachsen", details };
}

/** Erwartete Rendite: letzte Zahlung auf ein Jahr hochgerechnet; Rückfall auf die Zahlungen der letzten 12 Monate. */
export function expectedYield(divs: DividendPayment[], price: number | undefined, asOf = new Date().toISOString().slice(0, 10)) {
  if (!price || !divs.length) return undefined;
  const freq = detectFrequency(divs, asOf);
  const perYear = PER_YEAR[freq ?? "unregelmäßig"];
  const last = divs[divs.length - 1];
  const lastAgeDays = (Date.parse(asOf) - Date.parse(last.date)) / 86_400_000;
  if (perYear && lastAgeDays < 400) {
    return { value: (last.amount * perYear) / price, basis: `letzte Zahlung (${num(last.amount)}) × ${perYear}, ${freq}` };
  }
  return undefined;
}

export function evaluateCheck(market: MarketData, opts: { growthRows?: StatementRow[]; toTradingCurrency?: (v: number) => number | undefined; asOf?: string } = {}): CheckResult {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const items = [
    checkDividends(market.dividends, Number(asOf.slice(0, 4)), asOf),
    checkPayout(market, opts.toTradingCurrency),
    checkGrowth(opts.growthRows ?? market.annual),
  ];
  const rated = items.filter((i) => i.light !== "GREY");
  const overall = rated.length ? rated.reduce<LightColor>((w, i) => (ORDER[i.light] > ORDER[w] ? i.light : w), "GREEN") : "GREY";
  const metrics = computeMetrics({ market, asOf });
  const ttm = metrics.dividendYield?.value;

  return {
    symbol: market.symbol,
    name: market.name,
    currency: market.currency,
    exchange: market.exchange,
    sector: market.sector,
    price: market.price && { value: market.price.value, asOf: market.price.asOf },
    expectedYield: expectedYield(market.dividends, market.price?.value, asOf),
    trailingYield: ttm,
    schedule: market.dividends.length
      ? {
          frequency: metrics.frequency?.value,
          months: metrics.exMonths?.value,
          last: metrics.lastDividend?.value,
          nextExDate: market.nextExDividend?.value,
        }
      : undefined,
    items,
    overall,
    passed: items.filter((i) => i.light === "GREEN").length,
  };
}
