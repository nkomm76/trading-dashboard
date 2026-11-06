import type { CheckResult } from "./check";
import type { EpsPoint } from "./fair-pe";
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
  /** Fairer Wert nach Ø-KGV mit Gewinnreihe für die Kurve im Kurschart */
  pe?: { value: number; deviation?: number; pe: number; points: EpsPoint[] };
};

export function summarize(r: CheckResult): WatchSummary {
  return {
    passed: r.passed,
    total: r.rated,
    items: r.items.map((i) => ({ title: i.title, light: i.light, verdict: i.verdict })),
    price: r.price,
    expectedYield: r.expectedYield?.value,
    fairValue: r.fairValue?.value,
    dcf: r.dcf && !("unavailable" in r.dcf) ? r.dcf.value : undefined,
    pe: "unavailable" in r.peFair ? undefined : { value: r.peFair.value, deviation: r.peFair.deviation, pe: r.peFair.pe, points: r.peFair.points },
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
