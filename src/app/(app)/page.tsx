import Link from "next/link";
import { loadPortfolio } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { PositionsTable } from "@/components/positions-table";
import { ClassTable } from "@/components/class-table";
import { RefreshButton } from "@/components/refresh-button";
import { AllocationCard, CashForm, WealthHistory, type AllocRow } from "@/components/wealth";
import { refreshIfStale } from "@/lib/refresh";
import { refreshWatchlistIfStale } from "@/lib/watchlist-server";
import { loadDividends } from "@/lib/dividend-data";
import { getPortfolioSettings } from "@/lib/settings";
import { CLASS_COLOR, CLASS_LABEL, concentrations, targetDeviation } from "@/lib/wealth";
import { deleteCash } from "../actions";

// Ohne eigene Grenze: Hinweis ab 10 % des Gesamtvermögens in einer Position
const DEFAULT_MAX_POSITION = 0.1;

export default async function DashboardPage() {
  // Kein Cronjob im lokalen Betrieb: beim Öffnen nachladen, wenn die Daten älter als 12 Stunden sind
  const refreshing = await refreshIfStale();
  await refreshWatchlistIfStale();
  const { positions, closed, totals, fxAsOf, cash, byClass } = await loadPortfolio();
  const dividends = await loadDividends();
  const lastRun = await db.refreshLog.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } });
  const rules = await getPortfolioSettings();
  const cashHistory = await db.cashBalance.findMany({ orderBy: { date: "desc" }, take: 5 });

  const tone = (v: number | undefined) => (v === undefined ? "" : v >= 0 ? "text-light-green" : "text-light-red");
  const cashCard = (
    <section className="card p-4">
      <h2 className="mb-1 font-semibold">Barbestand</h2>
      <p className="mb-3 text-xs text-muted">
        {cash ? `Zuletzt eingetragen ${fmtMoney(cash.amount)} am ${fmtDate(cash.date)}. ` : ""}
        {cash && Math.abs(cash.change) >= 0.005
          ? `Seitdem gebuchte Käufe und Verkäufe: ${cash.change > 0 ? "+" : ""}${fmtMoney(cash.change)}, also jetzt ${fmtMoney(totals.cash)}. `
          : ""}
        Käufe und Verkäufe nach dem letzten Eintrag rechnet das Dashboard selbst ein; Dividenden, Zinsen und Überweisungen nicht. Trage den Kontostand ab und zu laut Depot ein, frühere Stände bleiben für den Verlauf erhalten.
      </p>
      <CashForm current={cash} />
      {cashHistory.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          {cashHistory.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <span className="tabular text-muted">{fmtDate(c.date.toISOString())}</span>
              <span className="tabular flex-1">{fmtMoney(Number(c.amount))}</span>
              <form action={deleteCash}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-muted hover:text-light-red" aria-label={`Kontostand vom ${fmtDate(c.date.toISOString())} löschen`}>
                  Löschen
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!positions.length && !closed.length && !cash) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="card p-8 text-center">
          <h1 className="mb-2 text-lg font-semibold">Noch keine Positionen</h1>
          <p className="mb-4 text-sm text-muted">Erfasse deinen ersten Kauf (Aktie, ETF oder Krypto), dann erscheinen hier Kurse, Kennzahlen und die Ampel.</p>
          <Link href="/kauf" className="btn">Kauf erfassen</Link>
        </div>
        {cashCard}
      </div>
    );
  }

  const total = totals.total;
  const tiles = [
    { label: "Gesamtvermögen", value: fmtMoney(total), hint: "Wertpapiere plus Barbestand" },
    { label: "Wertpapiere", value: fmtMoney(totals.value) },
    { label: "Barbestand", value: fmtMoney(totals.cash), sub: totals.cashShare !== undefined ? `${fmtPct(totals.cashShare)} Quote` : undefined },
    { label: "Gewinn / Verlust (offen)", value: fmtMoney(totals.gain), tone: tone(totals.gain), sub: totals.gain !== undefined && totals.cost ? `${totals.gain >= 0 ? "+" : ""}${fmtPct(totals.gain / totals.cost)}` : undefined },
    ...(totals.hasSales ? [{ label: "Realisiert (Verkäufe)", value: fmtMoney(totals.realized), tone: tone(totals.realized) }] : []),
    { label: "Dividenden erwartet (12 Mon.)", value: fmtMoney(totals.dividend) },
    { label: `Dividenden erhalten ${dividends.thisYear}`, value: fmtMoney(dividends.totals.thisYear), href: "/dividenden" },
    { label: "Dividendenrendite", value: fmtPct(totals.yield), hint: "auf den Wert der Wertpapiere" },
    { label: "Rendite aufs Gesamtvermögen", value: fmtPct(totals.yieldTotal), hint: "Dividenden geteilt durch Wertpapiere plus Barbestand; der Barbestand bringt 0 %" },
    { label: "Yield on Cost", value: fmtPct(totals.yieldOnCost) },
  ];

  const allocRows: AllocRow[] = [
    ...positions
      .filter((p) => (p.valueEur ?? 0) > 0)
      .map((p) => ({ id: String(p.stockId), name: p.name, bucket: p.assetClass, sector: p.sector, currency: p.currency, value: p.valueEur! })),
    ...(totals.cash > 0 ? [{ id: "cash", name: "Barbestand", bucket: "CASH" as const, currency: "EUR", value: totals.cash }] : []),
  ];
  const hasTargets = Object.keys(rules.targets).length > 0;
  const deviations = hasTargets ? targetDeviation(byClass, rules.targets) : [];
  const maxShare = rules.maxPositionShare ?? DEFAULT_MAX_POSITION;
  const clusters = total ? concentrations(positions, total, maxShare) : [];
  const missingValues = positions.filter((p) => p.valueEur === undefined);

  const stocks = positions.filter((p) => p.assetClass === "STOCK");
  const etfs = positions.filter((p) => p.assetClass === "ETF");
  const cryptos = positions.filter((p) => p.assetClass === "CRYPTO");
  const sectionTitle = (bucket: "STOCK" | "ETF" | "CRYPTO", n: number) => (
    <h2 className="mb-2 flex items-center gap-2 font-semibold">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLOR[bucket] }} />
      {CLASS_LABEL[bucket]}
      <span className="text-sm font-normal text-muted">
        {n} {n === 1 ? "Position" : "Positionen"} · {fmtMoney(byClass[bucket])}
      </span>
    </h2>
  );

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

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4" title={"hint" in t ? t.hint : undefined}>
            <div className="text-xs text-muted">{t.label}</div>
            <div className={`tabular mt-1 text-lg font-semibold ${"tone" in t ? t.tone : ""}`}>
              {"href" in t && t.href ? <Link href={t.href} className="hover:text-accent">{t.value}</Link> : t.value}
            </div>
            {"sub" in t && t.sub && <div className={`tabular text-xs ${"tone" in t ? t.tone : "text-muted"}`}>{t.sub}</div>}
          </div>
        ))}
      </section>

      {missingValues.length > 0 && (
        <p className="text-xs text-light-orange">
          Noch ohne aktuellen Kurs: {missingValues.map((p) => p.name).join(", ")}. Gesamtvermögen und Aufteilung sind erst nach dem nächsten Aktualisieren vollständig.
        </p>
      )}

      {clusters.length > 0 && (
        <div className="card border-light-orange p-4 text-sm">
          <span className="font-medium text-light-orange">Klumpen-Hinweis: </span>
          {clusters.map((c) => `${c.name} ${fmtPct(c.share)}`).join(", ")} des Gesamtvermögens, deine Grenze liegt bei {fmtPct(maxShare, 0)} je Position.{" "}
          <Link href="/einstellungen#depot" className="text-accent">Grenze ändern</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AllocationCard rows={allocRows} />
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Zielaufteilung</h2>
            <Link href="/einstellungen#depot" className="text-xs text-accent">{hasTargets ? "Ziele ändern" : "Ziele festlegen"}</Link>
          </div>
          {!hasTargets ? (
            <p className="text-sm text-muted">Lege fest, wie viel Prozent du in Aktien, ETF, Krypto und Bar halten willst. Hier siehst du dann, wie weit das Depot davon abweicht.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Klasse</th>
                  <th className="pb-2 pl-3 text-right font-medium">Ist</th>
                  <th className="pb-2 pl-3 text-right font-medium">Ziel</th>
                  <th className="pb-2 pl-3 text-right font-medium">Abweichung</th>
                  <th className="hidden pb-2 pl-3 text-right font-medium sm:table-cell">in €</th>
                </tr>
              </thead>
              <tbody>
                {deviations.map((d) => (
                  <tr key={d.bucket} className="border-t border-border">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CLASS_COLOR[d.bucket] }} />
                        {CLASS_LABEL[d.bucket]}
                      </span>
                    </td>
                    <td className="tabular py-2 pl-3 text-right">{fmtPct(d.actual)}</td>
                    <td className="tabular py-2 pl-3 text-right text-muted">{fmtPct(d.target, 0)}</td>
                    <td className={`tabular whitespace-nowrap py-2 pl-3 text-right ${Math.abs(d.diff) >= 0.05 ? "text-light-orange" : ""}`}>
                      {d.diff > 0 ? "+" : ""}
                      {(d.diff * 100).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Pkt.
                    </td>
                    <td className="tabular hidden py-2 pl-3 text-right text-muted sm:table-cell">
                      {d.diffEur > 0 ? "+" : ""}
                      {fmtMoney(d.diffEur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hasTargets && <p className="mt-3 text-xs text-muted">Abgleich mit deinen eigenen Zielen; ab 5 Prozentpunkten orange markiert. Keine Empfehlung zum Umschichten.</p>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <WealthHistory />
        {cashCard}
      </div>

      {stocks.length > 0 && (
        <div>
          {sectionTitle("STOCK", stocks.length)}
          <PositionsTable positions={stocks} />
        </div>
      )}
      {etfs.length > 0 && (
        <div>
          {sectionTitle("ETF", etfs.length)}
          <section className="card">
            <ClassTable positions={etfs} total={total} kind="ETF" />
          </section>
        </div>
      )}
      {cryptos.length > 0 && (
        <div>
          {sectionTitle("CRYPTO", cryptos.length)}
          <section className="card">
            <ClassTable positions={cryptos} total={total} kind="CRYPTO" />
          </section>
        </div>
      )}
      {positions.length === 0 && <div className="card p-6 text-sm text-muted">Aktuell keine Wertpapiere im Bestand.</div>}

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
        Die Ampel gilt nur für Aktien und ist eine mechanische Auswertung eigener Regeln, keine Anlageberatung. Kauf- und Verkaufskurse sind in EUR laut Abrechnung erfasst; Kurse und Dividenden in Fremdwährung werden zum aktuellen EZB-Kurs in EUR umgerechnet, Wechselkursgewinne und -verluste stecken deshalb im Gewinn/Verlust. Realisierte Gewinne nach der Durchschnittskostenmethode inkl. Gebühren.
        Die Krypto-Haltedauer zählt nach FIFO (älteste Käufe gelten als zuerst verkauft); nach mehr als einem Jahr sind private Veräußerungsgewinne in Deutschland in der Regel steuerfrei (§ 23 EStG). Das ist ein Hinweis, keine Steuerberatung.
      </p>
    </div>
  );
}
