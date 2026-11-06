import "server-only";
import { eulerpoolEnabled, fetchEulerpoolProfile } from "./eulerpool";
import { matchListings } from "./listing-match";
import { searchStocks, type SearchHit } from "./yahoo";

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export type ListingSearch = { hits: SearchHit[]; note?: string };

/** Yahoo-Suche; kennt Yahoo eine ISIN nicht, über Eulerpool Name und Kürzel holen und damit erneut bei Yahoo suchen. */
export async function findListings(query: string, opts: { crypto?: boolean } = {}): Promise<ListingSearch> {
  const q = query.trim();
  const hits = await searchStocks(q, opts).catch(() => []);
  const isin = q.toUpperCase();
  if (hits.length || !ISIN.test(isin) || !eulerpoolEnabled()) return { hits };

  let profile;
  try {
    profile = await fetchEulerpoolProfile(isin);
  } catch {
    return { hits: [], note: "Yahoo kennt diese ISIN nicht, und Eulerpool ist gerade nicht erreichbar." };
  }
  if (!profile) return { hits: [], note: "Weder Yahoo noch Eulerpool kennen diese ISIN." };

  const queries = [profile.ticker, profile.name].filter((x): x is string => Boolean(x));
  const found = (await Promise.all(queries.map((x) => searchStocks(x).catch(() => [])))).flat();
  const matched = matchListings(profile, found);
  return matched.length
    ? { hits: matched }
    : { hits: [], note: `Eulerpool kennt die ISIN (${profile.name}), Yahoo hat dazu aber keine passende Notierung.` };
}
