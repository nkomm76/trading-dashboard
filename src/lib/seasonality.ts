import type { PricePoint } from "./data/types";

// Saisonalität aus Tageskursen (dividendenbereinigt, sonst erscheint der Ex-Tag als Saison-Tief).

export type SeasonalPathPoint = { day: number; avg: number; current?: number };
export type SeasonalMonth = { month: number; avg: number; positive: number; count: number };
export type Seasonality = { years: number[]; path: SeasonalPathPoint[]; months: SeasonalMonth[] };

/** Tag im Jahr 1–365 auf ein Nicht-Schaltjahr bezogen (29.2. zählt als 28.2.). */
export function dayOfYear(iso: string): number {
  const m = Number(iso.slice(5, 7));
  const d = Math.min(Number(iso.slice(8, 10)), m === 2 ? 28 : 31);
  return Math.round((Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 1)) / 86_400_000) + 1;
}

/**
 * Verlauf seit Jahresbeginn je Kalendertag, Basis = letzter Schlusskurs des Vorjahres; Handelspausen werden fortgeschrieben.
 * Abgeschlossene Jahre bis 31.12., das laufende Jahr nur bis zum letzten Kurs.
 */
function yearPath(points: PricePoint[], year: number, running = false): (number | undefined)[] | undefined {
  const start = `${year}-01-01`;
  const base = [...points].reverse().find((p) => p.date < start)?.close;
  const inYear = points.filter((p) => p.date.startsWith(String(year)));
  if (!base || !inYear.length) return undefined;
  const lastDay = running ? dayOfYear(inYear[inYear.length - 1].date) : 365;
  const path: (number | undefined)[] = new Array(366).fill(undefined);
  let i = 0;
  let cum = 0;
  for (let d = 1; d <= 365; d++) {
    while (i < inYear.length && dayOfYear(inYear[i].date) <= d) cum = inYear[i++].close / base - 1;
    path[d] = d <= lastDay ? cum : undefined;
  }
  return path;
}

export function computeSeasonality(points: PricePoint[], yearsBack: number, currentYear: number): Seasonality | undefined {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const years: number[] = [];
  const paths: (number | undefined)[][] = [];
  for (let y = currentYear - yearsBack; y < currentYear; y++) {
    const p = yearPath(sorted, y);
    // Nur volle Jahre: Kurse bis mindestens Mitte Dezember
    if (p && dayOfYear(sorted.filter((x) => x.date.startsWith(String(y))).at(-1)!.date) >= 350) {
      years.push(y);
      paths.push(p);
    }
  }
  if (years.length < 2) return undefined;

  const current = yearPath(sorted, currentYear, true);
  const path: SeasonalPathPoint[] = [];
  for (let d = 1; d <= 365; d++) {
    const avg = paths.reduce((a, p) => a + (p[d] as number), 0) / paths.length;
    path.push({ day: d, avg, current: current?.[d] });
  }

  const months: SeasonalMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const rets: number[] = [];
    for (const y of years) {
      const mm = String(m).padStart(2, "0");
      const from = `${y}-${mm}-01`;
      const prev = [...sorted].reverse().find((p) => p.date < from)?.close;
      const end = [...sorted].reverse().find((p) => p.date.startsWith(`${y}-${mm}`))?.close;
      if (prev && end) rets.push(end / prev - 1);
    }
    if (rets.length) months.push({ month: m, avg: rets.reduce((a, r) => a + r, 0) / rets.length, positive: rets.filter((r) => r > 0).length, count: rets.length });
  }
  return { years, path, months };
}
