import { db } from "@/lib/db";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { deletePurchase } from "@/app/actions";
import { PurchaseForm } from "@/components/purchase-form";

export default async function PurchasePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const purchases = await db.purchase.findMany({ include: { stock: true }, orderBy: { date: "desc" } });
  const editing = edit ? purchases.find((p) => p.id === Number(edit)) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      <section className="card h-fit p-5">
        <h1 className="mb-4 text-lg font-semibold">{editing ? "Kauf bearbeiten" : "Kauf erfassen"}</h1>
        <PurchaseForm
          key={editing?.id ?? "new"}
          initial={
            editing && {
              id: editing.id,
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
        <h2 className="border-b border-border px-4 py-3 font-semibold">Erfasste Käufe</h2>
        {purchases.length === 0 ? (
          <p className="p-4 text-sm text-muted">Noch keine Käufe erfasst.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Datum</th>
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
                      {p.stock.name} <span className="text-xs text-muted">{p.stock.symbol}</span>
                    </td>
                    <td className="tabular px-4 py-2 text-right">{fmtNum(Number(p.quantity), Number(p.quantity) % 1 ? 3 : 0)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right">{fmtMoney(Number(p.price), p.stock.currency)}</td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right">{fmtMoney(Number(p.fees))}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <a href={`/kauf?edit=${p.id}`} className="mr-3 text-accent">Bearbeiten</a>
                      <form action={deletePurchase} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-light-red">Löschen</button>
                      </form>
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
