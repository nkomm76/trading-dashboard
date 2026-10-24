import type { DividendPayment, MarketData, PricePoint, StatementRow } from "./data/types";
import { annualTotals, computeMetrics, detectDividendCut, detectFrequency, fcfOf } from "./metrics";
import { DEFAULT_THRESHOLDS, type DcfAssumptions, type LightColor } from "./rating";

// Schnellbewertung vor dem Kauf. Jede Prüfung ist GREY, wenn die Datenbasis fehlt – nichts wird geschätzt.

export type CheckItem = {
  key: "dividends" | "payout" | "growth";
  title: string;
  light: LightColor;
  verdict: string;
  details: string[];
};

export type FundamentalRow = { date: string; eps: number | null; fcf: number | null };

export type CheckResult = {
  symbol: string;
  name: string;
  currency: string;
  financialCurrency?: string;
  exchange?: string;
  sector?: string;
  price?: { value: number; asOf: string };
  expectedYield?: { value: number; basis: string };
  trailingYield?: number;
  schedule?: { frequency?: string; months?: string[]; last?: { date: string; amount: number }; nextExDate?: string };
  fairValue?: FairValue;
  dcf?: DcfResult;
  /** Dividende je Aktie der letzten 10 abgeschlossenen Kalenderjahre */
  dividendsByYear: { year: number; total: number }[];
  /** EPS und Free Cashflow der letzten 3 Jahre */
  fundamentals: { quarterly: FundamentalRow[]; annual: FundamentalRow[] };
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

/** Erwartete Jahresdividende: letzte Zahlung auf ein Jahr hochgerechnet (nur bei regelmäßigem Rhythmus und aktueller Zahlung). */
export function expectedAnnualDividend(divs: DividendPayment[], asOf = new Date().toISOString().slice(0, 10)) {
  if (!divs.length) return undefined;
  const freq = detectFrequency(divs, asOf);
  const perYear = PER_YEAR[freq ?? "unregelmäßig"];
  const last = divs[divs.length - 1];
  const lastAgeDays = (Date.parse(asOf) - Date.parse(last.date)) / 86_400_000;
  if (perYear && lastAgeDays < 400) return { amount: last.amount * perYear, basis: `letzte Zahlung (${num(last.amount)}) × ${perYear}, ${freq}` };
  return undefined;
}

/** Erwartete Rendite: letzte Zahlung auf ein Jahr hochgerechnet. */
export function expectedYield(divs: DividendPayment[], price: number | undefined, asOf = new Date().toISOString().slice(0, 10)) {
  const exp = expectedAnnualDividend(divs, asOf);
  if (!price || !exp) return undefined;
  return { value: exp.amount / price, basis: exp.basis };
}

export type FairValue = {
  value: number;
  dividend: number; // erwartete Jahresdividende
  dividendBasis: string;
  avgYield: number; // Ø-Dividendenrendite im Betrachtungszeitraum
  minYield: number;
  maxYield: number;
  from: string;
  to: string;
  months: number;
  deviation?: number; // Kurs / fairer Wert − 1
  notes: string[];
};

const YEAR_MS = 365.25 * 86_400_000;

/**
 * Fairer Wert nach dem Rendite-Mittelwert: erwartete Jahresdividende ÷ Ø-Dividendenrendite der letzten 5 Jahre.
 * Die Rendite je Monatsende = Dividenden der 12 Monate davor ÷ Monatsschlusskurs.
 */
export function fairValueByYield(
  divs: DividendPayment[],
  closes: PricePoint[] | undefined,
  price: number | undefined,
  asOf = new Date().toISOString().slice(0, 10),
): FairValue | undefined {
  const exp = expectedAnnualDividend(divs, asOf);
  if (!exp || !closes?.length || !divs.length) return undefined;
  const end = Date.parse(asOf);
  const firstDiv = Date.parse(divs[0].date);
  const yields: { date: string; y: number }[] = [];
  for (const c of closes) {
    const t = Date.parse(c.date);
    // Nur Monate, für die eine volle 12-Monats-Dividendenhistorie vorliegt
    if (t > end || t < end - 5 * YEAR_MS || t - YEAR_MS < firstDiv - 31 * 86_400_000 || c.close <= 0) continue;
    const ttm = divs.filter((d) => {
      const dt = Date.parse(d.date);
      return dt <= t && dt > t - YEAR_MS;
    }).reduce((a, d) => a + d.amount, 0);
    if (ttm > 0) yields.push({ date: c.date, y: ttm / c.close });
  }
  // Mindestens 3 Jahre Monatswerte, sonst ist der Mittelwert nicht belastbar
  if (yields.length < 36) return undefined;

  const avg = yields.reduce((a, x) => a + x.y, 0) / yields.length;
  const value = exp.amount / avg;
  const notes: string[] = [];
  if (yields.length < 54) notes.push(`nur ${(yields.length / 12).toFixed(1).replace(".", ",")} Jahre Kurs- und Dividendenhistorie`);
  if (detectDividendCut(divs, detectFrequency(divs, asOf))) notes.push("Dividende wurde zuletzt gekürzt – Wert nur eingeschränkt aussagekräftig");
  return {
    value,
    dividend: exp.amount,
    dividendBasis: exp.basis,
    avgYield: avg,
    minYield: Math.min(...yields.map((x) => x.y)),
    maxYield: Math.max(...yields.map((x) => x.y)),
    from: yields[0].date,
    to: yields[yields.length - 1].date,
    months: yields.length,
    deviation: price ? price / value - 1 : undefined,
    notes,
  };
}

export type DcfValue = {
  value: number; // je Aktie in Handelswährung
  low: number; // bei Abzinsungssatz + 1 Prozentpunkt
  high: number; // bei Abzinsungssatz − 1 Prozentpunkt
  baseFcf: number; // Ø Free Cashflow der letzten Jahre (Bilanzwährung)
  baseYears: string;
  growth: number;
  growthBasis: string;
  assumptions: DcfAssumptions;
  shares: number;
  deviation?: number;
  notes: string[];
};
export type DcfResult = DcfValue | { unavailable: string };

const fy = (d: string) => (d.slice(5, 7) === "01" && Number(d.slice(8, 10)) <= 10 ? Number(d.slice(0, 4)) - 1 : Number(d.slice(0, 4)));
const cagr = (first: number, last: number, years: number) => (first > 0 && last > 0 && years > 0 ? Math.pow(last / first, 1 / years) - 1 : undefined);

/** Barwert je Aktie: 5 Jahre Wachstum g, Jahre 6–10 linear auf das ewige Wachstum, danach Endwert (Gordon). */
export function dcfPerShare(baseFcf: number, growth: number, a: DcfAssumptions, shares: number, rate = a.discountRate): number {
  let fcf = baseFcf;
  let pv = 0;
  for (let y = 1; y <= 10; y++) {
    const g = y <= 5 ? growth : growth + ((a.terminalGrowth - growth) * (y - 5)) / 5;
    fcf *= 1 + g;
    pv += fcf / Math.pow(1 + rate, y);
  }
  const terminal = (fcf * (1 + a.terminalGrowth)) / (rate - a.terminalGrowth);
  pv += terminal / Math.pow(1 + rate, 10);
  return pv / shares;
}

/**
 * Fairer Wert nach DCF auf Basis des Free Cashflows (nach Zinsen, daher mit den Eigenkapitalkosten abgezinst).
 * Basis: Ø-FCF der letzten 3 Geschäftsjahre; Wachstum: historisches FCF-Wachstum, ersatzweise Umsatzwachstum, begrenzt.
 */
export function dcfValue(
  market: MarketData,
  a: DcfAssumptions = DEFAULT_THRESHOLDS.dcf,
  toTradingCurrency?: (v: number) => number | undefined,
): DcfResult {
  const rows = market.annual.map((r) => ({ date: r.date, fcf: fcfOf(r), shares: r.dilutedAverageShares })).filter((r) => r.fcf !== undefined) as {
    date: string;
    fcf: number;
    shares?: number;
  }[];
  // Bei Banken und Versicherungen enthält der operative Cashflow Kundengelder (Einlagen, Prämien) – kein freier Überschuss
  if (market.sector === "Financial Services") return { unavailable: "Für Banken und Versicherungen nicht sinnvoll, ihr Cashflow enthält Kundengelder" };
  if (!market.sharesOutstanding) return { unavailable: "Anzahl der Aktien nicht verfügbar" };
  if (rows.length < 3) return { unavailable: "Weniger als 3 Geschäftsjahre mit Free Cashflow in der Quelle" };
  if (a.discountRate <= a.terminalGrowth) return { unavailable: "Abzinsungssatz muss über dem ewigen Wachstum liegen" };

  const last3 = rows.slice(-3);
  const baseFcf = last3.reduce((s, r) => s + r.fcf, 0) / 3;
  if (baseFcf <= 0) return { unavailable: "Free Cashflow im Schnitt der letzten 3 Jahre nicht positiv" };

  const first = rows[0];
  const last = rows[rows.length - 1];
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 86_400_000);
  const notes: string[] = [];
  // Wachstum je Aktie: Neue Aktien (z. B. für Zukäufe) verteilen den Cashflow auf mehr Anteile
  const perShare = first.shares && last.shares;
  const dilution = perShare ? last.shares! / first.shares! : 1;
  let raw = cagr(first.fcf, last.fcf / dilution, years);
  let basis = `Free Cashflow${perShare ? " je Aktie" : ""} ${fy(first.date)}–${fy(last.date)}`;
  if (raw === undefined) {
    const rev = market.annual.filter((r) => typeof r.totalRevenue === "number");
    const rf = rev[0];
    const rl = rev[rev.length - 1];
    const revDilution = rf?.dilutedAverageShares && rl?.dilutedAverageShares ? rl.dilutedAverageShares / rf.dilutedAverageShares : 1;
    raw = rf && rl ? cagr(rf.totalRevenue!, rl.totalRevenue! / revDilution, (Date.parse(rl.date) - Date.parse(rf.date)) / (365.25 * 86_400_000)) : undefined;
    basis = rf && rl ? `Umsatz je Aktie ${fy(rf.date)}–${fy(rl.date)} (FCF schwankt zu stark)` : basis;
  }
  if (!perShare) notes.push("Aktienzahl früherer Jahre fehlt – Wachstum ohne Verwässerung gerechnet");
  else if (dilution > 1.1) notes.push(`Aktienzahl im Zeitraum um ${((dilution - 1) * 100).toFixed(0)} % gestiegen – im Wachstum berücksichtigt`);
  if (raw === undefined) return { unavailable: "Kein Wachstum aus FCF oder Umsatz ableitbar" };
  const growth = Math.min(a.maxGrowth, Math.max(0, raw));
  if (growth !== raw) notes.push(`Wachstum ${raw < 0 ? "auf 0 % angehoben" : "begrenzt"} (historisch ${(raw * 100).toFixed(1).replace(".", ",")} % p. a.)`);
  if (years < 4) notes.push(`Wachstum aus nur ${Math.round(years)} Jahren abgeleitet`);

  // Bilanzwährung → Handelswährung (z. B. EUR-Bilanz, Notierung in USD)
  const sameCurrency = !market.financialCurrency || market.financialCurrency === market.currency;
  const conv = (v: number) => (sameCurrency ? v : toTradingCurrency?.(v));
  const value = conv(dcfPerShare(baseFcf, growth, a, market.sharesOutstanding));
  const low = conv(dcfPerShare(baseFcf, growth, a, market.sharesOutstanding, a.discountRate + 0.01));
  const high = conv(dcfPerShare(baseFcf, growth, a, market.sharesOutstanding, a.discountRate - 0.01));
  if (value === undefined || low === undefined || high === undefined) return { unavailable: "Wechselkurs für die Bilanzwährung fehlt" };

  return {
    value,
    low,
    high,
    baseFcf,
    baseYears: `${fy(last3[0].date)}–${fy(last3[2].date)}`,
    growth,
    growthBasis: basis,
    assumptions: a,
    shares: market.sharesOutstanding,
    deviation: market.price ? market.price.value / value - 1 : undefined,
    notes,
  };
}

/** EPS und FCF der Perioden, die in den letzten 3 Jahren enden. */
export function recentFundamentals(rows: StatementRow[], asOf: string): FundamentalRow[] {
  const from = new Date(Date.parse(asOf) - 3 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  return rows
    .filter((r) => r.date > from)
    .map((r) => ({ date: r.date, eps: r.dilutedEPS ?? null, fcf: fcfOf(r) ?? null }))
    .filter((r) => r.eps !== null || r.fcf !== null);
}

export function evaluateCheck(
  market: MarketData,
  opts: {
    growthRows?: StatementRow[];
    /** Quartale für das EPS-/FCF-Diagramm, ggf. um SEC-Perioden erweitert */
    chartQuarterly?: StatementRow[];
    toTradingCurrency?: (v: number) => number | undefined;
    asOf?: string;
    dcf?: DcfAssumptions;
  } = {},
): CheckResult {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const items = [
    checkDividends(market.dividends, Number(asOf.slice(0, 4)), asOf),
    checkPayout(market, opts.toTradingCurrency),
    checkGrowth(opts.growthRows ?? market.annual),
  ];
  const rated = items.filter((i) => i.light !== "GREY");
  const overall = rated.length ? rated.reduce<LightColor>((w, i) => (ORDER[i.light] > ORDER[w] ? i.light : w), "GREEN") : "GREY";
  const metrics = computeMetrics({ market, asOf });
  const year = Number(asOf.slice(0, 4));
  const ttm = metrics.dividendYield?.value;

  return {
    symbol: market.symbol,
    name: market.name,
    currency: market.currency,
    financialCurrency: market.financialCurrency,
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
    fairValue: fairValueByYield(market.dividends, market.monthlyCloses, market.price?.value, asOf),
    dcf: dcfValue(market, opts.dcf, opts.toTradingCurrency),
    dividendsByYear: [...annualTotals(market.dividends)]
      .filter(([y]) => y < year && y >= year - 10)
      .map(([y, total]) => ({ year: y, total })),
    fundamentals: { quarterly: recentFundamentals(opts.chartQuarterly ?? market.quarterly, asOf), annual: recentFundamentals(market.annual, asOf) },
    items,
    overall,
    passed: items.filter((i) => i.light === "GREEN").length,
  };
}
