// Exponentielle gleitende Durchschnitte für den Kurschart (ohne Netzwerk, testbar).

export type TimeValue = { time: number; value: number };

/** EMA über Schlusskurse; Startwert ist der einfache Durchschnitt der ersten `period` Kurse. */
export function ema(points: { time: number; close: number }[], period: number): TimeValue[] {
  if (period < 1 || points.length < period) return [];
  const k = 2 / (period + 1);
  let value = points.slice(0, period).reduce((s, p) => s + p.close, 0) / period;
  const out = [{ time: points[period - 1].time, value }];
  for (const p of points.slice(period)) {
    value = p.close * k + value * (1 - k);
    out.push({ time: p.time, value });
  }
  return out;
}

/** Wert der Linie zum Zeitpunkt t: zwischen Stützpunkten linear, vor dem ersten keiner, nach dem letzten der letzte. */
export function valueAt(line: TimeValue[], t: number): number | undefined {
  if (!line.length || t < line[0].time) return undefined;
  let lo = 0;
  let hi = line.length - 1;
  if (t >= line[hi].time) return line[hi].value;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line[mid].time <= t) lo = mid;
    else hi = mid;
  }
  const a = line[lo];
  const b = line[hi];
  return a.value + ((b.value - a.value) * (t - a.time)) / (b.time - a.time);
}
