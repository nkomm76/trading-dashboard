import Link from "next/link";
import { loadPortfolio } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { PositionsTable } from "@/components/positions-table";
import { RefreshButton } from "@/components/refresh-button";
import { refreshIfStale } from "@/lib/refresh";
import { refreshWatchlistIfStale } from "@/lib/watchlist-server";
import { loadDividends } from "@/lib/dividend-data";

export default async function DashboardPage() {
  // Kein Cronjob im lokalen Betrieb: beim Öffnen nachladen, wenn die Daten älter als 12 Stunden sind
  const refreshing = await refreshIfStale();
  await refreshWatchlistIfStale();
  const { positions, closed, totals, fxAsOf } = await loadPortfolio();
  const dividends = await loadDividends();
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
    { label: "Dividenden erwartet (12 Mon.)", value: fmtMoney(totals.dividend) },
    { label: `Dividenden erhalten ${dividends.thisYear}`, value: fmtMoney(dividends.totals.thisYear), href: "/dividenden" },
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

      <section className={`grid grid-cols-2 gap-3 ${totals.hasSales ? "md:grid-cols-4 xl:grid-cols-7" : "md:grid-cols-3 xl:grid-cols-6"}`}>
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-xs text-muted">{t.label}</div>
            <div className={`tabular mt-1 text-lg font-semibold ${"tone" in t ? t.tone : ""}`}>
              {"href" in t && t.href ? <Link href={t.href} className="hover:text-accent">{t.value}</Link> : t.value}
            </div>
          </div>
        ))}
      </section>

      {positions.length > 0 ? (
        <PositionsTable positions={positions} />
      ) : (
        <div className="card p-6 text-sm text-muted">Aktuell keine Aktien im Bestand.</div>
      )}

      {closed.length > 0 && (
        <Link href="/archiv" className="card flex items-center justify-between p-4 text-sm hover:border-accent">
          <span>
            <span className="font-medium">Archiv</span>
            <span className="text-muted"> · {closed.length} komplett verkaufte Position{closed.length === 1 ? "" : "en"}</span>
          </span>
          <span className="text-accent">Ansehen →</span>
        </Link>
      )}

      <p className="text-xs text-muted">
        Fahre über einen Wert, um Quelle und Stichtag zu sehen. „–“ bedeutet: keine Quelle verfügbar. Hochgestellt „Jahr“ = Jahreswert, weil keine Quartalszahl vorliegt.
        Die Ampel ist eine mechanische Auswertung eigener Regeln, keine Anlageberatung. Kauf- und Verkaufsbeträge in Fremdwährung werden zum aktuellen Wechselkurs in EUR umgerechnet; realisierte Gewinne nach der Durchschnittskostenmethode inkl. Gebühren.
      </p>
    </div>
  );
}
