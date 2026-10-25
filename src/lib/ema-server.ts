import "server-only";
import { fetchCloses } from "./data/yahoo";
import { toEurConverter } from "./data/fx-history";

/** Schlusskurse in Euro zum Wechselkurs des jeweiligen Tages, wie im Kurschart; leer ohne Kurse oder Wechselkurs. */
export async function eurCloses(symbol: string, from: Date, interval: "1d" | "1wk"): Promise<{ time: number; close: number }[]> {
  const res = await fetchCloses(symbol, from, interval).catch(() => undefined);
  const toEur = res?.currency ? await toEurConverter(res.currency) : undefined;
  return toEur && res ? res.points.map((p) => ({ time: p.time, close: toEur(p.close, p.time) })) : [];
}
