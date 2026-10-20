"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const nf = (d = 2) => (v: unknown) => (typeof v === "number" ? v.toLocaleString("de-DE", { maximumFractionDigits: d }) : "–");
const compact = (v: unknown) => (typeof v === "number" ? v.toLocaleString("de-DE", { notation: "compact", maximumFractionDigits: 1 }) : "–");
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };

export function DividendChart({ data, currentYear }: { data: { year: number; total: number }[]; currentYear: number }) {
  // Laufendes Jahr ist unvollständig und wird ausgeblendet
  const rows = data.filter((d) => d.year < currentYear);
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--muted)" }} />
          <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} tickFormatter={nf(2)} width={48} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [nf(4)(v), "Dividende"]} />
          <Bar dataKey="total" fill="var(--accent)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type Row = { date: string; eps: number | null; fcf: number | null };

export function EpsFcfChart({ quarterly, annual, currency }: { quarterly: Row[]; annual: Row[]; currency?: string }) {
  const hasQ = quarterly.some((r) => r.eps !== null || r.fcf !== null);
  const [mode, setMode] = useState<"q" | "a">(hasQ ? "q" : "a");
  const rows = (mode === "q" ? quarterly : annual).filter((r) => r.eps !== null || r.fcf !== null);

  return (
    <div>
      <div className="mb-2 flex gap-2 text-xs">
        {(["q", "a"] as const).map((k) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded-full border px-3 py-0.5 ${mode === k ? "border-accent text-accent" : "border-border text-muted"}`}>
            {k === "q" ? "Quartale" : "Jahre"}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Keine Daten verfügbar.</p>
      ) : (
        <div className="h-60">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={(d: string) => (mode === "q" ? d.slice(0, 7) : d.slice(0, 4))} />
              <YAxis yAxisId="eps" tick={{ fontSize: 12, fill: "var(--muted)" }} tickFormatter={nf(2)} width={44} />
              <YAxis yAxisId="fcf" orientation="right" tick={{ fontSize: 12, fill: "var(--muted)" }} tickFormatter={compact} width={52} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => (name === "EPS" ? nf(2)(v) : `${compact(v)} ${currency ?? ""}`)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="eps" dataKey="eps" name="EPS" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line yAxisId="fcf" dataKey="fcf" name="Free Cashflow" stroke="var(--orange)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
