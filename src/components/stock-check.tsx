"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef } from "react";
import { checkStock } from "@/app/actions";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { Light } from "./light";

const OVERALL: Record<string, string> = {
  GREEN: "Alle geprüften Kriterien erfüllt",
  ORANGE: "Teilweise erfüllt – genauer hinschauen",
  RED: "Mindestens ein Warnsignal",
  GREY: "Zu wenig Daten für eine Bewertung",
};

export function StockCheck() {
  const [state, action, pending] = useActionState(checkStock, undefined);
  const queryRef = useRef<HTMLInputElement>(null);

  const run = (symbol?: string) => {
    const data = new FormData();
    data.set("query", queryRef.current?.value ?? "");
    if (symbol) data.set("symbol", symbol);
    startTransition(() => action(data));
  };

  const r = state?.result;

  return (
    <div className="space-y-6">
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
              <div className="flex items-center gap-2 text-sm">
                <Light light={r.overall} size="lg" />
                <span className="font-medium">{r.overall === "GREY" ? OVERALL.GREY : `${r.passed} von ${r.items.length} sehr gut`}</span>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Aktueller Kurs</dt>
                <dd className="tabular text-lg font-semibold">{r.price ? fmtMoney(r.price.value, r.currency) : "–"}</dd>
                {r.price && <dd className="text-xs text-muted">Stand {fmtDate(r.price.asOf)}</dd>}
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
            </dl>

            {r.schedule && (
              <div className="mt-5 rounded-md bg-background p-3 text-sm">
                <p className="mb-1 text-xs text-muted">Ausschüttungen</p>
                <p>
                  <span className="font-medium">{r.schedule.frequency ? r.schedule.frequency[0].toUpperCase() + r.schedule.frequency.slice(1) : "Rhythmus unbekannt"}</span>
                  {r.schedule.months && ` · Ex-Tage üblich im ${r.schedule.months.join(", ")}`}
                </p>
                <p className="tabular text-xs text-muted">
                  {r.schedule.last && `Letzte: ${fmtDate(r.schedule.last.date)} – ${fmtMoney(r.schedule.last.amount, r.currency)} je Aktie`}
                  {r.schedule.nextExDate && ` · Nächster Ex-Tag: ${fmtDate(r.schedule.nextExDate)}`}
                </p>
              </div>
            )}

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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{OVERALL[r.overall]}. Mechanische Auswertung, keine Anlageberatung. Quellen: Yahoo Finance, bei US-Werten SEC.</p>
            <Link href={`/kauf?buy=${encodeURIComponent(r.symbol)}&name=${encodeURIComponent(r.name)}`} className="btn-secondary">
              Als Kauf erfassen
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
