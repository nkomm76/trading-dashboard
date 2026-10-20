import Link from "next/link";
import { loadPortfolio } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { PositionsTable } from "@/components/positions-table";
import { RefreshButton } from "@/components/refresh-button";
import { refreshIfStale } from "@/lib/refresh";

export default async function DashboardPage() {
  // Kein Cronjob im lokalen Betrieb: beim Öffnen nachladen, wenn die Daten älter als 12 Stunden sind
  const refreshing = await refreshIfStale();
  const { positions, closed, totals, fxAsOf } = await loadPortfolio();
  const lastRun = await db.refreshLog.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } });

  if (!positions.length && !closed.length) {
    return (
      <div className="card p-8 text-center">
        <h1 className="mb-2 text-lg font-semibold">Noch keine Positionen</h1>
        <p className="mb-4 text-sm text-muted">Erfasse deinen ersten Kauf, dann erscheinen hier Kurse, Kennzahlen und die Ampel.</p>
        <Link href="/kauf" className="btn">Kauf erfassen</Link>
      </div>
    );
  }

  const tone = (v: number | undefined) => (v === undefined ? "" : v >= 0 ? "text-light-green" : "text-light-red");
  const tiles = [
    { label: "Depotwert", value: fmtMoney(totals.value) },
    { label: "Gewinn / Verlust (offen)", value: fmtMoney(totals.gain), tone: tone(totals.gain) },
    ...(totals.hasSales ? [{ label: "Realisiert (Verkäufe)", value: fmtMoney(totals.realized), tone: tone(totals.realized) }] : []),
    { label: "Dividenden (12 Monate)", value: fmtMoney(totals.dividend) },
    { label: "Dividendenrendite", value: fmtPct(totals.yield) },
    { label: "Yield on Cost", value: fmtPct(totals.yieldOnCost) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Übersicht</h1>
          <p className="text-xs text-muted">
            Letzte Aktualisierung: {lastRun?.finishedAt ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(lastRun.finishedAt) : "–"}
            {fxAsOf && ` · Wechselkurse EZB vom ${fmtDate(fxAsOf)}`}
          </p>
          {refreshing && <p className="text-xs text-light-orange">Daten werden im Hintergrund aktualisiert – Seite in ein bis zwei Minuten neu laden.</p>}
        </div>
        <RefreshButton />
      </div>

      <section className={`grid grid-cols-2 gap-3 ${totals.hasSales ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-xs text-muted">{t.label}</div>
            <div className={`tabular mt-1 text-lg font-semibold ${t.tone ?? ""}`}>{t.value}</div>
          </div>
        ))}
      </section>

      {positions.length > 0 ? (
        <PositionsTable positions={positions} />
      ) : (
        <div className="card p-6 text-sm text-muted">Aktuell keine Aktien im Bestand.</div>
      )}

      {closed.length > 0 && (
        <section className="card">
          <h2 className="border-b border-border px-4 py-3 font-semibold">Verkaufte Positionen</h2>
          <ul className="divide-y divide-border text-sm">
            {closed.map((p) => (
              <li key={p.stockId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/aktie/${p.stockId}`} className="hover:text-accent">
                  {p.name} <span className="text-xs text-muted">{p.symbol}</span>
                </Link>
                <span className={`tabular ${tone(p.realizedEur)}`} title="Realisierter Gewinn nach Gebühren">
                  {fmtMoney(p.realizedEur)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">
        Fahre über einen Wert, um Quelle und Stichtag zu sehen. „–“ bedeutet: keine Quelle verfügbar. Hochgestellt „Jahr“ = Jahreswert, weil keine Quartalszahl vorliegt.
        Die Ampel ist eine mechanische Auswertung eigener Regeln, keine Anlageberatung. Kauf- und Verkaufsbeträge in Fremdwährung werden zum aktuellen Wechselkurs in EUR umgerechnet; realisierte Gewinne nach der Durchschnittskostenmethode inkl. Gebühren.
      </p>
    </div>
  );
}
