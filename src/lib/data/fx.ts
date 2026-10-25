import "server-only";
import type { Sourced } from "./types";
import { normalizeCurrency } from "../fx-convert";

export { normalizeCurrency };

// EZB-Referenzkurse: 1 EUR = x Fremdwährung
export async function fetchEcbRates(): Promise<Sourced<Record<string, number>> | undefined> {
  const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
  if (!res.ok) return undefined;
  const xml = await res.text();
  const rates: Record<string, number> = { EUR: 1 };
  for (const m of xml.matchAll(/currency='([A-Z]{3})' rate='([\d.]+)'/g)) rates[m[1]] = Number(m[2]);
  const time = xml.match(/time='(\d{4}-\d{2}-\d{2})'/)?.[1];
  if (!time) return undefined;
  return { value: rates, source: "EZB", asOf: time };
}

/** Rechnet einen Betrag in EUR um; undefined, wenn kein Kurs vorliegt. */
export function toEur(amount: number, currency: string, rates: Record<string, number>): number | undefined {
  const { code, factor } = normalizeCurrency(currency);
  const rate = rates[code];
  return rate ? (amount * factor) / rate : undefined;
}

/** Rechnet zwischen zwei Währungen über EUR um. */
export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number | undefined {
  if (from === to) return amount;
  const eur = toEur(amount, from, rates);
  if (eur === undefined) return undefined;
  const { code, factor } = normalizeCurrency(to);
  const rate = rates[code];
  return rate ? (eur * rate) / factor : undefined;
}
