import type { Sourced } from "./data/types";

const de = "de-DE";

export const fmtMoney = (v: number | undefined, currency = "EUR") =>
  v === undefined ? "–" : new Intl.NumberFormat(de, { style: "currency", currency: currency === "GBp" ? "GBP" : currency, maximumFractionDigits: 2 }).format(currency === "GBp" ? v / 100 : v);

export const fmtNum = (v: number | undefined, digits = 2) =>
  v === undefined ? "–" : new Intl.NumberFormat(de, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

export const fmtPct = (v: number | undefined, digits = 1) =>
  v === undefined ? "–" : new Intl.NumberFormat(de, { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

/** Große Beträge kompakt, z. B. 7,3 Mrd. */
export const fmtBig = (v: number | undefined, currency?: string) =>
  v === undefined
    ? "–"
    : new Intl.NumberFormat(de, { notation: "compact", maximumFractionDigits: 1, ...(currency ? { style: "currency", currency } : {}) }).format(v);

// Reine Datumsangaben (Stichtage, Ex-Tage, Kauf- und Kursdaten) stehen für Mitternacht UTC. In Ortszeit
// formatiert rutschen sie westlich von UTC auf den Vortag (Kurs vom Freitag erschien als „Stand Donnerstag“).
const dateOnly = (iso: string) => /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(iso);

export const fmtDate = (iso: string | undefined) =>
  iso ? new Intl.DateTimeFormat(de, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: dateOnly(iso) ? "UTC" : undefined }).format(new Date(iso)) : "–";

/** Tooltip-Text mit Herkunft eines Werts */
export const sourceHint = (s: Sourced<unknown> | undefined) =>
  s ? [s.source, `Stand ${fmtDate(s.asOf)}`, s.period, s.note].filter(Boolean).join(" · ") : "Keine Quelle verfügbar";

/** Monate der Ex-Tage, bei Monatszahlern kurz „jeden Monat“ */
export const fmtMonths = (months: string[]) => (months.length >= 12 ? "jeden Monat" : months.join(", "));
