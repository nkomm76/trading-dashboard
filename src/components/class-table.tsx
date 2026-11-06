import Link from "next/link";
import type { Position } from "@/lib/portfolio";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { Value } from "./value";

// Bis 8 Nachkommastellen (Satoshi), ohne Exponentialschreibweise bei sehr kleinen Mengen
const qty = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 8 });

/** Einfache Tabelle für ETF und Krypto: ohne Ampel und Aktien-Kennzahlen. */
export function ClassTable({ positions, total, kind }: { positions: Position[]; total?: number; kind: "ETF" | "CRYPTO" }) {
  const rows = [...positions].sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-3 py-2 font-medium">Titel</th>
            <th className="px-3 py-2 text-right font-medium">Stück</th>
            <th className="px-3 py-2 text-right font-medium">Ø Kauf</th>
            <th className="px-3 py-2 text-right font-medium">Kurs</th>
            <th className="px-3 py-2 text-right font-medium">Wert €</th>
            <th className="px-3 py-2 text-right font-medium" title="Anteil am Gesamtvermögen inkl. Barbestand">Anteil</th>
            <th className="px-3 py-2 text-right font-medium">G/V €</th>
            <th className="px-3 py-2 text-right font-medium">G/V %</th>
            {kind === "ETF" ? (
              <>
                <th className="px-3 py-2 text-right font-medium" title="Ausschüttungsrendite (12 Monate)">Rendite</th>
                <th className="px-3 py-2 text-right font-medium" title="Ausschüttungen der letzten 12 Monate auf deinen Bestand">Ausschüttung 12 M.</th>
              </>
            ) : (
              <th className="px-3 py-2 font-medium" title="Nach FIFO: älteste Käufe gelten als zuerst verkauft">Haltedauer</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const gainPct = p.gainEur !== undefined && p.costEur ? p.gainEur / p.costEur : undefined;
            const tone = p.gainEur === undefined ? "" : p.gainEur >= 0 ? "text-light-green" : "text-light-red";
            return (
              <tr key={p.stockId} className="border-b border-border last:border-0 hover:bg-background">
                <td className="px-3 py-2.5">
                  <Link href={`/aktie/${p.stockId}`} className="block min-w-40 hover:text-accent">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">{p.symbol}</span>
                  </Link>
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{qty(p.quantity)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{fmtMoney(p.avgCost)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right"><Value s={p.priceEur} format={(v) => fmtMoney(v)} /></td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{fmtMoney(p.valueEur)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{p.valueEur !== undefined && total ? fmtPct(p.valueEur / total) : "–"}</td>
                <td className={`tabular whitespace-nowrap px-3 py-2.5 text-right ${tone}`}>{fmtMoney(p.gainEur)}</td>
                <td className={`tabular whitespace-nowrap px-3 py-2.5 text-right ${tone}`}>{gainPct === undefined ? "–" : (gainPct > 0 ? "+" : "") + fmtPct(gainPct)}</td>
                {kind === "ETF" ? (
                  <>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right"><Value s={p.metrics.dividendYield} format={(v) => fmtPct(v)} /></td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{p.annualDividendEur ? fmtMoney(p.annualDividendEur) : <span className="text-muted" title="Keine Ausschüttungen in den letzten 12 Monaten (z. B. thesaurierend)">–</span>}</td>
                  </>
                ) : (
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {p.holding && p.holding.underYear === 0 ? (
                      <span className="text-light-green">alles über 1 Jahr</span>
                    ) : p.holding ? (
                      <>
                        {p.holding.overYear > 0 && <span className="block">{qty(p.holding.overYear)} über 1 Jahr</span>}
                        {p.holding.next && (
                          <span className="block text-muted">
                            {qty(p.holding.next.quantity)} ab {fmtDate(p.holding.next.date)}
                            {p.holding.underYear - p.holding.next.quantity > 1e-9 && ", weitere später"}
                          </span>
                        )}
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
