import "server-only";
import { normalizeEulerpool } from "./eulerpool-normalize";
import { parseProfile, type IsinProfile } from "./listing-match";
import type { StatementRow } from "./types";

// Eulerpool (kostenloser Tarif, 100.000 Abfragen/Monat): zum Verlängern der Jahreshistorie
// und als Ersatz, wenn Yahoo eine ISIN nicht findet.
// Ohne EULERPOOL_API_KEY bleibt alles beim Alten.

const BASE = "https://api.eulerpool.com/api/1/equity";

export const eulerpoolEnabled = () => (process.env.EULERPOOL_API_KEY ?? "").length >= 16;

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.EULERPOOL_API_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Eulerpool ${res.status}`);
  return res.json();
}

// Profile ändern sich kaum: einen Tag im Speicher halten, um Abfragen zu sparen
const profiles = new Map<string, { at: number; profile?: IsinProfile }>();

/** Name und Kürzel zu einer ISIN; undefined, wenn Eulerpool sie nicht kennt. Wirft, wenn Eulerpool nicht erreichbar ist. */
export async function fetchEulerpoolProfile(isin: string): Promise<IsinProfile | undefined> {
  const hit = profiles.get(isin);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.profile;
  let profile: IsinProfile | undefined;
  try {
    profile = parseProfile(await get(`profile/${isin}`), isin);
  } catch (e) {
    if (!(e instanceof Error && /^Eulerpool (400|404)$/.test(e.message))) throw e;
  }
  profiles.set(isin, { at: Date.now(), profile });
  return profile;
}

/** Jahreswerte (Umsatz, EPS, Aktien, operativer Cashflow, Investitionen) per ISIN; leer bei Fehler oder ohne Schlüssel. */
export async function fetchEulerpoolAnnual(isin: string): Promise<StatementRow[]> {
  if (!eulerpoolEnabled() || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return [];
  try {
    const [income, cashflow] = await Promise.all([get(`incomestatement/${isin}`), get(`cashflowstatement/${isin}`)]);
    return normalizeEulerpool(income, cashflow);
  } catch {
    return [];
  }
}
