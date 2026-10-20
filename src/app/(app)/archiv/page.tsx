import Link from "next/link";
import { loadArchive } from "@/lib/archive";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";

const tone = (v: number | undefined) => (v === undefined ? "" : v >= 0 ? "text-light-green" : "text-light-red");

function duration(days: number) {
  if (days < 60) return `${days} Tage`;
  if (days < 730) return `${Math.round(days / 30.4)} Monate`;
  return `${(days / 365.25).toFixed(1).replace(".", ",")} Jahre`;
}

export default async function ArchivePage() {
  const { rows, totals, fxAsOf } = await loadArchive();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Archiv</h1>
        <p className="text-xs text-muted">Komplett verkaufte Positionen. Kaufst du eine Aktie später erneut, beginnt ein neuer Eintrag.</p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-muted">Noch keine verkauften Positionen.</div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Kursgewinn gesamt", value: totals.gain },
              { label: "Dividenden gesamt (netto)", value: totals.dividends },
              { label: "Ergebnis gesamt", value: totals.total },
            ].map((t) => (
              <div key={t.label} className="card p-4">
                <div className="text-xs text-muted">{t.label}</div>
                <div className={`tabular mt-1 text-lg font-semibold ${tone(t.value)}`}>{fmtMoney(t.value)}</div>
              </div>
            ))}
          </section>

          <section className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Aktie</th>
                  <th className="px-3 py-2 font-medium">Kaufdatum</th>
                  <th className="px-3 py-2 text-right font-medium">Kaufkurs</th>
                  <th className="px-3 py-2 font-medium">Verkaufsdatum</th>
                  <th className="px-3 py-2 text-right font-medium">Verkaufskurs</th>
                  <th className="px-3 py-2 text-right font-medium">Stück</th>
                  <th className="px-3 py-2 font-medium">Haltedauer</th>
                  <th className="px-3 py-2 text-right font-medium">Kursgewinn</th>
                  <th className="px-3 py-2 text-right font-medium">Dividenden</th>
                  <th className="px-3 py-2 text-right font-medium">Gesamt</th>
                  <th className="px-3 py-2 text-right font-medium">Rendite</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-3 py-2.5">
                      <Link href={`/aktie/${r.stockId}`} className="hover:text-accent">
                        <span className="font-medium">{r.name}</span>
                        <span className="block text-xs text-muted">{r.symbol}</span>
                      </Link>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5">
                      {fmtDate(r.firstBuy)}
                      {r.buyCount > 1 && <span className="block text-xs text-muted">{r.buyCount} Käufe</span>}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right" title={r.buyCount > 1 ? "Durchschnitt aller Käufe" : undefined}>
                      {r.buyCount > 1 && "Ø "}
                      {fmtMoney(r.avgBuyPrice, r.currency)}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5">
                      {fmtDate(r.lastSell)}
                      {r.sellCount > 1 && <span className="block text-xs text-muted">{r.sellCount} Verkäufe</span>}
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right" title={r.sellCount > 1 ? "Durchschnitt aller Verkäufe" : undefined}>
                      {r.sellCount > 1 && "Ø "}
                      {fmtMoney(r.avgSellPrice, r.currency)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">{fmtNum(r.quantity, r.quantity % 1 ? 3 : 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{duration(r.holdingDays)}</td>
                    <td className={`tabular whitespace-nowrap px-3 py-2.5 text-right ${tone(r.gainEur)}`}>{fmtMoney(r.gainEur)}</td>
                    <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{fmtMoney(r.dividendsEur)}</td>
                    <td className={`tabular whitespace-nowrap px-3 py-2.5 text-right font-medium ${tone(r.totalEur)}`}>{fmtMoney(r.totalEur)}</td>
                    <td className={`tabular whitespace-nowrap px-3 py-2.5 text-right ${tone(r.returnPct)}`}>{fmtPct(r.returnPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="text-xs text-muted">
            Kursgewinn nach allen Kauf- und Verkaufsgebühren. Dividenden: bestätigte Nettozahlungen mit Ex-Tag im Haltezeitraum. Rendite = (Kursgewinn + Dividenden) / Kaufbetrag, nicht annualisiert.
            Beträge in Fremdwährung zum aktuellen EZB-Kurs{fxAsOf && ` vom ${fmtDate(fxAsOf)}`} umgerechnet.
          </p>
        </>
      )}
    </div>
  );
}
