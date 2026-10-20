import Link from "next/link";
import { loadDividends } from "@/lib/dividend-data";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { deleteDividend, dismissDividend, restoreDividend } from "@/app/actions";
import { SuggestionForm, ManualDividendForm } from "@/components/dividend-forms";
import { DividendYearChart, DividendMonthChart } from "@/components/charts";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export default async function DividendsPage() {
  const d = await loadDividends();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dividenden</h1>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          { label: `Erhalten ${d.thisYear} (netto)`, value: d.totals.thisYear },
          { label: `Erhalten ${d.thisYear - 1} (netto)`, value: d.totals.lastYear },
          { label: "Erhalten gesamt (netto)", value: d.totals.all },
        ].map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-xs text-muted">{t.label}</div>
            <div className="tabular mt-1 text-lg font-semibold">{fmtMoney(t.value)}</div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Offene Zahlungen bestätigen {d.suggestions.length > 0 && <span className="text-muted">({d.suggestions.length})</span>}</h2>
          <p className="text-xs text-muted">
            Aus Ex-Tagen (Yahoo Finance) und deinem Bestand am Ex-Tag ermittelt. Trag den Nettobetrag aus deiner Abrechnung ein. Der Bruttowert in EUR ist mit dem aktuellen Wechselkurs geschätzt – überschreib ihn bei Bedarf.
          </p>
        </div>
        {d.suggestions.length === 0 ? (
          <p className="p-4 text-sm text-muted">Keine offenen Zahlungen.</p>
        ) : (
          <ul className="divide-y divide-border">
            {d.suggestions.map((s) => (
              <li key={`${s.stockId}-${s.exDate}`} className="flex flex-wrap items-end gap-x-4 gap-y-2 px-4 py-3 text-sm">
                <div className="min-w-48 flex-1">
                  <Link href={`/aktie/${s.stockId}`} className="font-medium hover:text-accent">{s.name}</Link>
                  <div className="tabular text-xs text-muted">
                    Ex-Tag {fmtDate(s.exDate)} · {fmtNum(s.quantity, s.quantity % 1 ? 3 : 0)} × {fmtMoney(s.perShare, s.currency)} = {fmtMoney(s.grossTrading, s.currency)} brutto
                  </div>
                </div>
                <SuggestionForm s={s} />
                <form action={dismissDividend}>
                  <input type="hidden" name="stockId" value={s.stockId} />
                  <input type="hidden" name="exDate" value={s.exDate} />
                  <button className="text-xs text-muted hover:text-foreground" title="Nicht erhalten, z. B. wegen Depotwechsel">Ignorieren</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.received.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Netto pro Jahr</h2>
            <DividendYearChart data={d.years} />
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Netto pro Monat {d.thisYear}</h2>
            <DividendMonthChart data={d.byMonth.map((m) => ({ label: MONTHS[m.month - 1], net: m.net }))} />
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,360px)]">
        <section className="card">
          <h2 className="border-b border-border px-4 py-3 font-semibold">Erhaltene Dividenden</h2>
          {d.received.length === 0 ? (
            <p className="p-4 text-sm text-muted">Noch keine Dividenden erfasst.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Ex-Tag</th>
                    <th className="px-4 py-2 font-medium">Aktie</th>
                    <th className="px-4 py-2 text-right font-medium">Stück</th>
                    <th className="px-4 py-2 text-right font-medium">Brutto</th>
                    <th className="px-4 py-2 text-right font-medium">Netto</th>
                    <th className="px-4 py-2 text-right font-medium">Steuer</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {d.received.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="tabular whitespace-nowrap px-4 py-2">{fmtDate(r.exDate)}</td>
                      <td className="px-4 py-2">
                        {r.name}
                        {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                      </td>
                      <td className="tabular px-4 py-2 text-right">{r.quantity === undefined ? "–" : fmtNum(r.quantity, r.quantity % 1 ? 3 : 0)}</td>
                      <td className="tabular whitespace-nowrap px-4 py-2 text-right">{fmtMoney(r.grossEur)}</td>
                      <td className="tabular whitespace-nowrap px-4 py-2 text-right font-medium">{fmtMoney(r.netEur)}</td>
                      <td className="tabular whitespace-nowrap px-4 py-2 text-right text-muted">
                        {r.grossEur !== undefined && r.netEur !== undefined ? fmtMoney(r.grossEur - r.netEur) : "–"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={deleteDividend}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-xs text-light-red" title="Löschen – erscheint danach wieder als offene Zahlung, falls eine Quelle vorliegt">Löschen</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-1 font-semibold">Manuell erfassen</h2>
            <p className="mb-4 text-xs text-muted">Für Zahlungen ohne Vorschlag, z. B. Sonderdividenden.</p>
            {d.stockOptions.length ? <ManualDividendForm stocks={d.stockOptions} /> : <p className="text-sm text-muted">Erst einen Kauf erfassen.</p>}
          </div>
          {d.dismissed.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">Ignorierte Zahlungen</h2>
              <ul className="space-y-1.5 text-sm">
                {d.dismissed.map((x) => (
                  <li key={`${x.stockId}-${x.exDate}`} className="flex items-center justify-between gap-2">
                    <span>
                      {x.name} <span className="tabular text-xs text-muted">{fmtDate(x.exDate)}</span>
                    </span>
                    <form action={restoreDividend}>
                      <input type="hidden" name="stockId" value={x.stockId} />
                      <input type="hidden" name="exDate" value={x.exDate} />
                      <button className="text-xs text-accent">Wiederherstellen</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
