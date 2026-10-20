import type { DividendPayment } from "./data/types";
import { computePosition, type Tx } from "./position";

export type DividendSuggestion = {
  exDate: string;
  perShare: number; // Handelswährung
  quantity: number; // Bestand am Ex-Tag
  grossTrading: number;
};

/**
 * Zahlungen, die dem Bestand zustehen: Maßgeblich ist der Bestand zum Handelsschluss vor dem Ex-Tag –
 * am Ex-Tag gekaufte Aktien sind nicht berechtigt, am Ex-Tag verkaufte schon.
 */
export function suggestDividends(txs: Tx[], payments: DividendPayment[], known: Set<string>, today = new Date().toISOString().slice(0, 10)): DividendSuggestion[] {
  const out: DividendSuggestion[] = [];
  for (const p of payments) {
    if (p.date > today || known.has(p.date)) continue;
    const quantity = computePosition(txs.filter((t) => t.date < p.date)).quantity;
    if (quantity <= 0) continue;
    out.push({ exDate: p.date, perShare: p.amount, quantity, grossTrading: p.amount * quantity });
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
}
