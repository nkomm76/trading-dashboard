"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, useTransition, type ReactNode } from "react";
import { addWatch, checkStock } from "@/app/actions";
import { fmtBig, fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { DividendChart, EpsFcfChart, PriceChart, SeasonalityChart } from "./charts";
import { Light } from "./light";

const OVERALL: Record<string, string> = {
  GREEN: "Alle geprüften Kriterien erfüllt",
  ORANGE: "Teilweise erfüllt – genauer hinschauen",
  RED: "Mindestens ein Warnsignal",
  GREY: "Zu wenig Daten für eine Bewertung",
};

function FairHeadline({ value, deviation, currency }: { value: number; deviation?: number; currency: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
      <span className="tabular text-2xl font-semibold">{fmtMoney(value, currency)}</span>
      {deviation !== undefined && (
        <span className={`text-sm font-medium ${deviation <= 0 ? "text-light-green" : "text-light-orange"}`}>
          Kurs {fmtPct(Math.abs(deviation))} {deviation <= 0 ? "darunter" : "darüber"}
        </span>
      )}
    </div>
  );
}

const TABS = [
  ["bewertung", "Bewertung"],
  ["chart", "Chart"],
  ["dividende", "Dividende"],
  ["fundamental", "Fundamentaldaten"],
  ["fair", "Fairer Wert"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Reiter wird beim ersten Öffnen aufgebaut und danach nur ausgeblendet – Zoom und Auswahl in den Charts bleiben erhalten. */
function TabPanel({ id, tab, visited, children }: { id: Tab; tab: Tab; visited: Set<Tab>; children: ReactNode }) {
  if (!visited.has(id)) return null;
  // Unsichtbar statt display:none, damit die Charts ihre Breite behalten
  const active = tab === id;
  return (
    <div role="tabpanel" inert={!active} aria-hidden={!active} className={`space-y-6 ${active ? "" : "invisible absolute inset-x-0 top-0 h-0 overflow-hidden"}`}>
      {children}
    </div>
  );
}

function WatchButton({ symbol, isin, watched }: { symbol: string; isin?: string; watched?: boolean }) {
  const [done, setDone] = useState(watched ?? false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  if (done)
    return (
      <Link href="/watchliste" className="text-xs text-accent">
        ✓ Auf der Watchliste
      </Link>
    );
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await addWatch(symbol, isin);
            setError(res?.error);
            if (res?.ok) setDone(true);
          })
        }
      >
        {pending ? "Nehme auf …" : "+ Zur Watchliste"}
      </button>
      {error && <span className="max-w-xs text-right text-xs text-light-red">{error}</span>}
    </div>
  );
}

export function StockCheck() {
  const [state, action, pending] = useActionState(checkStock, undefined);
  const queryRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("bewertung");
  const [visited, setVisited] = useState<Set<Tab>>(new Set(["bewertung"]));
  const open = (id: Tab) => {
    setTab(id);
    setVisited((v) => new Set(v).add(id));
  };

  const run = (symbol?: string) => {
    const data = new FormData();
    data.set("query", queryRef.current?.value ?? "");
    if (symbol) data.set("symbol", symbol);
    startTransition(() => action(data));
  };

  const r = state?.result;
  const pe = r && !("unavailable" in r.peFair) ? r.peFair : undefined;

  return (
    <div className="relative space-y-6">
      <form
        className="card flex flex-col gap-3 p-4 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input ref={queryRef} className="input flex-1" name="query" placeholder="ISIN, z. B. DE0008404005 oder US4781601046" autoComplete="off" required />
        <button className="btn" disabled={pending}>
          {pending ? "Prüfe …" : "Check"}
        </button>
      </form>

      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}

      {r && (
        <>
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{r.name}</h2>
                <p className="text-sm text-muted">
                  {r.symbol}
                  {r.exchange && ` · ${r.exchange}`}
                  {r.sector && ` · ${r.sector}`}
                  {state?.isin && ` · ${state.isin}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Light light={r.overall} size="lg" />
                  <span className="font-medium">{r.overall === "GREY" ? OVERALL.GREY : `${r.passed} von ${r.items.length} sehr gut`}</span>
                </div>
                <WatchButton key={r.symbol} symbol={r.symbol} isin={state?.isin} watched={state?.watched} />
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Aktueller Kurs</dt>
                <dd className="tabular text-lg font-semibold">{r.price ? fmtMoney(r.price.value, r.currency) : "–"}</dd>
                {r.price && (
                  <dd className="text-xs text-muted">
                    Stand {fmtDate(r.price.asOf)}
                    {r.nativeCurrency && ` · aus ${r.nativeCurrency} umgerechnet`}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-muted">Erwartete Dividendenrendite</dt>
                <dd className="tabular text-lg font-semibold">{r.expectedYield ? fmtPct(r.expectedYield.value) : "–"}</dd>
                {r.expectedYield && <dd className="text-xs text-muted">{r.expectedYield.basis}</dd>}
              </div>
              <div>
                <dt className="text-xs text-muted">Rendite letzte 12 Monate</dt>
                <dd className="tabular text-lg font-semibold">{r.trailingYield !== undefined ? fmtPct(r.trailingYield) : "–"}</dd>
                <dd className="text-xs text-muted">tatsächlich gezahlt</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Fairer Wert</dt>
                <dd className="tabular text-lg font-semibold">{pe ? fmtMoney(pe.value, r.currency) : "–"}</dd>
                <dd className="text-xs text-muted">
                  {pe?.deviation !== undefined && (
                    <span className={pe.deviation <= 0 ? "text-light-green" : "text-light-red"}>
                      {fmtPct(Math.abs(pe.deviation))} {pe.deviation <= 0 ? "unterbewertet" : "überbewertet"} ·{" "}
                    </span>
                  )}
                  <button type="button" onClick={() => open("fair")} className="text-accent">
                    nach Ø-KGV
                  </button>
                </dd>
              </div>
            </dl>

            {state && state.listings.length > 1 && (
              <div className="mt-5 text-xs text-muted">
                Andere Börsenplätze:{" "}
                {state.listings
                  .filter((l) => l.symbol !== r.symbol)
                  .slice(0, 6)
                  .map((l) => (
                    <button key={l.symbol} type="button" onClick={() => run(l.symbol)} className="mr-2 text-accent" disabled={pending}>
                      {l.symbol}
                      {l.exchange && ` (${l.exchange})`}
                    </button>
                  ))}
              </div>
            )}
          </section>

          <div role="tablist" className="-mb-2 flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => open(id)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-foreground"}`}
              >
                {label}
                {id === "bewertung" && r.overall !== "GREY" && <span className="ml-1.5 text-xs text-muted">{r.passed}/{r.items.length}</span>}
              </button>
            ))}
          </div>

          <TabPanel id="bewertung" tab={tab} visited={visited}>
            <section className="card divide-y divide-border">
              {r.items.map((i) => (
                <div key={i.key} className="flex gap-3 p-4">
                  <span className="mt-1">
                    <Light light={i.light} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-muted">{i.title}</p>
                    <p className="font-medium">{i.verdict}</p>
                    {i.details.length > 0 && (
                      <ul className="tabular mt-1 space-y-0.5 text-xs text-muted">
                        {i.details.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </section>
            {r.nativeCurrency && (
              <p className="text-xs text-muted">
                Die Kriterien rechnen in der Originalwährung ({r.nativeCurrency}), damit Wechselkurse die Ampel nicht verfälschen – Beträge oben in {r.nativeCurrency}.
              </p>
            )}
          </TabPanel>
          <TabPanel id="chart" tab={tab} visited={visited}>
            <section className="card p-5">
              <h3 className="mb-3 text-sm font-semibold">Kursverlauf</h3>
              <PriceChart
                key={r.symbol}
                symbol={r.symbol}
                currency={r.currency}
                fair={pe && { points: pe.points, pe: pe.pe }}
              />
            </section>

            <section className="card p-5">
              <h3 className="mb-3 text-sm font-semibold">Saisonalität</h3>
              <SeasonalityChart key={r.symbol} symbol={r.symbol} />
            </section>
          </TabPanel>
          <TabPanel id="dividende" tab={tab} visited={visited}>
            {r.schedule && (
              <section className="card p-5 text-sm">
                <h3 className="mb-2 text-sm font-semibold">Ausschüttungen</h3>
                <p>
                  <span className="font-medium">{r.schedule.frequency ? r.schedule.frequency[0].toUpperCase() + r.schedule.frequency.slice(1) : "Rhythmus unbekannt"}</span>
                  {r.schedule.months && (r.schedule.months.length >= 12 ? " · Ex-Tage jeden Monat" : ` · Ex-Tage üblich im ${r.schedule.months.join(", ")}`)}
                </p>
                <p className="tabular text-xs text-muted">
                  {r.schedule.last && `Letzte: ${fmtDate(r.schedule.last.date)} – ${fmtMoney(r.schedule.last.amount, r.currency)} je Aktie`}
                  {r.schedule.nextExDate && ` · Nächster Ex-Tag: ${fmtDate(r.schedule.nextExDate)}`}
                </p>
              </section>
            )}
            <section className="card p-5">
              <h3 className="mb-3 text-sm font-semibold">Dividende je Aktie pro Jahr ({r.currency})</h3>
              {r.dividendsByYear.length ? (
                <DividendChart data={r.dividendsByYear} currentYear={new Date().getFullYear()} />
              ) : (
                <p className="text-sm text-muted">Keine Dividendenhistorie verfügbar.</p>
              )}
              <p className="mt-1 text-xs text-muted">
                Letzte 10 abgeschlossene Jahre, nach Ex-Tag{r.nativeCurrency && `; jede Zahlung zum Wechselkurs ihres Ex-Tags von ${r.nativeCurrency} in Euro umgerechnet`}. Quelle: Yahoo
                Finance{r.nativeCurrency && ", Wechselkurse Yahoo Finance"}.
              </p>
            </section>
          </TabPanel>
          <TabPanel id="fundamental" tab={tab} visited={visited}>
            <section className="card p-5">
              <h3 className="mb-3 text-sm font-semibold">EPS und Free Cashflow (3 Jahre)</h3>
              <EpsFcfChart key={r.symbol} quarterly={r.fundamentals.quarterly} annual={r.fundamentals.annual} currency={r.financialCurrency ?? r.currency} />
              <p className="mt-1 text-xs text-muted">EPS je Aktie, Free Cashflow gesamt (rechte Achse). Quelle: Yahoo Finance{(r.nativeCurrency ?? r.currency) === "USD" ? ", ergänzt um SEC" : ""}
                {r.nativeCurrency && "; je Periode zum Wechselkurs ihres Stichtags in Euro umgerechnet"}.
              </p>
            </section>
          </TabPanel>
          <TabPanel id="fair" tab={tab} visited={visited}>
            <section className="card p-5">
              <h3 className="text-sm font-semibold">Fairer Wert</h3>
              <div className="mt-3 grid gap-6 lg:grid-cols-3">
                <div>
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <span className="inline-block w-4 border-t-2 border-foreground" /> Nach KGV (Ø 5 Jahre) – Kurve im Chart
                  </p>
                  {pe ? (
                    <>
                      <FairHeadline value={pe.value} deviation={pe.deviation} currency={r.currency} />
                      <ul className="tabular mt-2 space-y-0.5 text-xs text-muted">
                        <li>
                          Gewinn je Aktie (Ø 3 Jahre) {fmtMoney(pe.eps, r.currency)} × Ø-KGV {pe.pe.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                        </li>
                        <li>Gewinn: {pe.epsBasis}</li>
                        <li>
                          Ø aus {pe.months} Monatswerten {fmtDate(pe.from)} – {fmtDate(pe.to)}, Spanne KGV {pe.minPe.toLocaleString("de-DE", { maximumFractionDigits: 1 })} bis{" "}
                          {pe.maxPe.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                        </li>
                        <li>Gewinn als Ø von 3 Jahren, damit Einmaleffekte die Bewertung nicht verzerren; Ø-KGV auf derselben Basis.</li>
                        <li>Im Chart für jeden Tag mit dem jeweiligen Gewinn je Aktie gerechnet.</li>
                        {pe.notes.map((n) => (
                          <li key={n} className="text-light-orange">
                            Hinweis: {n}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Nicht berechenbar: {"unavailable" in r.peFair ? r.peFair.unavailable : "keine Daten"}.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted">Nach Dividendenrendite (Ø 5 Jahre)</p>
                  {r.fairValue ? (
                    <>
                      <FairHeadline value={r.fairValue.value} deviation={r.fairValue.deviation} currency={r.currency} />
                      <ul className="tabular mt-2 space-y-0.5 text-xs text-muted">
                        <li>
                          Jahresdividende {fmtMoney(r.fairValue.dividend, r.currency)} ÷ Ø-Rendite {fmtPct(r.fairValue.avgYield, 2)}
                        </li>
                        <li>Jahresdividende: {r.fairValue.dividendBasis}</li>
                        <li>
                          Ø aus {r.fairValue.months} Monatswerten {fmtDate(r.fairValue.from)} – {fmtDate(r.fairValue.to)}, Spanne {fmtPct(r.fairValue.minYield, 2)} bis{" "}
                          {fmtPct(r.fairValue.maxYield, 2)}
                        </li>
                        {r.fairValue.notes.map((n) => (
                          <li key={n} className="text-light-orange">
                            Hinweis: {n}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Nicht berechenbar: braucht eine regelmäßige, aktuelle Dividende und mindestens 3 Jahre Historie.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted">
                    Nach DCF (Free Cashflow)
                  </p>
                  {r.dcf && !("unavailable" in r.dcf) ? (
                    <>
                      <FairHeadline value={r.dcf.value} deviation={r.dcf.deviation} currency={r.currency} />
                      <ul className="tabular mt-2 space-y-0.5 text-xs text-muted">
                        <li>
                          Spanne {fmtMoney(r.dcf.low, r.currency)} – {fmtMoney(r.dcf.high, r.currency)} (Abzinsung ±1 Prozentpunkt)
                        </li>
                        <li>
                          Basis: Ø-FCF {r.dcf.baseYears}: {fmtBig(r.dcf.baseFcf, r.financialCurrency ?? r.currency)}, {fmtBig(r.dcf.shares)} Aktien
                        </li>
                        <li>
                          Wachstum Jahr 1–5: {fmtPct(r.dcf.growth)} p. a. ({r.dcf.growthBasis}), danach bis Jahr 10 auf {fmtPct(r.dcf.assumptions.terminalGrowth)}
                        </li>
                        <li>
                          Abzinsung {fmtPct(r.dcf.assumptions.discountRate)}, ewiges Wachstum {fmtPct(r.dcf.assumptions.terminalGrowth)} –{" "}
                          <Link href="/einstellungen" className="text-accent">
                            anpassen
                          </Link>
                        </li>
                        {r.dcf.notes.map((n) => (
                          <li key={n} className="text-light-orange">
                            Hinweis: {n}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Nicht berechenbar: {r.dcf && "unavailable" in r.dcf ? r.dcf.unavailable : "keine Daten"}.</p>
                  )}
                </div>
              </div>
              <p className="mt-4 text-xs text-muted">
                Alle drei Werte sind Modelle mit Annahmen, keine Anlageberatung. KGV- und Dividendenmethode unterstellen, dass die Aktie zu ihrer üblichen Bewertung
                zurückkehrt; der DCF reagiert stark auf Abzinsung und Wachstum.
              </p>
            </section>
          </TabPanel>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{OVERALL[r.overall]}. Mechanische Auswertung, keine Anlageberatung. Quellen: {r.sources.join(", ")}.</p>
            <Link href={`/kauf?buy=${encodeURIComponent(r.symbol)}&name=${encodeURIComponent(r.name)}`} className="btn-secondary">
              Als Kauf erfassen
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
