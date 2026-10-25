import "server-only";
import { db } from "./db";
import { runCheck } from "./check-server";
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

/** Aktien Check für einen Titel ausführen und das Ergebnis speichern; bei Fehlern bleibt das alte Ergebnis stehen. */
async function checkAndStore(symbol: string, isin?: string): Promise<string | undefined> {
  const res = await runCheck(isin ?? symbol, symbol).catch(() => undefined);
  const r = res?.result;
  if (!r) {
    const error = res?.error ?? "Aktien Check fehlgeschlagen";
    await db.watchItem.updateMany({ where: { symbol }, data: { error: error.slice(0, 255) } });
    return error;
  }
  const data = { name: r.name, currency: r.currency, light: r.overall, summary: summarize(r), checkedAt: new Date(), error: null };
  await db.watchItem.upsert({ where: { symbol }, create: { symbol, isin, ...data }, update: data });
}

export async function addToWatchlist(symbol: string, isin?: string) {
  return checkAndStore(symbol, isin);
}

export async function refreshWatchlist(): Promise<{ count: number; errors: string[] }> {
  const items = await db.watchItem.findMany({ select: { symbol: true, isin: true, name: true } });
  const results = await mapLimit(items, 3, (i) => checkAndStore(i.symbol, i.isin ?? undefined));
  return { count: items.length, errors: results.flatMap((e, i) => (e ? [`${items[i].name}: ${e}`] : [])) };
}
