// Reine Berechnungen für die Vermögensübersicht: Anlageklassen, Aufteilung, Zielabweichung,
// Klumpen, Krypto-Haltedauer und Vermögensverlauf. Alles in Euro.
import { computePosition, type Tx } from "./position";

export type AssetClass = "STOCK" | "ETF" | "CRYPTO";
export type Bucket = AssetClass | "CASH";

export const CLASS_LABEL: Record<Bucket, string> = { STOCK: "Aktien", ETF: "ETF", CRYPTO: "Krypto", CASH: "Barbestand" };
export const BUCKETS: Bucket[] = ["STOCK", "ETF", "CRYPTO", "CASH"];
// Farben aus globals.css (hell und dunkel); bewusst keine Ampelfarben
export const CLASS_COLOR: Record<Bucket, string> = { STOCK: "var(--cls-stock)", ETF: "var(--cls-etf)", CRYPTO: "var(--cls-crypto)", CASH: "var(--cls-cash)" };

/** Anlageklasse aus dem Yahoo-Typ; Fonds zählen wie ETFs, alles Übrige als Aktie. */
export function assetClassFromQuoteType(t: string | undefined): AssetClass {
  if (t === "ETF" || t === "MUTUALFUND") return "ETF";
  if (t === "CRYPTOCURRENCY") return "CRYPTO";
  return "STOCK";
}

const EPS = 1e-9;
const sortTx = (txs: Tx[]) => [...txs].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === "BUY" ? -1 : 1));

/** Offene Kauf-Tranchen nach FIFO (Verkäufe verbrauchen die ältesten Käufe zuerst). */
export function openLotsFifo(txs: Tx[]): { date: string; quantity: number }[] {
  const lots: { date: string; quantity: number }[] = [];
  for (const t of sortTx(txs)) {
    if (t.type === "BUY") {
      lots.push({ date: t.date, quantity: t.quantity });
      continue;
    }
    let rest = t.quantity;
    while (rest > EPS && lots.length) {
      const used = Math.min(rest, lots[0].quantity);
      lots[0].quantity -= used;
      rest -= used;
      if (lots[0].quantity <= EPS) lots.shift();
    }
  }
  return lots;
}

/** Tag, ab dem ein Kauf länger als ein Jahr gehalten ist (Tag nach dem Jahrestag). */
export function oneYearAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const y = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
  // 29.02. ohne Schaltjahr: Date rollt auf den 01.03.; danach einen Tag weiter
  if (y.getUTCMonth() !== d.getUTCMonth()) y.setUTCDate(0);
  y.setUTCDate(y.getUTCDate() + 1);
  return y.toISOString().slice(0, 10);
}

export type Holding = { overYear: number; underYear: number; next?: { date: string; quantity: number } };

/** Wie viel des Bestands schon länger als ein Jahr gehalten ist und wann die nächste Tranche die Jahresfrist erreicht. */
export function holdingPeriod(txs: Tx[], today: string): Holding {
  const res: Holding = { overYear: 0, underYear: 0 };
  for (const lot of openLotsFifo(txs)) {
    const from = oneYearAfter(lot.date);
    if (from <= today) res.overYear += lot.quantity;
    else {
      res.underYear += lot.quantity;
      if (!res.next || from < res.next.date) res.next = { date: from, quantity: lot.quantity };
      else if (from === res.next.date) res.next.quantity += lot.quantity;
    }
  }
  return res;
}

export type Slice = { key: string; label: string; value: number; share: number };

/** Anteile am Ganzen; Werte ≤ 0 entfallen, größte zuerst. */
export function slices(items: { key: string; label: string; value: number }[]): Slice[] {
  const list = items.filter((i) => i.value > 0);
  const total = list.reduce((a, i) => a + i.value, 0);
  return list.map((i) => ({ ...i, share: total ? i.value / total : 0 })).sort((a, b) => b.value - a.value);
}

/** Gleiche Schlüssel zusammenfassen (z. B. mehrere Aktien desselben Sektors). */
export function groupSlices(items: { key: string; label: string; value: number }[]): Slice[] {
  const map = new Map<string, { key: string; label: string; value: number }>();
  for (const i of items) {
    const g = map.get(i.key);
    if (g) g.value += i.value;
    else map.set(i.key, { ...i });
  }
  return slices([...map.values()]);
}

export type Targets = Partial<Record<Bucket, number>>; // Anteile 0..1

export type Deviation = { bucket: Bucket; actual: number; target: number; diff: number; diffEur: number };

/** Abweichung der Ist- von der Zielaufteilung; diffEur > 0 heißt: mehr als das Ziel. */
export function targetDeviation(values: Record<Bucket, number>, targets: Targets): Deviation[] {
  const total = BUCKETS.reduce((a, b) => a + values[b], 0);
  if (!total) return [];
  return BUCKETS.filter((b) => targets[b] !== undefined || values[b] > 0).map((b) => {
    const actual = values[b] / total;
    const target = targets[b] ?? 0;
    return { bucket: b, actual, target, diff: actual - target, diffEur: values[b] - target * total };
  });
}

/** Positionen, deren Anteil am Gesamtvermögen über der Grenze liegt (größte zuerst). */
export function concentrations<T extends { valueEur?: number }>(positions: T[], total: number, max: number): (T & { share: number })[] {
  if (!total || !(max > 0)) return [];
  return positions
    .map((p) => ({ ...p, share: (p.valueEur ?? 0) / total }))
    .filter((p) => p.share > max)
    .sort((a, b) => b.share - a.share);
}

export type HistoryInput = {
  assetClass?: AssetClass; // ohne Angabe als Aktie gezählt
  txs: Tx[];
  closes: { time: number; close: number }[]; // EUR, aufsteigend
};

export type HistoryPoint = {
  date: string;
  securities: number;
  /** Wert je Anlageklasse; die Summe ist securities */
  byClass: Record<AssetClass, number>;
  cost: number;
  cash?: number;
  total: number;
};

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Vermögensverlauf: Bestand je Tag aus den Buchungen, bewertet mit dem letzten bekannten Schlusskurs.
 * Barbestand = zuletzt eingetragener Kontostand bis zu diesem Tag (davor unbekannt und nicht mitgezählt).
 */
export function wealthHistory(holdings: HistoryInput[], cash: { date: string; amount: number }[], today: string): HistoryPoint[] {
  const firstTx = holdings.flatMap((h) => h.txs.map((t) => t.date)).sort()[0];
  const firstCash = [...cash].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  const start = [firstTx, firstCash].filter(Boolean).sort()[0];
  if (!start) return [];

  // Raster: alle Kurstage ab dem Start, dazu Buchungs- und Kontostandstage und heute
  const days = new Set<string>([today]);
  for (const h of holdings) {
    for (const c of h.closes) if (dayOf(c.time) >= start) days.add(dayOf(c.time));
    for (const t of h.txs) days.add(t.date);
  }
  for (const c of cash) days.add(c.date);
  const grid = [...days].filter((d) => d >= start && d <= today).sort();

  const sortedCash = [...cash].sort((a, b) => a.date.localeCompare(b.date));
  // Je Reihe ein Zeiger auf Buchungen und Kurse: das Raster läuft aufsteigend, also nur vorwärts gehen (linear statt quadratisch)
  const series = holdings.map((h) => ({
    cls: h.assetClass ?? "STOCK",
    txs: sortTx(h.txs),
    closes: h.closes.map((c) => ({ day: dayOf(c.time), close: c.close })).sort((x, y) => x.day.localeCompare(y.day)),
    txIdx: 0,
    closeIdx: -1,
    pos: undefined as ReturnType<typeof computePosition> | undefined,
  }));
  let cashIdx = -1;

  return grid.map((day) => {
    let securities = 0;
    let cost = 0;
    const byClass: Record<AssetClass, number> = { STOCK: 0, ETF: 0, CRYPTO: 0 };
    for (const s of series) {
      // Position nur neu rechnen, wenn bis zu diesem Tag neue Buchungen dazukommen
      const before = s.txIdx;
      while (s.txIdx < s.txs.length && s.txs[s.txIdx].date <= day) s.txIdx++;
      if (s.txIdx !== before) s.pos = computePosition(s.txs.slice(0, s.txIdx));
      while (s.closeIdx + 1 < s.closes.length && s.closes[s.closeIdx + 1].day <= day) s.closeIdx++;
      const pos = s.pos;
      if (!pos || pos.quantity <= 0) continue;
      cost += pos.cost + pos.openFeesEur;
      // letzter Schlusskurs bis zu diesem Tag; vor dem ersten Kurs zum Einstand
      const price = s.closeIdx >= 0 ? s.closes[s.closeIdx].close : undefined;
      const value = price !== undefined ? price * pos.quantity : pos.cost;
      securities += value;
      byClass[s.cls] += value;
    }
    while (cashIdx + 1 < sortedCash.length && sortedCash[cashIdx + 1].date <= day) cashIdx++;
    const cashValue = cashIdx >= 0 ? sortedCash[cashIdx].amount : undefined;
    return { date: day, securities, byClass, cost, cash: cashValue, total: securities + (cashValue ?? 0) };
  });
}
