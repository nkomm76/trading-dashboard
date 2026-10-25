"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { valueAt, type TimeValue } from "@/lib/ema";
import { fairCurve, type EpsPoint } from "@/lib/fair-pe";

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

/** Fairer Wert nach KGV: Gewinnreihe je Aktie × Ø-KGV, für jeden Tag neu berechnet. */
export type FairCurve = { points: EpsPoint[]; pe: number };
// Bewertungsstufen um den fairen Wert: darüber teurer (rot), darunter günstiger (grün)
const FAIR_BANDS = [1.3, 1.2, 1.1, 0.9, 0.8, 0.7];

// Gleitende Durchschnitte: EMA 200 aus Tageskursen, EMA 20 aus Wochenkursen
const EMAS = [
  { key: "ema200d", label: "EMA 200 Tage", short: "EMA 200", color: "var(--ema-long)" },
  { key: "ema20w", label: "EMA 20 Wochen", short: "EMA 20 W", color: "var(--ema-short)" },
] as const;
type EmaKey = (typeof EMAS)[number]["key"];

export function PriceChart({ symbol, currency, fair }: { symbol: string; currency: string; fair?: FairCurve }) {
  const [range, setRange] = useState<Range>("1y");
  const [data, setData] = useState<{ key: string; points: PricePoint[] }>();
  // Zoom: per Maus aufgezogener Ausschnitt; feinere Kurse werden nachgeladen
  const [zoom, setZoom] = useState<{ from: number; to: number; points?: PricePoint[] }>();
  const [drag, setDrag] = useState<{ start?: number; end?: number }>();
  const [emaLines, setEmaLines] = useState<{ symbol: string } & Record<EmaKey, TimeValue[]>>();
  const [emaOn, setEmaOn] = useState<Record<EmaKey, boolean>>({ ema200d: true, ema20w: true });
  const [fairOn, setFairOn] = useState(true);
  // Kurve einmal je Gewinnreihe aufbauen – sie wird für jeden Kurspunkt ausgewertet
  const fairFn = useMemo(() => (fair ? fairCurve(fair.points, fair.pe) : undefined), [fair?.points, fair?.pe]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = `${symbol}|${range}`;

  useEffect(() => {
    let active = true;
    fetch(`/api/ema?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((d: Partial<Record<EmaKey, TimeValue[]>>) => active && setEmaLines({ symbol, ema200d: d.ema200d ?? [], ema20w: d.ema20w ?? [] }));
    return () => {
      active = false;
    };
  }, [symbol]);

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

  const all = data?.key === key ? data.points : undefined;
  const points = zoom ? (zoom.points ?? all?.filter((p) => p.time >= zoom.from && p.time <= zoom.to)) : all;

  const zoomTo = (from: number, to: number) => {
    setZoom({ from, to });
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&from=${Math.round(from)}&to=${Math.round(to)}`)
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .catch(() => ({ points: [] }))
      .then((d: { points: PricePoint[] }) => {
        // Nur übernehmen, wenn der Ausschnitt noch aktuell ist und die Quelle mehr Details liefert
        setZoom((z) => (z && z.from === from && z.to === to && (d.points?.length ?? 0) > 1 ? { ...z, points: d.points } : z));
      });
  };
  // Mausposition → Zeitpunkt: Die Zeitachse ist linear über die Breite des Gitters
  const boxRef = useRef<HTMLDivElement>(null);
  const timeAt = (clientX: number) => {
    const grid = boxRef.current?.querySelector(".recharts-cartesian-grid")?.getBoundingClientRect();
    if (!grid || !points || points.length < 2 || grid.width <= 0) return undefined;
    const f = Math.min(1, Math.max(0, (clientX - grid.left) / grid.width));
    return points[0].time + f * (points[points.length - 1].time - points[0].time);
  };
  // Endpunkt ist die Position beim Loslassen (bzw. beim Verlassen des Charts)
  const finishDrag = (clientX: number) => {
    const end = timeAt(clientX) ?? drag?.end;
    if (drag?.start !== undefined && end !== undefined && end !== drag.start) {
      const [from, to] = drag.start < end ? [drag.start, end] : [end, drag.start];
      // Mindestens 3 Kurspunkte im Ausschnitt
      if ((points ?? []).filter((p) => p.time >= from && p.time <= to).length >= 3) zoomTo(from, to);
    }
    setDrag(undefined);
  };

  const span = points && points.length > 1 ? points[points.length - 1].time - points[0].time : 0;
  const DAY = 86_400_000;
  // Bei kurzen Ausschnitten liegen Intraday-Kurse vor: Uhrzeit anzeigen
  const intraday = zoom ? span <= 45 * DAY && points!.length / Math.max(1, span / DAY) > 2 : range === "1d" || range === "1w";
  const first = points?.[0]?.close;
  const last = points?.[points.length - 1]?.close;
  const change = first && last ? last / first - 1 : undefined;
  const color = change === undefined || change >= 0 ? "var(--green)" : "var(--red)";
  const fmtTick = (t: number) =>
    new Date(t).toLocaleString(
      "de-DE",
      span <= 1.5 * DAY
        ? { hour: "2-digit", minute: "2-digit" }
        : span <= 10 * DAY
          ? { weekday: "short", day: "2-digit" }
          : span <= 250 * DAY
            ? { day: "2-digit", month: "short" }
            : { month: "short", year: "2-digit" },
    );
  const fmtFull = (t: unknown) =>
    typeof t === "number" ? new Date(t).toLocaleString("de-DE", intraday ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const money = (v: unknown) => (typeof v === "number" ? v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ` ${currency}` : "–");
  // Durchschnitte nur bei Tages- und Wochenkursen; intraday wären sie eine flache Linie
  const lines = emaLines?.symbol === symbol && !intraday ? EMAS.filter((e) => emaLines[e.key].length) : [];
  // Fairer Wert: Kurve nur bei Tages- und Wochenkursen, die Bewertung oben rechts immer
  const showFair = !!fair && fairOn && !intraday;
  const fairOf = fairFn;
  const rows = points?.map((p) => ({
    ...p,
    ...Object.fromEntries(lines.filter((e) => emaOn[e.key]).map((e) => [e.key, valueAt(emaLines![e.key], p.time)])),
    ...(showFair && fairOf ? { fair: fairOf(p.time) } : {}),
  }));
  const lastRow = rows?.[rows.length - 1] as Record<string, number | undefined> | undefined;
  const fairNow = fairOf && points?.length ? fairOf(points[points.length - 1].time) : undefined;
  const valuation = fairNow && last ? last / fairNow - 1 : undefined;
  // Achse: Kurs, Durchschnitte und fairer Wert; die Stufen nur, soweit sie den Verlauf nicht plattdrücken
  const closes = points?.map((p) => p.close) ?? [];
  const extra = (rows ?? []).flatMap((r) => [...lines.map((e) => e.key), "fair"].map((k) => (r as Record<string, number | undefined>)[k]).filter((v): v is number => v !== undefined));
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const inRange = (v: number) => v > lo * 0.5 && v < hi * 2;
  const yLo = Math.min(lo, ...extra.filter(inRange));
  const yHi = Math.max(hi, ...extra.filter(inRange));
  const fairOutside = showFair && extra.length > 0 && !extra.some(inRange);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 text-xs">
          {RANGE_LABELS.map(([r, label]) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRange(r);
                setZoom(undefined);
              }}
              className={`rounded-full border px-3 py-0.5 ${range === r && !zoom ? "border-accent text-accent" : "border-border text-muted"}`}
            >
              {label}
            </button>
          ))}
          {zoom && (
            <button type="button" onClick={() => setZoom(undefined)} className="rounded-full border border-accent bg-accent px-3 py-0.5 text-white">
              Zoom zurücksetzen
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {valuation !== undefined && (
            <span
              className={`tabular rounded-full px-2.5 py-0.5 text-xs font-medium ${valuation <= 0 ? "bg-light-green/15 text-light-green" : "bg-light-red/15 text-light-red"}`}
              title="Kurs im Vergleich zum fairen Wert nach Ø-KGV"
            >
              {(Math.abs(valuation) * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} % {valuation <= 0 ? "unterbewertet" : "überbewertet"}
            </span>
          )}
          {change !== undefined && (
            <span className="tabular text-sm font-medium" style={{ color }}>
              {change >= 0 ? "+" : ""}
              {(change * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
            </span>
          )}
        </div>
      </div>
      {(lines.length > 0 || (fair && !intraday)) && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {fair && !intraday && (
            <label className="flex cursor-pointer items-center gap-1.5 text-muted">
              <input type="checkbox" checked={fairOn} onChange={() => setFairOn(!fairOn)} className="accent-accent" />
              <span className="inline-block w-4 border-t-2 border-foreground" />
              Fair Value (Ø-KGV {nf(1)(fair.pe)})
              {fairOn && fairNow !== undefined && <span className="tabular"> {nf(2)(fairNow)}</span>}
            </label>
          )}
          {lines.map((e) => {
            const v = lastRow?.[e.key];
            return (
              <label key={e.key} className="flex cursor-pointer items-center gap-1.5 text-muted">
                <input type="checkbox" checked={emaOn[e.key]} onChange={() => setEmaOn({ ...emaOn, [e.key]: !emaOn[e.key] })} className="accent-accent" />
                <span className="inline-block w-4 border-t-2" style={{ borderColor: e.color }} />
                {e.label}
                {emaOn[e.key] && v !== undefined && last !== undefined && (
                  <span className="tabular">
                    {" "}
                    {nf(2)(v)} · Kurs {last >= v ? "+" : ""}
                    {((last / v - 1) * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
      {/* Aufziehen über eigene Mausereignisse: unabhängig von der Drosselung im Chart */}
      <div
        ref={boxRef}
        className="h-64 cursor-crosshair select-none"
        onMouseDown={(e) => setDrag({ start: timeAt(e.clientX) })}
        onMouseMove={(e) => drag && setDrag({ ...drag, end: timeAt(e.clientX) })}
        onMouseUp={(e) => finishDrag(e.clientX)}
        onMouseLeave={(e) => drag && finishDrag(e.clientX)}
      >
        {!points ? (
          <p className="pt-24 text-center text-sm text-muted">Lade Kursverlauf …</p>
        ) : points.length === 0 ? (
          <p className="pt-24 text-center text-sm text-muted">Für diesen Zeitraum liefert die Quelle keine Kurse.</p>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={rows}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtTick} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={40} />
              <YAxis
                domain={lines.length || showFair ? [yLo * 0.97, yHi * 1.03] : ["auto", "auto"]}
                allowDataOverflow
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                tickFormatter={nf(2)}
                width={52}
              />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtFull} formatter={(v, name) => [money(v), name === "close" ? "Kurs" : name === "fair" ? "Fair Value" : (EMAS.find((e) => e.key === name)?.short ?? name)]} />
              <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#priceFill)" dot={false} isAnimationActive={false} />
              {lines
                .filter((e) => emaOn[e.key])
                .map((e) => (
                  <Line key={e.key} type="monotone" dataKey={e.key} stroke={e.color} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                ))}
              {showFair &&
                FAIR_BANDS.map((b) => (
                  <Line
                    key={b}
                    type="monotone"
                    dataKey={(r: { fair?: number }) => (r.fair === undefined ? undefined : r.fair * b)}
                    stroke={b > 1 ? "var(--red)" : "var(--green)"}
                    strokeOpacity={0.25 + Math.abs(b - 1) * 2}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={false}
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                ))}
              {showFair && <Line type="monotone" dataKey="fair" stroke="var(--foreground)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />}
              {drag?.start !== undefined && drag.end !== undefined && <ReferenceArea x1={drag.start} x2={drag.end} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeOpacity={0.4} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Zum Vergrößern einen Bereich mit der Maus aufziehen. Quelle: Yahoo Finance{intraday ? ", intraday ggf. verzögert; gleitende Durchschnitte ab 6 Monaten" : ""}.
        {showFair && " Fair Value = Gewinn je Aktie (Ø 3 Jahre) × Ø-KGV der letzten 5 Jahre; gestrichelt: KGV 10/20/30 % höher (rot) bzw. niedriger (grün)."}
        {fairOutside && " Fair Value liegt außerhalb des dargestellten Kursbereichs."}
      </p>
    </div>
  );
}

type SeasonalData = {
  years: number[];
  path: { day: number; avg: number; current?: number }[];
  months: { month: number; avg: number; positive: number; count: number }[];
};
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const pct1 = (v: unknown) => (typeof v === "number" ? `${v >= 0 ? "+" : ""}${(v * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : "–");

export function SeasonalityChart({ symbol }: { symbol: string }) {
  const [span, setSpan] = useState<5 | 10>(10);
  const [view, setView] = useState<"path" | "months">("path");
  const [data, setData] = useState<{ symbol: string; year: number; 5: SeasonalData | null; 10: SeasonalData | null }>();

  useEffect(() => {
    let active = true;
    fetch(`/api/seasonality?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { 5: null, 10: null }))
      .catch(() => ({ 5: null, 10: null }))
      .then((d) => active && setData({ ...d, symbol }));
    return () => {
      active = false;
    };
  }, [symbol]);

  const loaded = data?.symbol === symbol ? data : undefined;
  const s = loaded?.[span];
  const pill = (on: boolean) => `rounded-full border px-3 py-0.5 ${on ? "border-accent text-accent" : "border-border text-muted"}`;
  const dayLabel = (d: unknown) => {
    if (typeof d !== "number") return "";
    const date = new Date(Date.UTC(2001, 0, d));
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short", timeZone: "UTC" });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-1">
          <button type="button" onClick={() => setView("path")} className={pill(view === "path")}>
            Jahresverlauf
          </button>
          <button type="button" onClick={() => setView("months")} className={pill(view === "months")}>
            Monate
          </button>
        </div>
        <div className="flex gap-1">
          {([5, 10] as const).map((n) => (
            <button key={n} type="button" onClick={() => setSpan(n)} className={pill(span === n)}>
              {n} Jahre
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <p className="py-24 text-center text-sm text-muted">Lade Saisonalität …</p>
      ) : !s ? (
        <p className="py-24 text-center text-sm text-muted">Für diesen Zeitraum liefert die Quelle nicht genug Kurshistorie.</p>
      ) : view === "path" ? (
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={s.path}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" type="number" domain={[1, 365]} ticks={MONTH_STARTS} tickFormatter={(d: number) => MONTHS[MONTH_STARTS.indexOf(d)]} tick={{ fontSize: 11, fill: "var(--muted)" }} />
              <YAxis tickFormatter={(v: number) => `${Math.round(v * 100)} %`} tick={{ fontSize: 12, fill: "var(--muted)" }} width={48} />
              <ReferenceLine y={0} stroke="var(--muted)" />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={dayLabel} formatter={(v, name) => [pct1(v), name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="avg" name={`Ø ${s.years[0]}–${s.years[s.years.length - 1]}`} stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="current" name={String(loaded.year)} stroke="var(--orange)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={s.months.map((m) => ({ ...m, label: MONTHS[m.month - 1] }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} interval={0} />
                <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)} %`} tick={{ fontSize: 12, fill: "var(--muted)" }} width={44} />
                <ReferenceLine y={0} stroke="var(--muted)" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--border)", opacity: 0.5 }}
                  formatter={(v, _n, item) => [`${pct1(v)} · positiv in ${item.payload.positive} von ${item.payload.count} Jahren`, "Ø Monatsrendite"]}
                />
                <Bar dataKey="avg" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {s.months.map((m) => (
                    <Cell key={m.month} fill={m.avg >= 0 ? "var(--green)" : "var(--red)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="tabular mt-1 grid grid-cols-12 pl-11 text-center text-[10px] text-muted sm:text-xs">
            {s.months.map((m) => (
              <span key={m.month} title={`positiv in ${m.positive} von ${m.count} Jahren`}>
                {m.positive}/{m.count}
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Darunter: in wie vielen Jahren der Monat positiv war.</p>
        </>
      )}
      <p className="mt-2 text-xs text-muted">
        Quelle: Yahoo Finance, dividendenbereinigte Tageskurse
        {s && s.years.length < span && `; nur ${s.years.length} volle Jahre verfügbar`}. Vergangene Muster wiederholen sich nicht zwingend.
      </p>
    </div>
  );
}
