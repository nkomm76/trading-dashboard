import type { StatementRow } from "./types";

// Aufbereitung und Plausibilisierung der Eulerpool-Jahreswerte (ohne Netzwerk, testbar).
// Eulerpool liefert Beträge und Aktienzahlen in Millionen und mischt Schätzungen („2027-12-31e“) unter die Ist-Werte.

type Raw = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const mio = (v: unknown) => (num(v) === undefined ? undefined : (v as number) * 1e6);

/** Geschäftsjahr: Abschlüsse in den ersten Januartagen (52/53-Wochen-Jahr) zählen zum Vorjahr. */
export const fiscalYear = (date: string) => (date.slice(5, 7) === "01" && Number(date.slice(8, 10)) <= 10 ? Number(date.slice(0, 4)) - 1 : Number(date.slice(0, 4)));

const isActual = (r: Raw) => typeof r.period === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.period);

/** Jahres-GuV und Jahres-Cashflow zu StatementRows je Geschäftsjahr zusammenführen. */
export function normalizeEulerpool(income: unknown, cashflow: unknown): StatementRow[] {
  const rows = new Map<number, StatementRow>();
  for (const r of (Array.isArray(income) ? income : []) as Raw[]) {
    if (!isActual(r)) continue;
    const date = r.period as string;
    rows.set(fiscalYear(date), {
      date,
      totalRevenue: mio(r.revenue),
      dilutedEPS: num(r.diluted_eps),
      dilutedAverageShares: mio(r.shares),
    });
  }
  for (const c of (Array.isArray(cashflow) ? cashflow : []) as Raw[]) {
    if (!isActual(c)) continue;
    const row = rows.get(fiscalYear(c.period as string));
    if (!row) continue;
    row.operatingCashFlow = mio(c.netOperatingCashFlow);
    row.capitalExpenditure = mio(c.capex);
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type Extension = { rows: StatementRow[]; addedYears: number[]; rejected?: string };

const deviates = (a: number | undefined, b: number | undefined, tolerance: number) =>
  a !== undefined && b !== undefined && Math.abs(a - b) > tolerance * Math.max(Math.abs(a), Math.abs(b));

/**
 * Verlängert die Jahreshistorie der Hauptquelle um ältere Eulerpool-Jahre.
 * Vorher müssen die Jahre, die beide Quellen haben, zusammenpassen (Umsatz ±10 %, operativer Cashflow ±15 %);
 * sonst bleibt es bei der Hauptquelle. Jüngere Jahre der Hauptquelle werden nie ersetzt.
 * `compare` schränkt den Abgleich ein, z. B. nur Cashflow, wenn der Umsatz rückwirkend geändert wurde (Abspaltungen).
 */
/** Zeile mit mindestens einem Wert – Yahoo liefert für ältere Jahre teils leere Zeilen. */
const hasData = (r: StatementRow) => Object.entries(r).some(([k, v]) => k !== "date" && typeof v === "number");

export function extendHistory(allBase: StatementRow[], extra: StatementRow[], window = 6, compare: ("revenue" | "cashflow")[] = ["revenue", "cashflow"]): Extension {
  // Leere Zeilen zählen nicht als Jahr, sonst bleibt zu wenig Platz für ältere Jahre
  const base = allBase.filter(hasData);
  if (!extra.length) return { rows: base, addedYears: [] };
  const baseYears = new Map(base.map((r) => [fiscalYear(r.date), r]));
  const overlap = extra.filter((e) => baseYears.has(fiscalYear(e.date)));
  if (!overlap.length) return { rows: base, addedYears: [], rejected: "keine gemeinsamen Jahre zum Abgleich" };
  for (const e of overlap) {
    const b = baseYears.get(fiscalYear(e.date))!;
    if (compare.includes("revenue") && deviates(b.totalRevenue, e.totalRevenue, 0.1)) return { rows: base, addedYears: [], rejected: `Umsatz ${fiscalYear(e.date)} weicht ab` };
    if (compare.includes("cashflow") && deviates(b.operatingCashFlow, e.operatingCashFlow, 0.15)) return { rows: base, addedYears: [], rejected: `Cashflow ${fiscalYear(e.date)} weicht ab` };
  }
  const firstBase = base.length ? Math.min(...baseYears.keys()) : Infinity;
  // Nur so viele ältere Jahre, wie das Auswertungsfenster (5 Jahre = 6 Stichtage) noch aufnehmen kann
  const room = Math.max(0, window - base.length);
  const candidates = extra.filter((e) => fiscalYear(e.date) < firstBase);
  const older = room ? candidates.slice(-room) : [];
  return {
    rows: [...older, ...base].sort((a, b) => a.date.localeCompare(b.date)),
    addedYears: older.map((e) => fiscalYear(e.date)),
  };
}
