"use client";

import Link from "next/link";
import { useState } from "react";
import { removeWatch } from "@/app/actions";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import type { WatchRow } from "@/lib/watchlist-server";
import { PriceChart } from "./charts";
import { Light } from "./light";
import { RefreshButton } from "./refresh-button";

export function Watchlist({ rows, refreshing }: { rows: WatchRow[]; refreshing?: boolean }) {
  const [selected, setSelected] = useState(rows[0]?.symbol);
  // Nach dem Löschen des gewählten Titels auf den ersten zurückfallen
  const current = rows.find((r) => r.symbol === selected) ?? rows[0];
  const s = current?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Watchliste</h1>
          <p className="text-sm text-muted">
            Titel aus dem{" "}
            <Link href="/check" className="text-accent">
              Aktien Check
            </Link>{" "}
            aufnehmen. Ampel nach den Kriterien des Aktien Checks.
          </p>
          {refreshing && <p className="text-xs text-light-orange">Titel werden im Hintergrund aktualisiert – Seite in ein bis zwei Minuten neu laden.</p>}
        </div>
        {rows.length > 0 && <RefreshButton target="watchlist" />}
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-muted">
          Noch keine Titel. Im Aktien Check eine Aktie prüfen und „+ Zur Watchliste“ klicken.
        </div>
      ) : (
        <>
          <section className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-normal">ISIN</th>
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Ampel</th>
                  <th className="px-4 py-2 text-right font-normal">Kurs</th>
                  <th className="px-4 py-2 font-normal">Fair Value (KGV)</th>
                  <th className="px-4 py-2 font-normal">Stand</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.symbol)}
                    aria-selected={r.symbol === current?.symbol}
                    className={`cursor-pointer border-b border-border last:border-0 ${r.symbol === current?.symbol ? "bg-background" : "hover:bg-background"}`}
                  >
                    <td className="tabular px-4 py-2">{r.isin ?? "–"}</td>
                    <td className="px-4 py-2">
                      <span className={`font-medium ${r.symbol === current?.symbol ? "text-accent" : ""}`}>{r.name}</span> <span className="text-xs text-muted">{r.symbol}</span>
                    </td>
                    <td className="px-4 py-2">
                      {r.light ? (
                        <span className="flex items-center gap-2" title={r.summary?.items.map((i) => `${i.title}: ${i.verdict}`).join("\n")}>
                          <Light light={r.light} />
                          <span className="text-xs text-muted">{r.light === "GREY" ? "zu wenig Daten" : `${r.summary?.passed} von ${r.summary?.total}`}</span>
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="tabular px-4 py-2 text-right">{r.summary?.price ? fmtMoney(r.summary.price.value, r.currency) : "–"}</td>
                    <td className="tabular px-4 py-2 text-xs">
                      {r.summary?.pe?.deviation !== undefined ? (
                        <span className={r.summary.pe.deviation <= 0 ? "text-light-green" : "text-light-red"}>
                          {fmtPct(Math.abs(r.summary.pe.deviation))} {r.summary.pe.deviation <= 0 ? "unter" : "über"}
                        </span>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {r.checkedAt ? fmtDate(r.checkedAt) : "–"}
                      {r.error && (
                        <span className="block text-light-red" title={r.error}>
                          Fehler beim letzten Abruf
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form
                        action={removeWatch}
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={(e) => {
                          if (!confirm(`${r.name} von der Watchliste löschen?`)) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-xs text-light-red">Löschen</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {current && (
            <section className="card p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Kursverlauf {current.name} <span className="font-normal text-muted">{current.symbol}</span>
                </h2>
                {s && (
                  <span className="tabular text-xs text-muted">
                    {[
                      s.pe && `Fair (KGV) ${fmtMoney(s.pe.value, current.currency)}`,
                      s.fairValue !== undefined && `Fair (Dividende) ${fmtMoney(s.fairValue, current.currency)}`,
                      s.dcf !== undefined && `Fair (DCF) ${fmtMoney(s.dcf, current.currency)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              <PriceChart
                key={current.symbol}
                symbol={current.symbol}
                currency={current.currency}
                fair={s?.pe && { points: s.pe.points, pe: s.pe.pe }}
              />
              {s && s.items.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                  {s.items.map((i) => (
                    <li key={i.title} className="flex items-start gap-2">
                      <span className="mt-1">
                        <Light light={i.light} />
                      </span>
                      <span>
                        <span className="text-muted">{i.title}:</span> {i.verdict}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <p className="text-xs text-muted">Mechanische Auswertung, keine Anlageberatung. Faire Werte und Ampel mit Stand der letzten Aktualisierung.</p>
        </>
      )}
    </div>
  );
}
