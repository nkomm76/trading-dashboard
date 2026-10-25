import type { PricePoint, StatementRow } from "./data/types";

// Fairer Wert nach KGV: Gewinn je Aktie zum jeweiligen Zeitpunkt × Ø-KGV der letzten Jahre (ohne Netzwerk, testbar).
// Konstante Faktoren (Währung, ADR-Verhältnis) kürzen sich heraus, weil KGV und Kurve aus derselben Gewinnreihe stammen.

export type EpsPoint = { date: string; eps: number };

export type PeFairValue = {
  value: number; // heutiger fairer Wert je Aktie (Handelswährung)
  eps: number; // Gewinn je Aktie, auf dem der heutige Wert beruht
  epsBasis: string;
  pe: number; // Ø-KGV
  minPe: number;
  maxPe: number;
  months: number;
  from: string;
  to: string;
  deviation?: number; // Kurs / fairer Wert − 1
  /** Stützpunkte des Gewinns je Aktie (Handelswährung) für die Kurve im Kurschart */
  points: EpsPoint[];
  notes: string[];
};
export type PeFairResult = PeFairValue | { unavailable: string };

const DAY = 86_400_000;
const YEAR_MS = 365.25 * DAY;
const MAX_PE = 100; // darüber ist der Gewinn so klein, dass das KGV nichts mehr aussagt

/**
 * Gewinn je Aktie zum Zeitpunkt t: zwischen Stichtagen weich (monotone kubische Interpolation, ohne Überschwinger),
 * nach dem letzten der letzte, vor dem ersten keiner.
 */
export function epsAt(points: EpsPoint[], t: number): number | undefined {
  if (!points.length) return undefined;
  const x = points.map((p) => Date.parse(p.date));
  if (t < x[0]) return undefined;
  const n = points.length;
  if (t >= x[n - 1]) return points[n - 1].eps;
  let i = 0;
  while (x[i + 1] <= t) i++;
  const y = points.map((p) => p.eps);
  const slope = (k: number) => (y[k + 1] - y[k]) / (x[k + 1] - x[k]);
  // Steigung an einem Stützpunkt: 0 bei Richtungswechsel, sonst harmonisches Mittel (Fritsch–Carlson)
  const tangent = (k: number) => {
    if (k === 0) return slope(0);
    if (k === n - 1) return slope(n - 2);
    const a = slope(k - 1);
    const b = slope(k);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const h = x[i + 1] - x[i];
  const s = (t - x[i]) / h;
  const h00 = (1 + 2 * s) * (1 - s) ** 2;
  const h10 = s * (1 - s) ** 2;
  const h01 = s * s * (3 - 2 * s);
  const h11 = s * s * (s - 1);
  return h00 * y[i] + h10 * h * tangent(i) + h01 * y[i + 1] + h11 * h * tangent(i + 1);
}

/** Fairer Wert zum Zeitpunkt t (Gewinn × KGV); bei Verlust keiner. */
export function fairAt(points: EpsPoint[], pe: number, t: number): number | undefined {
  const e = epsAt(points, t);
  return e !== undefined && e > 0 ? e * pe : undefined;
}

/**
 * Stützpunkte aus Jahres-EPS (Geschäftsjahresende) und dem jüngsten 12-Monats-EPS, geglättet als Ø der letzten 3 Jahre.
 * Einmaleffekte (Verkaufsgewinne, Rückstellungen) schlagen so nur zu einem Drittel durch.
 * Das 12-Monats-EPS wird nur genommen, wenn es neuer ist und zur Jahresreihe passt (Faktor ≤ 3).
 */
export function epsSeries(annual: StatementRow[], ttm?: EpsPoint, years = 3): EpsPoint[] {
  const raw = annual
    .filter((r): r is StatementRow & { dilutedEPS: number } => typeof r.dilutedEPS === "number" && Number.isFinite(r.dilutedEPS))
    .map((r) => ({ date: r.date, eps: r.dilutedEPS }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const mean = (list: EpsPoint[]) => list.reduce((a, p) => a + p.eps, 0) / list.length;
  const points = raw.map((p, i) => ({ date: p.date, eps: mean(raw.slice(Math.max(0, i - years + 1), i + 1)) }));
  const last = raw.at(-1);
  if (ttm && (!last || (Date.parse(ttm.date) - Date.parse(last.date) > 45 * DAY && plausible(ttm.eps, last.eps)))) {
    // Die 12 Monate überschneiden sich mit dem letzten Geschäftsjahr: nur ältere Jahre dazunehmen
    const before = raw.filter((p) => Date.parse(p.date) <= Date.parse(ttm.date) - 300 * DAY).slice(-(years - 1));
    points.push({ date: ttm.date, eps: mean([...before, ttm]) });
  }
  return points;
}

const plausible = (a: number, b: number) => a > 0 && b > 0 && a / b <= 3 && b / a <= 3;

/** Ø-KGV aus Monatsschlusskursen der letzten `years` Jahre; heutiger fairer Wert = aktueller Gewinn × Ø-KGV. */
export function fairValueByPe(
  points: EpsPoint[],
  closes: PricePoint[] | undefined,
  price: number | undefined,
  asOf: string,
  years = 5,
): PeFairResult {
  if (points.length < 2) return { unavailable: "Zu wenige Jahre mit Gewinn je Aktie in den Quellen" };
  const end = Date.parse(asOf);
  const pes: { date: string; pe: number }[] = [];
  for (const c of closes ?? []) {
    const t = Date.parse(c.date);
    if (t > end || t < end - years * YEAR_MS || c.close <= 0) continue;
    const e = epsAt(points, t);
    if (e === undefined || e <= 0) continue;
    const pe = c.close / e;
    if (pe <= MAX_PE) pes.push({ date: c.date, pe });
  }
  if (pes.length < 36) return { unavailable: "Weniger als 3 Jahre mit positivem Gewinn und Kurs für ein Ø-KGV" };

  const pe = pes.reduce((a, x) => a + x.pe, 0) / pes.length;
  const current = points.at(-1)!;
  if (current.eps <= 0) return { unavailable: "Aktuell kein Gewinn – kein fairer Wert nach KGV" };
  const value = current.eps * pe;
  const notes: string[] = [];
  if (pes.length < 54) notes.push(`nur ${(pes.length / 12).toFixed(1).replace(".", ",")} Jahre für das Ø-KGV`);
  const skipped = (closes ?? []).filter((c) => {
    const t = Date.parse(c.date);
    return t <= end && t >= end - years * YEAR_MS;
  }).length - pes.length;
  if (skipped > 6) notes.push(`${skipped} Monate ohne Gewinn oder mit KGV über ${MAX_PE} nicht berücksichtigt`);
  return {
    value,
    eps: current.eps,
    epsBasis: "",
    pe,
    minPe: Math.min(...pes.map((x) => x.pe)),
    maxPe: Math.max(...pes.map((x) => x.pe)),
    months: pes.length,
    from: pes[0].date,
    to: pes[pes.length - 1].date,
    deviation: price ? price / value - 1 : undefined,
    points,
    notes,
  };
}
