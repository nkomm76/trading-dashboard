import type { Metrics } from "./metrics";

export type LightColor = "GREEN" | "ORANGE" | "RED" | "GREY";
export type Reason = { criterion: string; light: Exclude<LightColor, "GREY">; text: string };

type Band = { green: number; orange: number }; // Grenze grün|orange und orange|rot

export type Thresholds = {
  payoutEps: Band; // in Anteil (0.6 = 60 %)
  payoutFcf: Band;
  debtToEquity: Band;
  debtChangeYoY: Band;
  dividendCagr5: Band; // Untergrenzen: > green → grün, ≥ orange → orange
  minCriteria: number;
  // Abweichende Schwellen für Branchen, in denen EPS-Payout wenig aussagt
  sectors: Record<string, { payoutEps?: Band; payoutFcf?: Band; debtToEquity?: Band; useFcfPayoutOnly?: boolean }>;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  payoutEps: { green: 0.6, orange: 0.8 },
  payoutFcf: { green: 0.7, orange: 1.0 },
  debtToEquity: { green: 1.0, orange: 2.0 },
  debtChangeYoY: { green: 0.1, orange: 0.25 },
  dividendCagr5: { green: 0.05, orange: 0 },
  minCriteria: 3,
  sectors: {
    "Real Estate": { payoutFcf: { green: 0.8, orange: 1.0 }, debtToEquity: { green: 1.5, orange: 2.5 }, useFcfPayoutOnly: true },
    Utilities: { payoutEps: { green: 0.75, orange: 0.9 }, debtToEquity: { green: 1.5, orange: 2.5 } },
  },
};

export type OutlookInput = { status: "RAISED" | "CONFIRMED" | "LOWERED" | "UNKNOWN"; dividendCut: boolean; period: string };

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`;
const num = (v: number) => v.toFixed(2).replace(".", ",");

/** Höher ist schlechter (Payout, Verschuldung). */
function upper(v: number, b: Band): Reason["light"] {
  return v < b.green ? "GREEN" : v <= b.orange ? "ORANGE" : "RED";
}

const ORDER = { GREEN: 0, ORANGE: 1, RED: 2 } as const;

export function rate(m: Metrics, sector: string | undefined, outlook: OutlookInput | undefined, t: Thresholds = DEFAULT_THRESHOLDS) {
  const s = (sector && t.sectors[sector]) || {};
  const reasons: Reason[] = [];

  if (m.payoutEps && !s.useFcfPayoutOnly) {
    const b = s.payoutEps ?? t.payoutEps;
    reasons.push({ criterion: "Payout (EPS)", light: upper(m.payoutEps.value, b), text: `${pct(m.payoutEps.value)} – grün < ${pct(b.green)}, rot > ${pct(b.orange)}` });
  }
  if (m.payoutFcf) {
    const b = s.payoutFcf ?? t.payoutFcf;
    reasons.push({ criterion: "Payout (FCF)", light: upper(m.payoutFcf.value, b), text: `${pct(m.payoutFcf.value)} – grün < ${pct(b.green)}, rot > ${pct(b.orange)}` });
  }
  if (m.debtToEquity) {
    const b = s.debtToEquity ?? t.debtToEquity;
    reasons.push({ criterion: "Debt to Equity", light: upper(m.debtToEquity.value, b), text: `${num(m.debtToEquity.value)} – grün < ${num(b.green)}, rot > ${num(b.orange)}` });
  }
  if (m.debtChangeYoY) {
    const b = t.debtChangeYoY;
    reasons.push({ criterion: "Neuverschuldung (Vorjahr)", light: upper(m.debtChangeYoY.value, b), text: `${pct(m.debtChangeYoY.value)} – grün ≤ ${pct(b.green)}, rot > ${pct(b.orange)}` });
  }
  if (m.dividendCagr5) {
    const v = m.dividendCagr5.value;
    const b = t.dividendCagr5;
    reasons.push({ criterion: "Dividenden-CAGR 5 J.", light: v > b.green ? "GREEN" : v >= b.orange ? "ORANGE" : "RED", text: `${pct(v)} p. a. – grün > ${pct(b.green)}, rot < ${pct(b.orange)}` });
  }
  if (m.dividendCut?.value) {
    reasons.push({ criterion: "Dividende", light: "RED", text: "Letzte Zahlung mehr als 5 % unter der Vorjahreszahlung" });
  }

  const ruleCount = reasons.length;

  if (outlook && outlook.status !== "UNKNOWN") {
    const label = { RAISED: "angehoben", CONFIRMED: "bestätigt", LOWERED: "gesenkt" }[outlook.status];
    reasons.push({ criterion: "Ausblick (KI)", light: outlook.status === "LOWERED" ? "RED" : "GREEN", text: `Prognose ${label} (Bericht ${outlook.period})` });
  }
  if (outlook?.dividendCut) {
    reasons.push({ criterion: "Ausblick (KI)", light: "RED", text: "Dividendenkürzung angekündigt" });
  }

  // Zu wenig Datenbasis → keine Farbe vergeben
  if (ruleCount < t.minCriteria && !reasons.some((r) => r.light === "RED")) {
    return { light: "GREY" as LightColor, reasons };
  }
  const worst = reasons.reduce<Reason["light"]>((w, r) => (ORDER[r.light] > ORDER[w] ? r.light : w), "GREEN");
  return { light: worst as LightColor, reasons };
}
