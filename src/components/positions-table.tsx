"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Position } from "@/lib/portfolio";
import type { LightColor } from "@/lib/rating";
import { fmtBig, fmtMoney, fmtMonths, fmtNum, fmtPct } from "@/lib/format";
import { Light } from "./light";
import { Value } from "./value";

type Col = {
  key: string;
  label: string;
  title?: string;
  sort?: (p: Position) => number | string | undefined;
  render: (p: Position) => React.ReactNode;
};

const LIGHT_ORDER: Record<LightColor, number> = { RED: 0, ORANGE: 1, GREEN: 2, GREY: 3 };
const OUTLOOK: Record<string, string> = { RAISED: "angehoben", CONFIRMED: "bestätigt", LOWERED: "gesenkt", UNKNOWN: "keine Angabe" };

const COLS: Col[] = [
  { key: "light", label: "Ampel", sort: (p) => LIGHT_ORDER[p.light], render: (p) => <Light light={p.light} /> },
  {
    key: "name",
    label: "Aktie",
    sort: (p) => p.name,
    render: (p) => (
      <Link href={`/aktie/${p.stockId}`} className="block min-w-40 hover:text-accent">
        <span className="font-medium">{p.name}</span>
        <span className="block text-xs text-muted">{p.symbol}</span>
      </Link>
    ),
  },
  { key: "qty", label: "Stück", sort: (p) => p.quantity, render: (p) => <span className="tabular">{fmtNum(p.quantity, p.quantity % 1 ? 3 : 0)}</span> },
  { key: "avg", label: "Ø Kauf", sort: (p) => p.avgCost, render: (p) => <span className="tabular">{fmtMoney(p.avgCost)}</span> },
  { key: "price", label: "Kurs", title: "Letzter Schlusskurs", sort: (p) => p.priceEur?.value, render: (p) => <Value s={p.priceEur} format={(v) => fmtMoney(v)} /> },
  { key: "value", label: "Wert €", sort: (p) => p.valueEur, render: (p) => <span className="tabular">{fmtMoney(p.valueEur)}</span> },
  {
    key: "gain",
    label: "G/V €",
    sort: (p) => p.gainEur,
    render: (p) => <span className={`tabular ${p.gainEur === undefined ? "" : p.gainEur >= 0 ? "text-light-green" : "text-light-red"}`}>{fmtMoney(p.gainEur)}</span>,
  },
  { key: "yield", label: "Rendite", title: "Dividendenrendite (12 Monate)", sort: (p) => p.metrics.dividendYield?.value, render: (p) => <Value s={p.metrics.dividendYield} format={(v) => fmtPct(v)} /> },
  { key: "yoc", label: "YoC", title: "Yield on Cost", sort: (p) => p.metrics.yieldOnCost?.value, render: (p) => <Value s={p.metrics.yieldOnCost} format={(v) => fmtPct(v)} /> },
  { key: "payout", label: "Payout EPS", sort: (p) => p.metrics.payoutEps?.value, render: (p) => <Value s={p.metrics.payoutEps} format={(v) => fmtPct(v, 0)} /> },
  { key: "payoutFcf", label: "Payout FCF", sort: (p) => p.metrics.payoutFcf?.value, render: (p) => <Value s={p.metrics.payoutFcf} format={(v) => fmtPct(v, 0)} /> },
  { key: "cagr", label: "CAGR 5J", title: "Dividendenwachstum p. a. über 5 Jahre", sort: (p) => p.metrics.dividendCagr5?.value, render: (p) => <Value s={p.metrics.dividendCagr5} format={(v) => fmtPct(v)} /> },
  { key: "de", label: "D/E", title: "Debt to Equity", sort: (p) => p.metrics.debtToEquity?.value, render: (p) => <Value s={p.metrics.debtToEquity} format={(v) => fmtNum(v)} /> },
  { key: "debt", label: "Neuversch.", title: "Veränderung Gesamtschulden ggü. Vorjahr", sort: (p) => p.metrics.debtChangeYoY?.value, render: (p) => <Value s={p.metrics.debtChangeYoY} format={(v) => (v > 0 ? "+" : "") + fmtPct(v)} /> },
  {
    key: "freq",
    label: "Rhythmus",
    title: "Ausschüttungsrhythmus und Monate der Ex-Tage",
    sort: (p) => p.metrics.frequency?.value,
    render: (p) => (
      <>
        <Value s={p.metrics.frequency} format={(v) => v} />
        {p.metrics.exMonths && <span className="block text-xs text-muted">{fmtMonths(p.metrics.exMonths.value)}</span>}
      </>
    ),
  },
  { key: "fcf", label: "FCF", title: "Free Cashflow (12 Monate)", sort: (p) => p.fcfEur?.value, render: (p) => <Value s={p.fcfEur} format={(v) => fmtBig(v, "EUR")} /> },
  { key: "eps", label: "EPS", title: "Gewinn je Aktie (12 Monate)", sort: (p) => p.metrics.epsTTM?.value, render: (p) => <Value s={p.metrics.epsTTM} format={(v) => fmtNum(v)} /> },
  { key: "outlook", label: "Ausblick", sort: (p) => p.outlookStatus, render: (p) => (p.outlookStatus ? OUTLOOK[p.outlookStatus] : <span className="text-muted">–</span>) },
];

export function PositionsTable({ positions }: { positions: Position[] }) {
  const [sortKey, setSortKey] = useState("light");
  const [asc, setAsc] = useState(true);
  const [filter, setFilter] = useState<LightColor | "ALL">("ALL");

  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey)!;
    const list = positions.filter((p) => filter === "ALL" || p.light === filter);
    return [...list].sort((a, b) => {
      const x = col.sort?.(a);
      const y = col.sort?.(b);
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "de");
      return asc ? r : -r;
    });
  }, [positions, sortKey, asc, filter]);

  const counts = positions.reduce<Record<string, number>>((c, p) => ((c[p.light] = (c[p.light] ?? 0) + 1), c), {});

  return (
    <section className="card">
      <div className="flex flex-wrap gap-2 border-b border-border p-3 text-sm">
        {(["ALL", "RED", "ORANGE", "GREEN", "GREY"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${filter === f ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {f === "ALL" ? "Alle" : <Light light={f} />}
            <span className="tabular">{f === "ALL" ? positions.length : (counts[f] ?? 0)}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              {COLS.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium" title={c.title}>
                  <button
                    onClick={() => (sortKey === c.key ? setAsc(!asc) : (setSortKey(c.key), setAsc(true)))}
                    className="hover:text-foreground"
                  >
                    {c.label}
                    {sortKey === c.key && (asc ? " ↑" : " ↓")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.stockId} className="border-b border-border last:border-0 hover:bg-background">
                {COLS.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2.5">
                    {c.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
