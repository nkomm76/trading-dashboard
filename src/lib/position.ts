// Bestand aus Käufen und Verkäufen nach der Durchschnittskostenmethode.
// Kurse und Gebühren in Euro, so wie auf der Abrechnung.

export type Tx = { id?: number; type: "BUY" | "SELL"; date: string; price: number; quantity: number; fees: number };

export type PositionState = {
  quantity: number;
  avgCost: number; // Ø-Einstandskurs je Aktie (EUR, ohne Gebühren)
  cost: number; // Einstand des Restbestands (EUR, ohne Gebühren)
  openFeesEur: number; // anteilige Kaufgebühren des Restbestands
  realized: number; // realisierter Kursgewinn (EUR, vor Gebühren)
  realizedFeesEur: number; // Gebühren, die den Verkäufen zuzurechnen sind
  soldQuantity: number;
  /** Erster Zeitpunkt, an dem mehr verkauft als gehalten wurde */
  oversold?: { date: string; missing: number };
};

const EPS = 1e-9;

export function computePosition(txs: Tx[]): PositionState {
  // Am selben Tag Käufe vor Verkäufen verbuchen
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === "BUY" ? -1 : 1));
  const s: PositionState = { quantity: 0, avgCost: 0, cost: 0, openFeesEur: 0, realized: 0, realizedFeesEur: 0, soldQuantity: 0 };

  for (const t of sorted) {
    if (t.type === "BUY") {
      s.quantity += t.quantity;
      s.cost += t.price * t.quantity;
      s.openFeesEur += t.fees;
    } else {
      if (t.quantity > s.quantity + EPS) {
        s.oversold ??= { date: t.date, missing: t.quantity - s.quantity };
      }
      const q = Math.min(t.quantity, s.quantity);
      const share = s.quantity > 0 ? q / s.quantity : 0;
      const avg = s.quantity > 0 ? s.cost / s.quantity : 0;
      const feeShare = s.openFeesEur * share;
      s.realized += (t.price - avg) * q;
      s.realizedFeesEur += feeShare + t.fees;
      s.cost -= avg * q;
      s.openFeesEur -= feeShare;
      s.quantity -= q;
      s.soldQuantity += q;
    }
    if (s.quantity < EPS) {
      s.quantity = 0;
      s.cost = 0;
      s.openFeesEur = 0;
    }
  }
  s.avgCost = s.quantity > 0 ? s.cost / s.quantity : 0;
  return s;
}

export type ClosedCycle = {
  firstBuy: string;
  lastSell: string;
  boughtQuantity: number;
  avgBuyPrice: number; // EUR, gewichtet über alle Käufe des Zyklus
  avgSellPrice: number;
  cost: number; // Summe Kaufbeträge
  feesEur: number; // alle Kauf- und Verkaufsgebühren des Zyklus
  realized: number;
  txs: Tx[];
};

/** Teilt Buchungen in Haltezyklen: Ein Zyklus endet, wenn der Bestand auf 0 fällt. Liefert nur abgeschlossene Zyklen. */
export function closedCycles(txs: Tx[]): ClosedCycle[] {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === "BUY" ? -1 : 1));
  const cycles: ClosedCycle[] = [];
  let current: Tx[] = [];
  let qty = 0;
  for (const t of sorted) {
    current.push(t);
    qty += t.type === "BUY" ? t.quantity : -t.quantity;
    if (qty <= EPS && current.some((x) => x.type === "SELL")) {
      const buys = current.filter((x) => x.type === "BUY");
      const sells = current.filter((x) => x.type === "SELL");
      const bought = buys.reduce((a, x) => a + x.quantity, 0);
      const sold = sells.reduce((a, x) => a + x.quantity, 0);
      const pos = computePosition(current);
      cycles.push({
        firstBuy: buys[0]?.date ?? current[0].date,
        lastSell: sells[sells.length - 1].date,
        boughtQuantity: bought,
        avgBuyPrice: bought ? buys.reduce((a, x) => a + x.price * x.quantity, 0) / bought : 0,
        avgSellPrice: sold ? sells.reduce((a, x) => a + x.price * x.quantity, 0) / sold : 0,
        cost: buys.reduce((a, x) => a + x.price * x.quantity, 0),
        feesEur: current.reduce((a, x) => a + x.fees, 0),
        realized: pos.realized,
        txs: current,
      });
      current = [];
      qty = 0;
    }
  }
  return cycles;
}
