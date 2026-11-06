import type { Metrics } from "./metrics";

export type LightColor = "GREEN" | "ORANGE" | "RED" | "GREY";
/** GREY = nur Hinweis (z. B. „zahlt keine Dividende“), zählt weder für noch gegen die Farbe */
export type Reason = { criterion: string; light: LightColor; text: string };

type Band = { green: number; orange: number }; // Grenze grün|orange und orange|rot

export type DcfAssumptions = {
  discountRate: number; // geforderte Rendite (Eigenkapitalkosten)
  terminalGrowth: number; // ewiges Wachstum nach Jahr 10
  maxGrowth: number; // Obergrenze für das Wachstum der ersten 5 Jahre
};

export type Thresholds = {
  payoutEps: Band; // in Anteil (0.6 = 60 %)
  payoutFcf: Band;
  debtToEquity: Band;
  debtChangeYoY: Band;
  dividendCagr5: Band; // Untergrenzen: > green → grün, ≥ orange → orange
  /** Kurs zur EMA 200: grün darüber, orange bis zu diesem Anteil darunter, rot darunter */
  trendBelow: number;
  minCriteria: number;
  /** Annahmen für den fairen Wert nach DCF (Aktien Check) */
  dcf: DcfAssumptions;
  // Abweichende Schwellen für Branchen, in denen EPS-Payout wenig aussagt
  sectors: Record<string, { payoutEps?: Band; payoutFcf?: Band; debtToEquity?: Band; useFcfPayoutOnly?: boolean }>;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  payoutEps: { green: 0.6, orange: 0.8 },
  payoutFcf: { green: 0.7, orange: 1.0 },
  debtToEquity: { green: 1.0, orange: 2.0 },
  debtChangeYoY: { green: 0.1, orange: 0.25 },
  dividendCagr5: { green: 0.05, orange: 0 },
  trendBelow: 0.05,
  minCriteria: 3,
  dcf: { discountRate: 0.08, terminalGrowth: 0.02, maxGrowth: 0.1 },
  sectors: {
    "Real Estate": { payoutFcf: { green: 0.8, orange: 1.0 }, debtToEquity: { green: 1.5, orange: 2.5 }, useFcfPayoutOnly: true },
    Utilities: { payoutEps: { green: 0.75, orange: 0.9 }, debtToEquity: { green: 1.5, orange: 2.5 } },
  },
};

export type OutlookInput = { status: "RAISED" | "CONFIRMED" | "LOWERED" | "UNKNOWN"; dividendCut: boolean; period: string };

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`;
/** Wert mit einer Stelle mehr, wenn er gerundet genau auf einer Grenze landet (z. B. 80,03 % statt „80,0 %“ bei rot über 80 %) */
const pctNear = (v: number, b: Band) => {
  const r = (x: number) => (x * 100).toFixed(1);
  return [b.green, b.orange].some((g) => r(g) === r(v) && g !== v) ? `${(v * 100).toFixed(2).replace(".", ",")} %` : pct(v);
};
const num = (v: number) => v.toFixed(2).replace(".", ",");

/** Höher ist schlechter (Payout, Verschuldung). */
function upper(v: number, b: Band): Rated {
  return v < b.green ? "GREEN" : v <= b.orange ? "ORANGE" : "RED";
}

type Rated = Exclude<LightColor, "GREY">;
const ORDER = { GREEN: 0, ORANGE: 1, RED: 2 } as const;
const money = (v: number) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const day = (iso: string) => iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);

export function rate(m: Metrics, sector: string | undefined, outlook: OutlookInput | undefined, t: Thresholds = DEFAULT_THRESHOLDS) {
  const th = { ...DEFAULT_THRESHOLDS, ...t };
  const s = (sector && th.sectors[sector]) || {};
  const reasons: Reason[] = [];
  // Ohne laufende Dividende spielen Payout, Dividendenwachstum und Kürzung keine Rolle;
  // eine gerade eingestellte Dividende zählt dagegen als Kürzung (rot)
  const status = m.dividendStatus?.value;
  const pays = status !== "none" && status !== "suspended";

  if (status === "none") {
    reasons.push({ criterion: "Dividende", light: "GREY", text: "Zahlt keine Dividende – Payout, Dividendenwachstum und Kürzung entfallen" });
  }
  if (status === "suspended") {
    const last = m.lastDividend?.value.date;
    reasons.push({ criterion: "Dividende", light: "RED", text: `Dividende eingestellt: keine Zahlung in den letzten 13 Monaten${last ? `, letzte am ${day(last)}` : ""}` });
  }
  if (pays && m.payoutEps && !s.useFcfPayoutOnly) {
    const b = s.payoutEps ?? th.payoutEps;
    reasons.push({ criterion: "Payout (EPS)", light: upper(m.payoutEps.value, b), text: `${pctNear(m.payoutEps.value, b)} – grün < ${pct(b.green)}, rot > ${pct(b.orange)}` });
  }
  if (pays && m.payoutFcf) {
    const b = s.payoutFcf ?? th.payoutFcf;
    reasons.push({ criterion: "Payout (FCF)", light: upper(m.payoutFcf.value, b), text: `${pctNear(m.payoutFcf.value, b)} – grün < ${pct(b.green)}, rot > ${pct(b.orange)}` });
  }
  if (m.debtToEquity) {
    const b = s.debtToEquity ?? th.debtToEquity;
    reasons.push({ criterion: "Debt to Equity", light: upper(m.debtToEquity.value, b), text: `${num(m.debtToEquity.value)} – grün < ${num(b.green)}, rot > ${num(b.orange)}` });
  }
  if (m.debtChangeYoY) {
    const b = th.debtChangeYoY;
    reasons.push({ criterion: "Neuverschuldung (Vorjahr)", light: upper(m.debtChangeYoY.value, b), text: `${pctNear(m.debtChangeYoY.value, b)} – grün ≤ ${pct(b.green)}, rot > ${pct(b.orange)}` });
  }
  if (pays && m.dividendCagr5) {
    const v = m.dividendCagr5.value;
    const b = th.dividendCagr5;
    reasons.push({ criterion: "Dividenden-CAGR 5 J.", light: v > b.green ? "GREEN" : v >= b.orange ? "ORANGE" : "RED", text: `${pctNear(v, b)} p. a. – grün > ${pct(b.green)}, rot < ${pct(b.orange)}` });
  }
  if (pays && m.dividendCut?.value) {
    reasons.push({ criterion: "Dividende", light: "RED", text: "Letzte Zahlung mehr als 5 % unter der Vorjahreszahlung" });
  }
  if (m.trend && m.trend.value.ema200 > 0) {
    // Nur der heutige Stand zählt (letzter Kurs gegen heutige EMA), kein Rückblick
    const { price, ema200 } = m.trend.value;
    const gap = price / ema200 - 1;
    const light: Rated = gap > 0 ? "GREEN" : price >= ema200 * (1 - th.trendBelow) ? "ORANGE" : "RED";
    const where = gap > 0 ? `${pct(gap)} über` : `${pct(-gap)} unter`;
    reasons.push({
      criterion: "Kurs zur EMA 200",
      light,
      text: `${where} der EMA 200 (Kurs ${money(price)}, EMA ${money(ema200)}, Stand ${day(m.trend.asOf)}) – grün darüber, rot mehr als ${pct(th.trendBelow)} darunter`,
    });
  }

  const ruleCount = reasons.filter((r) => r.light !== "GREY").length;

  if (outlook && outlook.status !== "UNKNOWN") {
    const label = { RAISED: "angehoben", CONFIRMED: "bestätigt", LOWERED: "gesenkt" }[outlook.status];
    reasons.push({ criterion: "Ausblick (KI)", light: outlook.status === "LOWERED" ? "RED" : "GREEN", text: `Prognose ${label} (Bericht ${outlook.period})` });
  }
  if (outlook?.dividendCut) {
    reasons.push({ criterion: "Ausblick (KI)", light: "RED", text: "Dividendenkürzung angekündigt" });
  }

  // Zu wenig Datenbasis → keine Farbe vergeben
  if (ruleCount < th.minCriteria && !reasons.some((r) => r.light === "RED")) {
    return { light: "GREY" as LightColor, reasons };
  }
  const worst = reasons.reduce<Rated>((w, r) => (r.light !== "GREY" && ORDER[r.light] > ORDER[w] ? r.light : w), "GREEN");
  return { light: worst as LightColor, reasons };
}
