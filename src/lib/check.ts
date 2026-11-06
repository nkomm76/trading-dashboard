import type { DividendPayment, MarketData, PricePoint, StatementRow } from "./data/types";
import { epsSeries, fairValueByPe, type PeFairValue } from "./fair-pe";
import { annualTotals, computeMetrics, detectDividendCut, detectFrequency, fcfOf, type Metrics } from "./metrics";
import { DEFAULT_THRESHOLDS, rate, type DcfAssumptions, type LightColor, type Thresholds } from "./rating";

// Schnellbewertung vor dem Kauf. Jede Prüfung ist GREY, wenn die Datenbasis fehlt – nichts wird geschätzt.

/** Ein Kriterium der gemeinsamen Ampel (siehe rating.ts); GREY = nur Hinweis */
export type CheckItem = {
  key: string;
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
  /** Handelswährung der Aktie, wenn die Beträge für die Anzeige in Euro umgerechnet wurden */
  nativeCurrency?: string;
  exchange?: string;
  sector?: string;
  price?: { value: number; asOf: string };
  expectedYield?: { value: number; basis: string };
  trailingYield?: number;
  schedule?: { frequency?: string; months?: string[]; last?: { date: string; amount: number }; nextExDate?: string };
  fairValue?: FairValue;
  dcf?: DcfResult;
  /** Fairer Wert nach Ø-KGV, mit Gewinnreihe für die Kurve im Kurschart */
  peFair: PeFair;
  /** Dividende je Aktie der letzten 10 abgeschlossenen Kalenderjahre */
  dividendsByYear: { year: number; total: number }[];
  /** Datenquellen dieses Checks für den Hinweis unten */
  sources: string[];
  /** EPS und Free Cashflow der letzten 3 Jahre */
  fundamentals: { quarterly: FundamentalRow[]; annual: FundamentalRow[] };
  items: CheckItem[];
  overall: LightColor;
  /** Kriterien mit Grün */
  passed: number;
  /** Kriterien mit Farbe (ohne reine Hinweise) */
  rated: number;
};

const num = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 4 });

const PER_YEAR = { monatlich: 12, quartalsweise: 4, halbjährlich: 2, jährlich: 1, unregelmäßig: 0 } as const;

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
  const DAY = 86_400_000;
  // Zahlungen je Jahr zum Zeitpunkt t aus dem üblichen Abstand der Zahlungen in den 2 Jahren davor (Rhythmuswechsel möglich)
  const localPerYear = (t: number) => {
    const recent = divs.map((d) => Date.parse(d.date)).filter((dt) => dt <= t && dt > t - 2 * YEAR_MS);
    const gaps = recent.slice(1).map((dt, i) => dt - recent[i]).sort((a, b) => a - b);
    return gaps.length ? Math.max(1, Math.round(YEAR_MS / gaps[Math.floor(gaps.length / 2)])) : undefined;
  };
  const yields: { date: string; y: number }[] = [];
  for (const c of closes) {
    const t = Date.parse(c.date);
    // Nur Monate, für die eine volle 12-Monats-Dividendenhistorie vorliegt
    if (t > end || t < end - 5 * YEAR_MS || t - YEAR_MS < firstDiv - 31 * DAY || c.close <= 0) continue;
    let inWindow = divs.filter((d) => {
      const dt = Date.parse(d.date);
      return dt <= t && dt > t - YEAR_MS;
    });
    // Rückt der Ex-Tag ein paar Tage nach vorn, liegt die Vorjahreszahlung noch am Anfang des Fensters und zählte doppelt.
    // Nur solche Randzahlungen entfernen – Sonderdividenden mitten im Jahr bleiben.
    const perYear = localPerYear(t);
    while (perYear && inWindow.length > perYear && Date.parse(inWindow[0].date) < t - YEAR_MS + 45 * DAY) inWindow = inWindow.slice(1);
    const ttm = inWindow.reduce((a, d) => a + d.amount, 0);
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

type GrowthInput = { date: string; value: number; shares?: number };
type SmoothedGrowth = { growth?: number; perShare: boolean; dilution: number; head: string; tail: string; span: number };

/**
 * Wachstum zwischen dem Ø der ersten und dem Ø der letzten Jahre (je bis zu 3) statt zwischen zwei Einzeljahren,
 * damit ein Ausreißerjahr am Anfang oder Ende die Annahme nicht kippt. Je Aktie, wenn die Aktienzahl in allen
 * verwendeten Jahren bekannt ist.
 */
export function smoothedGrowth(list: GrowthInput[]): SmoothedGrowth | undefined {
  const k = Math.min(3, Math.floor(list.length / 2));
  if (k < 1) return undefined;
  const head = list.slice(0, k);
  const tail = list.slice(-k);
  // Aktienzahlen aus verschiedenen Quellen können in anderen Einheiten stehen: über Faktor 2 Schwankung nicht verwenden
  const shares = [...head, ...tail].map((r) => r.shares ?? 0);
  const perShare = shares.every((x) => x > 0) && Math.max(...shares) / Math.min(...shares) <= 2;
  const avg = (rows: GrowthInput[], f: (r: GrowthInput) => number) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const value = (r: GrowthInput) => (perShare ? r.value / r.shares! : r.value);
  const time = (r: GrowthInput) => Date.parse(r.date);
  const years = (avg(tail, time) - avg(head, time)) / (365.25 * 86_400_000);
  const range = (rows: GrowthInput[]) => (rows.length > 1 ? `Ø ${fy(rows[0].date)}–${fy(rows[rows.length - 1].date)}` : String(fy(rows[0].date)));
  return {
    growth: cagr(avg(head, value), avg(tail, value), years),
    perShare,
    dilution: perShare ? avg(tail, (r) => r.shares!) / avg(head, (r) => r.shares!) : 1,
    head: range(head),
    tail: range(tail),
    span: (time(list[list.length - 1]) - time(list[0])) / (365.25 * 86_400_000),
  };
}

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
  history?: { annual: StatementRow[]; note?: string },
): DcfResult {
  const rows = (history?.annual ?? market.annual).map((r) => ({ date: r.date, fcf: fcfOf(r), shares: r.dilutedAverageShares })).filter((r) => r.fcf !== undefined) as {
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

  // Wachstum über höchstens 5 Jahre (6 Stichtage), aus Durchschnitten statt Einzeljahren
  const notes: string[] = [];
  if (history?.note) notes.push(history.note);
  const fcfGrowth = smoothedGrowth(rows.slice(-6).map((r) => ({ date: r.date, value: r.fcf, shares: r.shares })));
  let g = fcfGrowth;
  let raw = fcfGrowth?.growth;
  let basis = fcfGrowth ? `Free Cashflow${fcfGrowth.perShare ? " je Aktie" : ""} ${fcfGrowth.head} gegenüber ${fcfGrowth.tail}` : "";
  if (raw === undefined) {
    // Ausweichen auf den Umsatz, wenn der Free Cashflow am Anfang im Schnitt nicht positiv war
    const rev = (history?.annual ?? market.annual)
      .filter((r) => typeof r.totalRevenue === "number")
      .slice(-6)
      .map((r) => ({ date: r.date, value: r.totalRevenue!, shares: r.dilutedAverageShares }));
    const revGrowth = smoothedGrowth(rev);
    if (revGrowth?.growth !== undefined) {
      g = revGrowth;
      raw = revGrowth.growth;
      basis = `Umsatz${revGrowth.perShare ? " je Aktie" : ""} ${revGrowth.head} gegenüber ${revGrowth.tail} (FCF schwankt zu stark)`;
    }
  }
  if (g && !g.perShare) notes.push("Aktienzahl früherer Jahre fehlt oder ist nicht vergleichbar – Wachstum ohne Verwässerung gerechnet");
  else if (g && g.dilution > 1.1) notes.push(`Aktienzahl im Zeitraum um ${((g.dilution - 1) * 100).toFixed(0)} % gestiegen – im Wachstum berücksichtigt`);
  if (raw === undefined) return { unavailable: "Kein Wachstum aus FCF oder Umsatz ableitbar" };
  const growth = Math.min(a.maxGrowth, Math.max(0, raw));
  if (growth !== raw) notes.push(`Wachstum ${raw < 0 ? "auf 0 % angehoben" : "begrenzt"} (historisch ${(raw * 100).toFixed(1).replace(".", ",")} % p. a.)`);
  if (g && g.span < 4) notes.push(`Wachstum aus nur ${Math.round(g.span) + 1} Geschäftsjahren abgeleitet`);

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

/** Fairer Wert nach Ø-KGV mit Erklärung, worauf der heutige Gewinn je Aktie beruht. */
export type PeFair = (PeFairValue & { epsBasis: string }) | { unavailable: string };

/** Fairer Wert nach Ø-KGV der letzten 5 Jahre; Gewinne in die Handelswährung umgerechnet. */
function peFairValue(
  market: MarketData,
  ttm: { value: number; asOf: string; period?: string } | undefined,
  asOf: string,
  toTradingCurrency?: (v: number) => number | undefined,
  history?: { annual: StatementRow[]; note?: string },
): PeFair {
  const sameCurrency = !market.financialCurrency || market.financialCurrency === market.currency;
  const rate = sameCurrency ? 1 : toTradingCurrency?.(1);
  if (!rate) return { unavailable: "Wechselkurs für die Bilanzwährung fehlt" };
  const raw = epsSeries(history?.annual ?? market.annual, ttm?.period === "TTM" ? { date: ttm.asOf, eps: ttm.value } : undefined);
  const points = raw.map((p) => ({ date: p.date, eps: p.eps * rate }));
  const f = fairValueByPe(points, market.monthlyCloses, market.price?.value, asOf);
  if ("unavailable" in f) return f;
  const last = raw.at(-1)!;
  const isTtm = ttm?.period === "TTM" && last.date === ttm.asOf;
  return {
    ...f,
    epsBasis: isTtm ? "Ø aus den letzten 12 Monaten und den 2 Geschäftsjahren davor" : `Ø der Geschäftsjahre bis ${fy(last.date)} (höchstens 3)`,
    notes: [...(history?.note ? [history.note] : []), ...(sameCurrency ? [] : [`Gewinne von ${market.financialCurrency} in ${market.currency} umgerechnet`]), ...f.notes],
  };
}

export function evaluateCheck(
  market: MarketData,
  opts: {
    /** Quartale für das EPS-/FCF-Diagramm, ggf. um SEC-Perioden erweitert */
    chartQuarterly?: StatementRow[];
    /** Jahreswerte für den DCF (ggf. um Eulerpool verlängert) */
    dcfHistory?: { annual: StatementRow[]; note?: string };
    /** Jahres-EPS für den fairen Wert nach KGV (ggf. aus SEC oder um Eulerpool verlängert) */
    epsHistory?: { annual: StatementRow[]; note?: string };
    sources?: string[];
    toTradingCurrency?: (v: number) => number | undefined;
    asOf?: string;
    dcf?: DcfAssumptions;
    /** Kurs und EMA 200 wie im Kurschart (in Euro) */
    trend?: Metrics["trend"];
    /** Ampel-Schwellen aus den Einstellungen (dieselben wie im Depot) */
    thresholds?: Thresholds;
  } = {},
): CheckResult {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  // Dieselbe Ampel wie im Depot: Payout, Verschuldung, Dividendenwachstum und -kürzung, EMA 200
  const metrics = computeMetrics({ market, asOf, toTradingCurrency: opts.toTradingCurrency });
  if (opts.trend) metrics.trend = opts.trend;
  const rating = rate(metrics, market.sector, undefined, opts.thresholds);
  const items: CheckItem[] = rating.reasons.map((r, i) => ({ key: `${i}-${r.criterion}`, title: r.criterion, light: r.light, verdict: r.text, details: [] }));
  const overall = rating.light;
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
    dcf: dcfValue(market, opts.dcf, opts.toTradingCurrency, opts.dcfHistory),
    peFair: peFairValue(market, metrics.epsTTM, asOf, opts.toTradingCurrency, opts.epsHistory),
    sources: opts.sources ?? ["Yahoo Finance"],
    dividendsByYear: [...annualTotals(market.dividends)]
      .filter(([y]) => y < year && y >= year - 10)
      .map(([y, total]) => ({ year: y, total })),
    fundamentals: { quarterly: recentFundamentals(opts.chartQuarterly ?? market.quarterly, asOf), annual: recentFundamentals(market.annual, asOf) },
    items,
    overall,
    passed: items.filter((i) => i.light === "GREEN").length,
    rated: items.filter((i) => i.light !== "GREY").length,
  };
}
