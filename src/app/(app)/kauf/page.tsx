import { db } from "@/lib/db";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { computePosition } from "@/lib/position";
import { toTx } from "@/lib/portfolio";
import { PurchaseForm, type Holding } from "@/components/purchase-form";
import { DeleteButton } from "@/components/delete-button";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ edit?: string; sell?: string; buy?: string; name?: string }> }) {
  const { edit, sell, buy, name } = await searchParams;
  const purchases = await db.purchase.findMany({ include: { stock: true }, orderBy: [{ date: "desc" }, { id: "desc" }] });
  const editing = edit ? purchases.find((p) => p.id === Number(edit)) : undefined;

  // Aktueller Bestand je Aktie für die Verkaufsauswahl
  const byStock = new Map<number, typeof purchases>();
  for (const p of purchases) byStock.set(p.stockId, [...(byStock.get(p.stockId) ?? []), p]);
  const holdings: Holding[] = [...byStock.values()]
    .map((list) => ({ stock: list[0].stock, qty: computePosition(list.map(toTx)).quantity }))
    .filter((h) => h.qty > 0)
    .map((h) => ({ symbol: h.stock.symbol, name: h.stock.name, currency: h.stock.currency, quantity: h.qty }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const sellStock = sell ? purchases.find((p) => p.stockId === Number(sell))?.stock : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      <section className="card h-fit p-5">
        <h1 className="mb-4 text-lg font-semibold">{editing ? (editing.type === "SELL" ? "Verkauf bearbeiten" : "Kauf bearbeiten") : "Kauf oder Verkauf erfassen"}</h1>
        <PurchaseForm
          key={editing?.id ?? `new-${sell ?? ""}-${buy ?? ""}`}
          holdings={holdings}
          preselectSell={sellStock?.symbol}
          preselectBuy={buy ? { symbol: buy, name: name ?? buy } : undefined}
          initial={
            editing && {
              id: editing.id,
              type: editing.type,
              symbol: editing.stock.symbol,
              name: editing.stock.name,
              currency: editing.stock.currency,
              date: editing.date.toISOString().slice(0, 10),
              price: Number(editing.price),
              quantity: Number(editing.quantity),
              fees: Number(editing.fees),
              note: editing.note ?? "",
            }
          }
        />
      </section>

      <section className="card">
        <h2 className="border-b border-border px-4 py-3 font-semibold">Buchungen</h2>
        {purchases.length === 0 ? (
          <p className="p-4 text-sm text-muted">Noch keine Käufe erfasst.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Art</th>
                  <th className="px-4 py-2 font-medium">Aktie</th>
                  <th className="px-4 py-2 text-right font-medium">Stück</th>
                  <th className="px-4 py-2 text-right font-medium">Kurs</th>
                  <th className="px-4 py-2 text-right font-medium">Gebühren</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="tabular whitespace-nowrap px-4 py-2">{fmtDate(p.date.toISOString())}</td>
                    <td className="px-4 py-2">
                      <span className={p.type === "SELL" ? "text-light-orange" : "text-light-green"}>{p.type === "SELL" ? "Verkauf" : "Kauf"}</span>
                    </td>
                    <td className="px-4 py-2">
                      {p.stock.name} <span className="text-xs text-muted">{p.stock.symbol}</span>
                    </td>
                    <td className="tabular px-4 py-2 text-right">{fmtNum(Number(p.quantity), Number(p.quantity) % 1 ? 3 : 0)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right">{fmtMoney(Number(p.price))}</td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right">{fmtMoney(Number(p.fees))}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <a href={`/kauf?edit=${p.id}`} className="mr-3 text-accent">Bearbeiten</a>
                      <DeleteButton id={p.id} label={`${p.type === "SELL" ? "Verkauf" : "Kauf"} von ${p.stock.name} am ${fmtDate(p.date.toISOString())}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
