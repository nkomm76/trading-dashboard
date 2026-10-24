// Reine Hilfsfunktionen für SEC-Daten (ohne Netzwerk, testbar)

export type Fact = { start?: string; end: string; val: number; form: string; fp?: string };

export const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Zerlegt kumulierte Werte (gleicher Beginn, wachsendes Ende) in Quartalswerte je Periodenende. */
export function quarterlyFromYtd(list: Fact[]): Map<string, number> {
  const latest = new Map<string, Fact>();
  for (const f of list) if (f.start && (f.form === "10-Q" || f.form === "10-K")) latest.set(`${f.start}|${f.end}`, f);
  const byStart = new Map<string, Fact[]>();
  for (const f of latest.values()) byStart.set(f.start!, [...(byStart.get(f.start!) ?? []), f]);
  const out = new Map<string, number>();
  for (const group of byStart.values()) {
    group.sort((a, b) => a.end.localeCompare(b.end));
    let prev: Fact | undefined;
    for (const f of group) {
      const span = daysBetween(prev?.end ?? f.start!, f.end);
      // Nur lückenlose Schritte von etwa einem Quartal übernehmen
      if (Math.abs(span - 91) <= 12 && !out.has(f.end)) out.set(f.end, prev ? f.val - prev.val : f.val);
      prev = f;
    }
  }
  return out;
}
