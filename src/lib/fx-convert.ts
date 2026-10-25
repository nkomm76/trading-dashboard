import { valueAt, type TimeValue } from "./ema";

// Umrechnung in Euro mit dem Wechselkurs des jeweiligen Tages (ohne Netzwerk, testbar).

/** Wechselkurse als Zeitreihe: Einheiten der Fremdwährung je 1 EUR (wie die EZB-Referenzkurse). */
export type FxSeries = TimeValue[];

// Normalisiert Kurs-Notierungen in Unterwährungen (z. B. London in Pence)
export function normalizeCurrency(currency: string): { code: string; factor: number } {
  if (currency === "GBp" || currency === "GBX") return { code: "GBP", factor: 0.01 };
  if (currency === "ZAc") return { code: "ZAR", factor: 0.01 };
  if (currency === "ILA") return { code: "ILS", factor: 0.01 };
  return { code: currency.toUpperCase(), factor: 1 };
}

export type ToEur = (amount: number, t: number) => number;

/**
 * Umrechner Betrag (in `currency`) → EUR zum Kurs des Tages t. Vor Beginn der Reihe gilt der erste, danach der letzte Kurs;
 * ohne Reihe der feste Ersatzkurs. Undefined, wenn gar kein Kurs vorliegt.
 */
export function eurConverter(currency: string, series: FxSeries | undefined, fallbackRate?: number): ToEur | undefined {
  const { code, factor } = normalizeCurrency(currency);
  if (code === "EUR") return (amount) => amount * factor;
  if (series?.length) {
    return (amount, t) => amount * factor / (valueAt(series, t) ?? series[0].value);
  }
  return fallbackRate ? (amount) => (amount * factor) / fallbackRate : undefined;
}
