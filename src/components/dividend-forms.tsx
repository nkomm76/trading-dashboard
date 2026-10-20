"use client";

import { startTransition, useActionState, useRef } from "react";
import { saveDividend, type FormState } from "@/app/actions";
import type { SuggestionRow } from "@/lib/dividend-data";

const de = (v: number | undefined) => (v === undefined ? "" : v.toFixed(2).replace(".", ","));
const today = () => new Date().toISOString().slice(0, 10);

// Ohne action-Prop, damit Eingaben bei Fehlern erhalten bleiben
function useSubmit(action: (data: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
}

export function SuggestionForm({ s }: { s: SuggestionRow }) {
  const [state, action, pending] = useActionState(saveDividend, undefined);
  const onSubmit = useSubmit(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="stockId" value={s.stockId} />
      <input type="hidden" name="exDate" value={s.exDate} />
      <input type="hidden" name="quantity" value={s.quantity} />
      <input type="hidden" name="perShare" value={s.perShare} />
      <label className="text-xs">
        <span className="mb-0.5 block text-muted">Brutto €</span>
        <input className="input w-24 py-1" name="grossEur" inputMode="decimal" defaultValue={de(s.grossEurEstimate)} />
      </label>
      <label className="text-xs">
        <span className="mb-0.5 block text-muted">Netto € *</span>
        <input className="input w-24 py-1" name="netEur" inputMode="decimal" required />
      </label>
        <button className="btn py-1.5" disabled={pending}>
          {pending ? "…" : "Bestätigen"}
        </button>
      </div>
      {state?.error && <span className="text-xs text-light-red">{state.error}</span>}
    </form>
  );
}

export function ManualDividendForm({ stocks }: { stocks: { id: number; name: string; symbol: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await saveDividend(prev, data);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, undefined);
  const onSubmit = useSubmit(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3 text-sm">
      <select className="input" name="stockId" required defaultValue="">
        <option value="" disabled>
          Aktie wählen …
        </option>
        {stocks.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.symbol})
          </option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 block sm:col-span-1">
          <span className="mb-1 block text-xs text-muted">Datum</span>
          <input className="input" type="date" name="exDate" max={today()} defaultValue={today()} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Brutto €</span>
          <input className="input" name="grossEur" inputMode="decimal" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Netto € *</span>
          <input className="input" name="netEur" inputMode="decimal" required />
        </label>
      </div>
      <input className="input" name="note" placeholder="Notiz (optional)" maxLength={255} />
      {state?.error && <p className="text-xs text-light-red">{state.error}</p>}
      {state?.ok && <p className="text-xs text-light-green">{state.ok}</p>}
      <button className="btn" disabled={pending}>
        Speichern
      </button>
    </form>
  );
}
