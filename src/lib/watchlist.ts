import type { CheckResult } from "./check";
import type { LightColor } from "./rating";

// Kurzfassung eines Aktien Checks für die Watchliste (ohne Netzwerk, testbar)

export type WatchSummary = {
  passed: number;
  total: number;
  items: { title: string; light: LightColor; verdict: string }[];
  price?: { value: number; asOf: string };
  expectedYield?: number;
  fairValue?: number;
  dcf?: number;
  /** DCF-Spanne (Abzinsung ±1 Prozentpunkt) */
  dcfRange?: [number, number];
};

export function summarize(r: CheckResult): WatchSummary {
  return {
    passed: r.passed,
    total: r.items.length,
    items: r.items.map((i) => ({ title: i.title, light: i.light, verdict: i.verdict })),
    price: r.price,
    expectedYield: r.expectedYield?.value,
    fairValue: r.fairValue?.value,
    dcf: r.dcf && !("unavailable" in r.dcf) ? r.dcf.value : undefined,
    dcfRange: r.dcf && !("unavailable" in r.dcf) ? [r.dcf.low, r.dcf.high] : undefined,
  };
}

/** Gleichzeitig laufende Abrufe begrenzen, um Yahoo nicht zu überlasten. */
export async function mapLimit<T, R>(list: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}
