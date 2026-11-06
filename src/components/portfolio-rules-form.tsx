"use client";

import { useActionState } from "react";
import { savePortfolioRules } from "@/app/actions";
import { BUCKETS, CLASS_LABEL } from "@/lib/wealth";
import type { PortfolioSettings } from "@/lib/settings";

const p = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 1000) / 10).replace(".", ","));

export function PortfolioRulesForm({ s, defaultMax }: { s: PortfolioSettings; defaultMax: number }) {
  const [state, action, pending] = useActionState(savePortfolioRules, undefined);
  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Zielaufteilung</legend>
        <p className="text-xs text-muted">Zusammen 100 %. Alle Felder leer lassen, um keine Ziele zu verwenden.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BUCKETS.map((b) => (
            <label key={b} className="block text-sm">
              <span className="mb-1 block text-xs text-muted">{CLASS_LABEL[b]}</span>
              <span className="flex items-center gap-1">
                <input className="input" name={`target.${b}`} defaultValue={p(s.targets[b])} inputMode="decimal" />
                <span className="text-muted">%</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="sm:w-72">Klumpen-Hinweis ab Anteil einer Position am Gesamtvermögen</span>
        <span className="flex items-center gap-1">
          <input className="input w-20" name="maxPositionShare" defaultValue={p(s.maxPositionShare)} placeholder={p(defaultMax)} inputMode="decimal" />
          <span className="text-muted">%</span>
        </span>
      </label>
      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}
      {state?.ok && <p className="text-sm text-light-green">{state.ok}</p>}
      <button className="btn" disabled={pending}>Speichern</button>
    </form>
  );
}
