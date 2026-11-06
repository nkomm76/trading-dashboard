import "server-only";
import { fetchCloses } from "./data/yahoo";
import { toEurConverter } from "./data/fx-history";
import { ema } from "./ema";
import type { Metrics } from "./metrics";

/** Schlusskurse in Euro zum Wechselkurs des jeweiligen Tages, wie im Kurschart; leer ohne Kurse oder Wechselkurs. */
export async function eurCloses(symbol: string, from: Date, interval: "1d" | "1wk"): Promise<{ time: number; close: number }[]> {
  const res = await fetchCloses(symbol, from, interval).catch(() => undefined);
  const toEur = res?.currency ? await toEurConverter(res.currency) : undefined;
  return toEur && res ? res.points.map((p) => ({ time: p.time, close: toEur(p.close, p.time) })) : [];
}

/** Letzter Kurs und EMA 200 aus 8 Jahren Tageskursen in Euro, wie im Kurschart; undefined ohne genug Kurse. */
export async function trendOf(symbol: string): Promise<Metrics["trend"]> {
  const daily = await eurCloses(symbol, new Date(Date.now() - 8 * 365 * 86_400_000), "1d");
  const line = ema(daily, 200);
  const last = daily.at(-1);
  if (!last || !line.length) return undefined;
  return {
    value: { price: last.close, ema200: line[line.length - 1].value },
    source: "berechnet",
    asOf: new Date(last.time).toISOString().slice(0, 10),
    note: "Tageskurse in Euro wie im Kurschart",
  };
}
