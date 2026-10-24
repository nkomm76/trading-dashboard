import "server-only";
import { normalizeEulerpool } from "./eulerpool-normalize";
import type { StatementRow } from "./types";

// Eulerpool (kostenloser Tarif, 100.000 Abfragen/Monat): nur zum Verlängern der Jahreshistorie.
// Ohne EULERPOOL_API_KEY bleibt alles beim Alten.

const BASE = "https://api.eulerpool.com/api/1/equity";

export const eulerpoolEnabled = () => (process.env.EULERPOOL_API_KEY ?? "").length >= 16;

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.EULERPOOL_API_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Eulerpool ${res.status}`);
  return res.json();
}

/** Jahreswerte (Umsatz, EPS, Aktien, operativer Cashflow, Investitionen) per ISIN; leer bei Fehler oder ohne Schlüssel. */
export async function fetchEulerpoolAnnual(isin: string): Promise<StatementRow[]> {
  if (!eulerpoolEnabled() || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return [];
  try {
    const [income, cashflow] = await Promise.all([get(`incomestatement/${isin}`), get(`cashflowstatement/${isin}`)]);
    return normalizeEulerpool(income, cashflow);
  } catch {
    return [];
  }
}
