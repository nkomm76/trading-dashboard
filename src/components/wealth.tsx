"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { saveCash } from "@/app/actions";
import { CLASS_COLOR, CLASS_LABEL, groupSlices, type Bucket, type HistoryPoint } from "@/lib/wealth";

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };
const euro0 = (v: unknown) => (typeof v === "number" ? v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "–");
const pct = (v: number) => v.toLocaleString("de-DE", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 });

// Für Positionen, Sektoren und Währungen; keine Ampelfarben, damit nichts nach Bewertung aussieht
const PALETTE = ["#1f5fbf", "#0f8a8a", "#7c4dcc", "#b0568f", "#3d7f9e", "#8a6d2f", "#4f6bd1", "#2e8f6f", "#9a4fb5", "#6b7a8f"];

export type AllocRow = { id: string; name: string; bucket: Bucket; sector?: string; currency: string; value: number };

type Mode = "class" | "position" | "sector" | "currency";
const MODES: [Mode, string][] = [
  ["class", "Klasse"],
  ["position", "Position"],
  ["sector", "Sektor"],
  ["currency", "Währung"],
];

function keyOf(r: AllocRow, mode: Mode): { key: string; label: string } {
  if (mode === "class") return { key: r.bucket, label: CLASS_LABEL[r.bucket] };
  if (mode === "position") return { key: r.id, label: r.name };
  if (r.bucket === "CASH") return { key: "CASH", label: "Barbestand" };
  if (mode === "sector") {
    if (r.bucket !== "STOCK") return { key: r.bucket, label: CLASS_LABEL[r.bucket] };
    return { key: `s:${r.sector ?? "?"}`, label: r.sector ?? "Ohne Angabe" };
  }
  if (r.bucket === "CRYPTO") return { key: "CRYPTO", label: "Krypto" };
  return { key: `c:${r.currency}`, label: r.currency === "GBp" ? "GBP" : r.currency };
}

export function AllocationCard({ rows }: { rows: AllocRow[] }) {
  const [mode, setMode] = useState<Mode>("class");
  const data = useMemo(() => {
    const bucketOf = new Map(rows.map((r) => [keyOf(r, mode).key, r.bucket]));
    let n = 0;
    return groupSlices(rows.map((r) => ({ ...keyOf(r, mode), value: r.value }))).map((s) => {
      const bucket = bucketOf.get(s.key)!;
      const color = mode === "class" || s.key === "CASH" || ((mode === "sector" || mode === "currency") && (s.key === "ETF" || s.key === "CRYPTO")) ? CLASS_COLOR[bucket] : PALETTE[n++ % PALETTE.length];
      return { ...s, color };
    });
  }, [rows, mode]);

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Aufteilung</h2>
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {MODES.map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded px-2.5 py-1 ${mode === m ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Werte. Erfasse einen Kauf oder trage deinen Kontostand ein.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-44 w-44 shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="100%" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [euro0(v), name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-1.5 text-sm">
            {data.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                <span className="tabular text-muted">{euro0(d.value)}</span>
                <span className="tabular w-14 text-right">{pct(d.share)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mode === "currency" && <p className="mt-3 text-xs text-muted">Handelswährung der Notierung; bei ETFs nicht die Währungen der enthaltenen Aktien.</p>}
    </section>
  );
}

type HistoryRange = "6m" | "1y" | "all";

export function WealthHistory() {
  const [data, setData] = useState<{ points: HistoryPoint[]; cashSince?: string; missing: string[] } | null>(null);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<HistoryRange>("all");

  useEffect(() => {
    let alive = true;
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const points = useMemo(() => {
    if (!data) return [];
    // Zeitraum vom letzten Punkt (heute) aus rückwärts
    const last = data.points.at(-1);
    const days = range === "6m" ? 183 : 365;
    const from = last ? new Date(Date.parse(last.date) - days * 86_400_000).toISOString().slice(0, 10) : "";
    return data.points.filter((p) => range === "all" || p.date >= from).map((p) => ({ ...p, time: Date.parse(p.date) }));
  }, [data, range]);

  const fmtDay = (t: number) => new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Vermögensverlauf</h2>
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {(
            [
              ["6m", "6 Monate"],
              ["1y", "1 Jahr"],
              ["all", "Alles"],
            ] as const
          ).map(([r, label]) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded px-2.5 py-1 ${range === r ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="text-sm text-light-red">Der Verlauf konnte nicht geladen werden.</p>
      ) : !data ? (
        <p className="text-sm text-muted">Lade Kurse …</p>
      ) : points.length < 2 ? (
        <p className="text-sm text-muted">Der Verlauf erscheint, sobald es Buchungen über mehr als einen Tag gibt.</p>
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={euro0} width={72} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtDay(Number(t))} formatter={(v, name) => [euro0(v), name]} />
                <Line dataKey="total" name="Gesamtvermögen" stroke="var(--cls-stock)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="securities" name="Wertpapiere" stroke="var(--cls-etf)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="cost" name="Einstand" stroke="var(--cls-cash)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span><span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: "var(--cls-stock)" }} />Gesamtvermögen</span>
            <span><span className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: "var(--cls-etf)" }} />Wertpapiere</span>
            <span><span className="mr-1 inline-block h-0.5 w-4 border-t border-dashed align-middle" style={{ borderColor: "var(--cls-cash)" }} />Einstand (bezahlte Kaufkurse inkl. Gebühren)</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {data.cashSince
              ? `Barbestand ab dem ersten eingetragenen Kontostand (${new Date(data.cashSince).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}); dazwischen gilt jeweils der letzte Stand.`
              : "Noch kein Kontostand eingetragen: Gesamtvermögen zeigt nur die Wertpapiere."}
            {data.missing.length > 0 && ` Ohne Kursverlauf (zum Einstand bewertet): ${data.missing.join(", ")}.`}
          </p>
        </>
      )}
    </section>
  );
}

export function CashForm({ current }: { current?: { amount: number; date: string } }) {
  const [state, action, pending] = useActionState(saveCash, undefined);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-32 flex-1">
          <span className="mb-1 block text-xs text-muted">Kontostand (€)</span>
          <input className="input" name="amount" inputMode="decimal" placeholder="z. B. 7.200,00" defaultValue={current ? String(current.amount).replace(".", ",") : ""} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Stand vom</span>
          <input className="input" type="date" name="date" defaultValue={today} max={today} required />
        </label>
        <button className="btn" disabled={pending}>{pending ? "Speichere …" : "Speichern"}</button>
      </div>
      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}
      {state?.ok && <p className="text-sm text-light-green">{state.ok}</p>}
    </form>
  );
}
