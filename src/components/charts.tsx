"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

const euro = (v: unknown) => (typeof v === "number" ? v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "–");
const euro2 = (v: unknown) => (typeof v === "number" ? v.toLocaleString("de-DE", { style: "currency", currency: "EUR" }) : "–");

export function DividendYearChart({ data }: { data: { year: number; net: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--muted)" }} />
          <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} tickFormatter={euro} width={60} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [euro2(v), "Netto"]} />
          <Bar dataKey="net" fill="var(--green)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DividendMonthChart({ data }: { data: { label: string; net: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} interval={0} />
          <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} tickFormatter={euro} width={60} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [euro2(v), "Netto"]} />
          <Bar dataKey="net" fill="var(--accent)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type Range = "1d" | "1w" | "6m" | "1y" | "5y";
const RANGE_LABELS: [Range, string][] = [
  ["1d", "1 Tag"],
  ["1w", "1 Woche"],
  ["6m", "6 Monate"],
  ["1y", "1 Jahr"],
  ["5y", "5 Jahre"],
];
type PricePoint = { time: number; close: number };

export function PriceChart({ symbol, currency, fairValue }: { symbol: string; currency: string; fairValue?: number }) {
  const [range, setRange] = useState<Range>("1y");
  const [data, setData] = useState<{ key: string; points: PricePoint[] }>();
  const key = `${symbol}|${range}`;

  useEffect(() => {
    let active = true;
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .catch(() => ({ points: [] }))
      .then((d: { points: PricePoint[] }) => active && setData({ key, points: d.points ?? [] }));
    return () => {
      active = false;
    };
  }, [symbol, range, key]);

  const points = data?.key === key ? data.points : undefined;
  const intraday = range === "1d" || range === "1w";
  const first = points?.[0]?.close;
  const last = points?.[points.length - 1]?.close;
  const change = first && last ? last / first - 1 : undefined;
  const color = change === undefined || change >= 0 ? "var(--green)" : "var(--red)";
  const fmtTick = (t: number) =>
    new Date(t).toLocaleString("de-DE", range === "1d" ? { hour: "2-digit", minute: "2-digit" } : range === "1w" ? { weekday: "short", day: "2-digit" } : range === "6m" ? { day: "2-digit", month: "short" } : { month: "short", year: "2-digit" });
  const fmtFull = (t: unknown) =>
    typeof t === "number" ? new Date(t).toLocaleString("de-DE", intraday ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const money = (v: unknown) => (typeof v === "number" ? v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ` ${currency}` : "–");
  // Fairen Wert nur einblenden, wenn er nahe am Kursbereich liegt – sonst würde die Achse den Verlauf plattdrücken
  const closes = points?.map((p) => p.close) ?? [];
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const showFair = fairValue !== undefined && closes.length > 0 && fairValue > lo * 0.85 && fairValue < hi * 1.15;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 text-xs">
          {RANGE_LABELS.map(([r, label]) => (
            <button key={r} type="button" onClick={() => setRange(r)} className={`rounded-full border px-3 py-0.5 ${range === r ? "border-accent text-accent" : "border-border text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        {change !== undefined && (
          <span className="tabular text-sm font-medium" style={{ color }}>
            {change >= 0 ? "+" : ""}
            {(change * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
          </span>
        )}
      </div>
      <div className="h-64">
        {!points ? (
          <p className="pt-24 text-center text-sm text-muted">Lade Kursverlauf …</p>
        ) : points.length === 0 ? (
          <p className="pt-24 text-center text-sm text-muted">Für diesen Zeitraum liefert die Quelle keine Kurse.</p>
        ) : (
          <ResponsiveContainer>
            <AreaChart data={points}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtTick} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={40} />
              <YAxis
                domain={showFair ? [Math.min(lo, fairValue!) * 0.97, Math.max(hi, fairValue!) * 1.03] : ["auto", "auto"]}
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                tickFormatter={nf(2)}
                width={52}
              />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtFull} formatter={(v) => [money(v), "Kurs"]} />
              <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#priceFill)" dot={false} isAnimationActive={false} />
              {showFair && (
                <ReferenceLine y={fairValue} stroke="var(--accent)" strokeDasharray="5 4" label={{ value: "fairer Wert", position: "insideTopLeft", fontSize: 11, fill: "var(--accent)" }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Quelle: Yahoo Finance{intraday ? ", intraday ggf. verzögert" : ""}.
        {fairValue !== undefined && closes.length > 0 && !showFair && " Fairer Wert liegt außerhalb des dargestellten Kursbereichs."}
      </p>
    </div>
  );
}
