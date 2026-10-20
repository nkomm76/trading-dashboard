// Bestand aus Käufen und Verkäufen nach der Durchschnittskostenmethode.
// Preise in Handelswährung der Aktie, Gebühren in EUR.

export type Tx = { id?: number; type: "BUY" | "SELL"; date: string; price: number; quantity: number; fees: number };

export type PositionState = {
  quantity: number;
  avgCost: number; // Ø-Einstandskurs je Aktie (Handelswährung)
  costTrading: number; // Einstand des Restbestands (Handelswährung)
  openFeesEur: number; // anteilige Kaufgebühren des Restbestands
  realizedTrading: number; // realisierter Kursgewinn (Handelswährung)
  realizedFeesEur: number; // Gebühren, die den Verkäufen zuzurechnen sind
  soldQuantity: number;
  /** Erster Zeitpunkt, an dem mehr verkauft als gehalten wurde */
  oversold?: { date: string; missing: number };
};

const EPS = 1e-9;

export function computePosition(txs: Tx[]): PositionState {
  // Am selben Tag Käufe vor Verkäufen verbuchen
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === "BUY" ? -1 : 1));
  const s: PositionState = { quantity: 0, avgCost: 0, costTrading: 0, openFeesEur: 0, realizedTrading: 0, realizedFeesEur: 0, soldQuantity: 0 };

  for (const t of sorted) {
    if (t.type === "BUY") {
      s.quantity += t.quantity;
      s.costTrading += t.price * t.quantity;
      s.openFeesEur += t.fees;
    } else {
      if (t.quantity > s.quantity + EPS) {
        s.oversold ??= { date: t.date, missing: t.quantity - s.quantity };
      }
      const q = Math.min(t.quantity, s.quantity);
      const share = s.quantity > 0 ? q / s.quantity : 0;
      const avg = s.quantity > 0 ? s.costTrading / s.quantity : 0;
      const feeShare = s.openFeesEur * share;
      s.realizedTrading += (t.price - avg) * q;
      s.realizedFeesEur += feeShare + t.fees;
      s.costTrading -= avg * q;
      s.openFeesEur -= feeShare;
      s.quantity -= q;
      s.soldQuantity += q;
    }
    if (s.quantity < EPS) {
      s.quantity = 0;
      s.costTrading = 0;
      s.openFeesEur = 0;
    }
  }
  s.avgCost = s.quantity > 0 ? s.costTrading / s.quantity : 0;
  return s;
}
