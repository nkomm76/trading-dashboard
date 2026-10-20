import type { DividendPayment, MarketData, Sourced, StatementRow } from "./data/types";

// Reine Berechnungsfunktionen. Jede Funktion gibt undefined zurück, wenn die Datenbasis fehlt.

export type Frequency = "monatlich" | "quartalsweise" | "halbjährlich" | "jährlich" | "unregelmäßig";

export type Metrics = {
  price?: Sourced;
  dividendTTM?: Sourced;
  dividendYield?: Sourced;
  yieldOnCost?: Sourced;
  payoutEps?: Sourced;
  payoutFcf?: Sourced;
  dividendCagr3?: Sourced;
  dividendCagr5?: Sourced;
  dividendCagr10?: Sourced;
  dividendCut?: Sourced<boolean>;
  frequency?: Sourced<Frequency>;
  exMonths?: Sourced<string[]>;
  lastDividend?: Sourced<{ date: string; amount: number }>;
  nextExDividend?: Sourced<string>;
  debtToEquity?: Sourced;
  debtChangeQoQ?: Sourced;
  debtChangeYoY?: Sourced;
  fcfLatest?: Sourced;
  fcfTTM?: Sourced;
  epsLatest?: Sourced;
  epsLatestYoY?: Sourced;
  epsTTM?: Sourced;
  financialCurrency?: string;
  latestPeriod?: string; // Periodenende des jüngsten Berichts
};

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;
const today = () => new Date().toISOString().slice(0, 10);

export function dividendsLast12Months(divs: DividendPayment[], asOf = today()): number | undefined {
  const recent = divs.filter((d) => daysBetween(d.date, asOf) >= 0 && daysBetween(d.date, asOf) < 365);
  return recent.length ? recent.reduce((s, d) => s + d.amount, 0) : undefined;
}

export function annualTotals(divs: DividendPayment[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const d of divs) {
    const y = Number(d.date.slice(0, 4));
    totals.set(y, (totals.get(y) ?? 0) + d.amount);
  }
  return totals;
}

/** CAGR über n Jahre auf Basis abgeschlossener Kalenderjahre. */
export function dividendCagr(divs: DividendPayment[], years: number, asOf = today()): number | undefined {
  const totals = annualTotals(divs);
  const end = Number(asOf.slice(0, 4)) - 1;
  const start = end - years;
  const a = totals.get(start);
  const b = totals.get(end);
  // Das Startjahr muss vollständig in der Historie liegen (erste Zahlung vor oder im Startjahr)
  if (!a || !b || !divs.length || Number(divs[0].date.slice(0, 4)) > start) return undefined;
  return Math.pow(b / a, 1 / years) - 1;
}

const MONTH_NAMES = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Monate, in denen die Ex-Tage der letzten 12 Monate lagen (bei Jahreszahlern die letzten 24 Monate). */
export function exDividendMonths(divs: DividendPayment[], asOf = today()): string[] | undefined {
  const window = (days: number) => divs.filter((d) => daysBetween(d.date, asOf) >= 0 && daysBetween(d.date, asOf) < days);
  let recent = window(365);
  if (recent.length < 2) recent = window(730);
  if (!recent.length) return undefined;
  const months = [...new Set(recent.map((d) => Number(d.date.slice(5, 7))))].sort((a, b) => a - b);
  return months.map((m) => MONTH_NAMES[m - 1]);
}

export function detectFrequency(divs: DividendPayment[], asOf = today()): Frequency | undefined {
  const recent = divs.filter((d) => daysBetween(d.date, asOf) >= 0 && daysBetween(d.date, asOf) < 730);
  if (!recent.length) return undefined;
  // Bei kurzer Historie (z. B. junge Aktie) nur den tatsächlich abgedeckten Zeitraum zählen, mindestens 1 Jahr
  const span = daysBetween(recent[0].date, asOf) / 365;
  const perYear = recent.length / Math.min(2, Math.max(1, span));
  if (perYear >= 10) return "monatlich";
  if (perYear >= 3.5) return "quartalsweise";
  if (perYear >= 1.5) return "halbjährlich";
  if (perYear >= 0.5) return "jährlich";
  return "unregelmäßig";
}

const PER_YEAR: Record<Frequency, number> = {
  monatlich: 12,
  quartalsweise: 4,
  halbjährlich: 2,
  jährlich: 1,
  unregelmäßig: 0,
};

/** Kürzung: letzte Zahlung > 5 % unter der vergleichbaren Zahlung ein Jahr zuvor. */
export function detectDividendCut(divs: DividendPayment[], frequency: Frequency | undefined): boolean | undefined {
  const n = frequency ? PER_YEAR[frequency] : 0;
  if (!n || divs.length <= n) return undefined;
  const last = divs[divs.length - 1].amount;
  const yearAgo = divs[divs.length - 1 - n].amount;
  return last < yearAgo * 0.95;
}

/** Summe der letzten vier Quartale, nur wenn sie lückenlos aufeinander folgen. */
export function ttmSum(rows: StatementRow[], key: keyof Omit<StatementRow, "date">): { value: number; asOf: string } | undefined {
  const withVal = rows.filter((r) => typeof r[key] === "number");
  if (withVal.length < 4) return undefined;
  const last4 = withVal.slice(-4);
  for (let i = 1; i < 4; i++) {
    const gap = daysBetween(last4[i - 1].date, last4[i].date);
    if (gap < 80 || gap > 100) return undefined;
  }
  return { value: last4.reduce((s, r) => s + (r[key] as number), 0), asOf: last4[3].date };
}

function latest(rows: StatementRow[], key: keyof Omit<StatementRow, "date">) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (typeof v === "number") return { value: v, date: rows[i].date, index: i };
  }
  return undefined;
}

/** Wert ca. ein Jahr vor dem angegebenen Datum (±45 Tage). */
function yearBefore(rows: StatementRow[], key: keyof Omit<StatementRow, "date">, date: string) {
  return rows.find((r) => typeof r[key] === "number" && Math.abs(daysBetween(r.date, date) - 365) <= 45)?.[key] as
    | number
    | undefined;
}

export function fcfOf(r: StatementRow): number | undefined {
  if (typeof r.freeCashFlow === "number") return r.freeCashFlow;
  if (typeof r.operatingCashFlow === "number" && typeof r.capitalExpenditure === "number")
    return r.operatingCashFlow + r.capitalExpenditure;
  return undefined;
}

export type MetricInput = {
  market: MarketData;
  avgCost?: number; // Ø-Kaufkurs in Handelswährung
  /** Rechnet Bilanzwährung → Handelswährung um (für EPS-Vergleich mit Dividende) */
  toTradingCurrency?: (amount: number) => number | undefined;
  asOf?: string;
};

export function computeMetrics({ market, avgCost, toTradingCurrency, asOf = today() }: MetricInput): Metrics {
  const m: Metrics = { financialCurrency: market.financialCurrency };
  const Y = "Yahoo Finance";
  const CALC = "berechnet";
  const divs = market.dividends;

  m.price = market.price;
  m.nextExDividend = market.nextExDividend;

  // Dividenden
  const divTTM = dividendsLast12Months(divs, asOf);
  if (divTTM !== undefined) {
    m.dividendTTM = { value: divTTM, source: Y, asOf, period: "TTM" };
    if (market.price) m.dividendYield = { value: divTTM / market.price.value, source: CALC, asOf: market.price.asOf, period: "TTM" };
    if (avgCost) m.yieldOnCost = { value: divTTM / avgCost, source: CALC, asOf, period: "TTM" };
  }
  for (const [years, key] of [[3, "dividendCagr3"], [5, "dividendCagr5"], [10, "dividendCagr10"]] as const) {
    const c = dividendCagr(divs, years, asOf);
    if (c !== undefined) m[key] = { value: c, source: CALC, asOf, note: `${years} abgeschlossene Kalenderjahre` };
  }
  const freq = detectFrequency(divs, asOf);
  if (freq) m.frequency = { value: freq, source: CALC, asOf, note: "aus Zahlungen der letzten 24 Monate" };
  const months = exDividendMonths(divs, asOf);
  if (months) m.exMonths = { value: months, source: Y, asOf, note: "Monate der Ex-Tage" };
  const last = divs.at(-1);
  if (last) m.lastDividend = { value: last, source: Y, asOf: last.date };
  const cut = detectDividendCut(divs, freq);
  if (cut !== undefined) m.dividendCut = { value: cut, source: CALC, asOf };

  // EPS: bevorzugt Summe der letzten 4 Quartale, sonst Yahoo-TTM, sonst letztes Geschäftsjahr
  const q = market.quarterly;
  const a = market.annual;
  const epsQ = ttmSum(q, "dilutedEPS");
  const epsA = latest(a, "dilutedEPS");
  if (epsQ) m.epsTTM = { value: epsQ.value, source: Y, asOf: epsQ.asOf, period: "TTM" };
  else if (market.epsTTM) m.epsTTM = market.epsTTM;
  else if (epsA) m.epsTTM = { value: epsA.value, source: Y, asOf: epsA.date, period: "Jahr" };

  const epsLast = latest(q, "dilutedEPS");
  if (epsLast) {
    m.epsLatest = { value: epsLast.value, source: Y, asOf: epsLast.date, period: "Quartal" };
    const prev = yearBefore(q, "dilutedEPS", epsLast.date);
    if (prev) m.epsLatestYoY = { value: (epsLast.value - prev) / Math.abs(prev), source: CALC, asOf: epsLast.date, period: "Quartal" };
  } else if (epsA) {
    m.epsLatest = { value: epsA.value, source: Y, asOf: epsA.date, period: "Jahr" };
  }

  // Payout (EPS-basiert): Dividende je Aktie / EPS – beide in Handelswährung
  if (divTTM !== undefined && m.epsTTM && m.epsTTM.value > 0) {
    const sameCurrency = !market.financialCurrency || market.financialCurrency === market.currency;
    const epsTrading = sameCurrency ? m.epsTTM.value : toTradingCurrency?.(m.epsTTM.value);
    if (epsTrading) m.payoutEps = { value: divTTM / epsTrading, source: CALC, asOf: m.epsTTM.asOf, period: m.epsTTM.period };
  }

  // Free Cashflow
  const qFcf = q.map((r) => ({ date: r.date, freeCashFlow: fcfOf(r) }));
  const fcfQ = ttmSum(qFcf, "freeCashFlow");
  const fcfLastQ = latest(qFcf, "freeCashFlow");
  const aFcf = a.map((r) => ({ date: r.date, freeCashFlow: fcfOf(r) }));
  const fcfLastA = latest(aFcf, "freeCashFlow");
  if (fcfLastQ) m.fcfLatest = { value: fcfLastQ.value, source: Y, asOf: fcfLastQ.date, period: "Quartal" };
  else if (fcfLastA) m.fcfLatest = { value: fcfLastA.value, source: Y, asOf: fcfLastA.date, period: "Jahr" };
  if (fcfQ) m.fcfTTM = { value: fcfQ.value, source: Y, asOf: fcfQ.asOf, period: "TTM" };
  else if (fcfLastA) m.fcfTTM = { value: fcfLastA.value, source: Y, asOf: fcfLastA.date, period: "Jahr" };

  // FCF-Payout: gezahlte Dividenden / FCF – beide aus derselben Cashflow-Rechnung
  const divPaidQ = ttmSum(q, "cashDividendsPaid");
  const divPaidA = latest(a, "cashDividendsPaid");
  if (fcfQ && divPaidQ && fcfQ.value > 0) {
    m.payoutFcf = { value: Math.abs(divPaidQ.value) / fcfQ.value, source: CALC, asOf: fcfQ.asOf, period: "TTM" };
  } else if (fcfLastA && divPaidA && divPaidA.date === fcfLastA.date && fcfLastA.value > 0) {
    m.payoutFcf = { value: Math.abs(divPaidA.value) / fcfLastA.value, source: CALC, asOf: fcfLastA.date, period: "Jahr" };
  }

  // Verschuldung: jüngster Stichtag aus Quartals- oder Jahresdaten
  const all = [...q, ...a].sort((x, y) => x.date.localeCompare(y.date));
  const debt = latest(all, "totalDebt");
  const equity = latest(all, "stockholdersEquity");
  if (debt && equity && debt.date === equity.date && equity.value > 0) {
    m.debtToEquity = { value: debt.value / equity.value, source: CALC, asOf: debt.date };
  }
  const debtQ = latest(q, "totalDebt");
  if (debtQ) {
    const prev = q
      .slice(0, debtQ.index)
      .reverse()
      .find((r) => typeof r.totalDebt === "number" && daysBetween(r.date, debtQ.date) <= 100);
    if (prev?.totalDebt)
      m.debtChangeQoQ = { value: (debtQ.value - prev.totalDebt) / prev.totalDebt, source: CALC, asOf: debtQ.date, period: "Quartal", note: `ggü. ${prev.date}` };
  }
  if (debt) {
    const prevY = yearBefore(all, "totalDebt", debt.date);
    if (prevY) m.debtChangeYoY = { value: (debt.value - prevY) / prevY, source: CALC, asOf: debt.date, note: "ggü. Vorjahr" };
  }

  const periods = [...q, ...a].map((r) => r.date).sort();
  m.latestPeriod = periods.at(-1);
  return m;
}
