import type { SearchHit } from "./yahoo";

// Ersatzsuche per ISIN (ohne Netzwerk, testbar): Eulerpool nennt Name und Kürzel, Yahoo die Notierungen dazu.
// Lieber keine Notierung als eine falsche: Treffer zählen nur bei gleichem Kürzel oder gleichem Namen.

export type IsinProfile = { isin: string; name: string; ticker?: string };

/** Eulerpool-Profil auslesen; ohne Namen gilt die ISIN als unbekannt. */
export function parseProfile(raw: unknown, isin: string): IsinProfile | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return undefined;
  const ticker = typeof r.ticker === "string" && r.ticker.trim() ? r.ticker.trim() : undefined;
  return { isin, name: r.name.trim(), ticker };
}

// Rechtsformen und Füllwörter, die bei Yahoo und Eulerpool unterschiedlich geschrieben werden
const NOISE = new Set([
  "the", "plc", "p", "l", "c", "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited",
  "ag", "aktiengesellschaft", "kgaa", "gmbh", "se", "sa", "s", "a", "nv", "n", "v", "oyj", "asa", "ab", "publ", "spa", "group", "holding", "holdings",
]);

export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE.has(t));
}

const sameName = (a: string, b: string) => {
  const x = nameTokens(a).sort().join(" ");
  return x !== "" && x === nameTokens(b).sort().join(" ");
};

const tickerKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Passende Notierungen, Heimatbörse zuerst; bei Nicht-US-ISINs stehen US-Notierungen (meist ADRs) hinten. */
export function matchListings(profile: IsinProfile, hits: SearchHit[]): SearchHit[] {
  const ticker = profile.ticker && tickerKey(profile.ticker);
  const unique = hits.filter((h, i) => hits.findIndex((x) => x.symbol === h.symbol) === i);
  const matched = unique.filter((h) => (ticker && tickerKey(h.symbol.split(".")[0]) === ticker) || sameName(h.name, profile.name));
  const us = profile.isin.startsWith("US");
  const rank = (h: SearchHit) => ((ticker && tickerKey(h.symbol.split(".")[0]) === ticker) ? 0 : 1) + (!us && !h.symbol.includes(".") ? 2 : 0);
  return matched.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i).map((x) => x.h);
}
