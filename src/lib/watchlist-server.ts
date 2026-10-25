import "server-only";
import { db } from "./db";
import { recentCheck, runCheck } from "./check-server";
import { mapLimit, summarize, type WatchSummary } from "./watchlist";

export type WatchRow = {
  id: number;
  symbol: string;
  isin?: string;
  name: string;
  currency: string;
  light?: "GREEN" | "ORANGE" | "RED" | "GREY";
  summary?: WatchSummary;
  checkedAt?: string;
  error?: string;
};

export async function loadWatchlist(): Promise<WatchRow[]> {
  const rows = await db.watchItem.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    isin: r.isin ?? undefined,
    name: r.name,
    currency: r.currency,
    light: r.light ?? undefined,
    summary: (r.summary as WatchSummary | null) ?? undefined,
    checkedAt: r.checkedAt?.toISOString(),
    error: r.error ?? undefined,
  }));
}

export async function isWatched(symbol: string) {
  return (await db.watchItem.count({ where: { symbol } })) > 0;
}

/**
 * Aktien Check für einen Titel ausführen und das Ergebnis speichern; bei Fehlern bleibt das alte Ergebnis stehen.
 * Nur beim Aufnehmen wird ein Eintrag angelegt – beim Aktualisieren nie, damit ein zwischendurch gelöschter Titel gelöscht bleibt.
 */
async function checkAndStore(symbol: string, isin: string | undefined, mode: "add" | "refresh"): Promise<string | undefined> {
  // Beim Aufnehmen das gerade im Aktien Check berechnete Ergebnis verwenden, statt alles neu abzurufen
  const res = (mode === "add" ? recentCheck(symbol) : undefined) ?? (await runCheck(isin ?? symbol, symbol).catch(() => undefined));
  const r = res?.result;
  if (!r) {
    const error = res?.error ?? "Aktien Check fehlgeschlagen";
    await db.watchItem.updateMany({ where: { symbol }, data: { error: error.slice(0, 255) } });
    return error;
  }
  const data = { name: r.name, currency: r.currency, light: r.overall, summary: summarize(r), checkedAt: new Date(), error: null };
  if (mode === "add") await db.watchItem.upsert({ where: { symbol }, create: { symbol, isin, ...data }, update: data });
  else await db.watchItem.updateMany({ where: { symbol }, data });
}

export async function addToWatchlist(symbol: string, isin?: string) {
  return checkAndStore(symbol, isin, "add");
}

type WatchRefresh = { count: number; errors: string[] };

const STALE_HOURS = 12;
const staleWhere = () => ({ OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(Date.now() - STALE_HOURS * 3_600_000) } }] });

// Nur ein Lauf gleichzeitig; wer währenddessen aktualisiert, wartet auf diesen Lauf
let running: Promise<WatchRefresh> | undefined;
let lastAuto = 0;

/** Alle Titel neu prüfen (staleOnly: nur die, deren letzter Check älter als 12 Stunden ist). */
export function refreshWatchlist(opts: { staleOnly?: boolean } = {}): Promise<WatchRefresh> {
  running ??= (async () => {
    const items = await db.watchItem.findMany({ where: opts.staleOnly ? staleWhere() : undefined, select: { symbol: true, isin: true, name: true } });
    const results = await mapLimit(items, 3, (i) => checkAndStore(i.symbol, i.isin ?? undefined, "refresh"));
    return { count: items.length, errors: results.flatMap((e, i) => (e ? [`${items[i].name}: ${e}`] : [])) };
  })().finally(() => {
    running = undefined;
  });
  return running;
}

/** Startet im Hintergrund eine Aktualisierung veralteter Titel; true, wenn gerade eine läuft. */
export async function refreshWatchlistIfStale(): Promise<boolean> {
  if (running) return true;
  // Titel, deren Abruf scheitert, bleiben veraltet – höchstens alle 15 Minuten neu versuchen
  if (Date.now() - lastAuto < 15 * 60_000) return false;
  if (!(await db.watchItem.count({ where: staleWhere() }))) return false;
  lastAuto = Date.now();
  void refreshWatchlist({ staleOnly: true }).catch((e) => console.error("Automatische Aktualisierung der Watchliste:", e));
  return true;
}

/** Startet im Hintergrund eine Aktualisierung aller Titel; liefert deren Anzahl. */
export async function startWatchlistRefresh(): Promise<number> {
  const count = await db.watchItem.count();
  if (count) void refreshWatchlist().catch((e) => console.error("Aktualisierung der Watchliste:", e));
  return count;
}
