"use client";

import { useActionState } from "react";
import { saveSettings } from "@/app/actions";
import type { Thresholds } from "@/lib/rating";

const p = (v: number) => String(Math.round(v * 1000) / 10).replace(".", ",");
const r = (v: number) => String(v).replace(".", ",");

export function SettingsForm({ t }: { t: Thresholds }) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  const rows: { key: string; label: string; unit: string; green: string; orange: string; hint: string }[] = [
    { key: "payoutEps", label: "Payout Ratio (EPS)", unit: "%", green: p(t.payoutEps.green), orange: p(t.payoutEps.orange), hint: "grün unter, rot über" },
    { key: "payoutFcf", label: "Payout Ratio (FCF)", unit: "%", green: p(t.payoutFcf.green), orange: p(t.payoutFcf.orange), hint: "grün unter, rot über" },
    { key: "debtToEquity", label: "Debt to Equity", unit: "", green: r(t.debtToEquity.green), orange: r(t.debtToEquity.orange), hint: "grün unter, rot über" },
    { key: "debtChangeYoY", label: "Neuverschuldung ggü. Vorjahr", unit: "%", green: p(t.debtChangeYoY.green), orange: p(t.debtChangeYoY.orange), hint: "grün bis, rot über" },
    { key: "dividendCagr5", label: "Dividenden-CAGR 5 J.", unit: "%", green: p(t.dividendCagr5.green), orange: p(t.dividendCagr5.orange), hint: "grün über, rot unter" },
  ];
  return (
    <form action={action} className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 font-medium">Kriterium</th>
            <th className="pb-2 font-medium">Grün-Grenze</th>
            <th className="pb-2 font-medium">Rot-Grenze</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-1.5 pr-3">
                {row.label}
                <span className="block text-xs text-muted">{row.hint}</span>
              </td>
              {(["green", "orange"] as const).map((k) => (
                <td key={k} className="py-1.5 pr-2">
                  <div className="flex items-center gap-1">
                    <input className="input w-20" name={`${row.key}.${k}`} defaultValue={row[k]} inputMode="decimal" />
                    <span className="text-muted">{row.unit}</span>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <label className="flex items-center gap-2 text-sm">
        Mindestanzahl Kriterien für eine Farbe
        <input className="input w-16" name="minCriteria" type="number" min={1} max={6} defaultValue={t.minCriteria} />
      </label>
      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}
      {state?.ok && <p className="text-sm text-light-green">{state.ok}</p>}
      <button className="btn" disabled={pending}>Speichern</button>
    </form>
  );
}
