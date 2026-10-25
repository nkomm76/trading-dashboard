import "server-only";
import { eurConverter, normalizeCurrency, type FxSeries, type ToEur } from "../fx-convert";
import { getFxRates } from "../settings";
import { fetchFxDaily } from "./yahoo";

// Wechselkurse je Tag für die Euro-Anzeige; 6 Stunden im Speicher, um Yahoo nicht bei jedem Chart zu fragen.
const TTL = 6 * 3600_000;
const cache = new Map<string, { at: number; series: FxSeries }>();

async function fxSeries(code: string): Promise<FxSeries | undefined> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL) return hit.series;
  // 12 Jahre: reicht für 10 Jahre Dividenden und den 8-jährigen Vorlauf der Durchschnitte
  const series = await fetchFxDaily(code, new Date(Date.now() - 12 * 365.25 * 86_400_000)).catch(() => undefined);
  if (series?.length) cache.set(code, { at: Date.now(), series });
  return series?.length ? series : hit?.series;
}

/** Umrechner von `currency` in Euro zum Tageskurs; ersatzweise zum aktuellen EZB-Kurs, sonst undefined. */
export async function toEurConverter(currency: string): Promise<ToEur | undefined> {
  const { code } = normalizeCurrency(currency);
  if (code === "EUR") return eurConverter(currency, undefined);
  const [series, ecb] = await Promise.all([fxSeries(code), getFxRates()]);
  return eurConverter(currency, series, ecb?.rates[code]);
}
