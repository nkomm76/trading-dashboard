"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { savePurchase, type FormState } from "@/app/actions";
import type { SearchHit } from "@/lib/data/yahoo";

type Initial = {
  id: number;
  type: "BUY" | "SELL";
  symbol: string;
  name: string;
  currency: string;
  date: string;
  price: number;
  quantity: number;
  fees: number;
  note: string;
};

export type Holding = { symbol: string; name: string; currency: string; quantity: number };

const today = () => new Date().toISOString().slice(0, 10);
const de = (v: number) => String(v).replace(".", ",");
const fmtQty = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 3 });

export function PurchaseForm({
  initial,
  holdings,
  preselectSell,
  preselectBuy,
}: {
  initial?: Initial;
  holdings: Holding[];
  preselectSell?: string;
  preselectBuy?: { symbol: string; name: string };
}) {
  const [type, setType] = useState<"BUY" | "SELL">(initial?.type ?? (preselectSell ? "SELL" : "BUY"));
  const start = initial ?? preselectBuy;
  const [query, setQuery] = useState(start ? `${start.name} (${start.symbol})` : "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<{ symbol: string; name: string } | undefined>(start && { symbol: start.symbol, name: start.name });
  const [sellSymbol, setSellSymbol] = useState(initial?.type === "SELL" ? initial.symbol : (preselectSell ?? ""));
  const [isin, setIsin] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (type !== "BUY" || picked || query.trim().length < 2) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      setHits(res.ok ? await res.json() : []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, picked, type]);

  // Nach erfolgreichem Speichern einer neuen Buchung das Formular leeren
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await savePurchase(prev, formData);
    if (result?.ok && !initial) {
      formRef.current?.reset();
      setPicked(undefined);
      setQuery("");
      setIsin("");
      setSellSymbol("");
    }
    return result;
  }, undefined);

  const symbol = type === "SELL" ? sellSymbol : (picked?.symbol ?? "");
  const holding = holdings.find((h) => h.symbol === sellSymbol);
  // Beim Bearbeiten eines Verkaufs zählt dessen Stückzahl zum verfügbaren Bestand
  const available = (holding?.quantity ?? 0) + (initial?.type === "SELL" && initial.symbol === sellSymbol ? initial.quantity : 0);

  return (
    <form
      ref={formRef}
      className="space-y-4"
      // Bewusst kein action-Prop: React würde das Formular sonst auch bei Fehlern leeren
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="symbol" value={symbol} />
      <input type="hidden" name="isin" value={isin} />

      {!initial && (
        <div className="grid grid-cols-2 rounded-md border border-border p-1 text-sm">
          {(["BUY", "SELL"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded px-3 py-1.5 ${type === t ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
            >
              {t === "BUY" ? "Kauf" : "Verkauf"}
            </button>
          ))}
        </div>
      )}

      {type === "BUY" ? (
        <label className="block">
          <span className="mb-1 block text-sm">Aktie (Name, ISIN oder Ticker)</span>
          <input
            className="input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(undefined);
              setHits([]);
            }}
            placeholder="z. B. Allianz, DE0008404005 oder JNJ"
            autoComplete="off"
            disabled={Boolean(initial)}
          />
          {!picked && hits.length > 0 && (
            <ul className="mt-1 max-h-64 overflow-auto rounded-md border border-border bg-surface text-sm shadow-sm">
              {hits.map((h) => (
                <li key={h.symbol}>
                  <button
                    type="button"
                    className="flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-background"
                    onClick={() => {
                      setPicked(h);
                      setQuery(`${h.name} (${h.symbol})`);
                      if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(query.trim().toUpperCase())) setIsin(query.trim().toUpperCase());
                      setHits([]);
                    }}
                  >
                    <span>{h.name}</span>
                    <span className="whitespace-nowrap text-xs text-muted">
                      {h.symbol} · {h.exchange}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!initial && <span className="mt-1 block text-xs text-muted">Wähle den Börsenplatz, an dem du gekauft hast (z. B. Xetra = „.DE“).</span>}
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm">Aktie aus deinem Depot</span>
          {holdings.length === 0 && !initial ? (
            <p className="text-sm text-muted">Du hast aktuell keine Aktien im Bestand.</p>
          ) : (
            <select className="input" value={sellSymbol} onChange={(e) => setSellSymbol(e.target.value)} disabled={Boolean(initial)}>
              <option value="">Bitte wählen …</option>
              {initial?.type === "SELL" && !holding && <option value={initial.symbol}>{initial.name}</option>}
              {holdings.map((h) => (
                <option key={h.symbol} value={h.symbol}>
                  {h.name} ({h.symbol}) – {fmtQty(h.quantity)} Stück
                </option>
              ))}
            </select>
          )}
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm">{type === "SELL" ? "Verkaufsdatum" : "Kaufdatum"}</span>
          <input className="input" type="date" name="date" defaultValue={initial?.date ?? today()} max={today()} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Stückzahl</span>
          <input className="input" name="quantity" inputMode="decimal" defaultValue={initial ? de(initial.quantity) : ""} key={`qty-${type}-${sellSymbol}`} required />
          {type === "SELL" && sellSymbol && (
            <span className="mt-1 block text-xs text-muted">Bestand: {fmtQty(available)} Stück</span>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">{type === "SELL" ? "Verkaufskurs je Aktie (€)" : "Kaufkurs je Aktie (€)"}</span>
          <input className="input" name="price" inputMode="decimal" defaultValue={initial ? de(initial.price) : ""} required />
          <span className="mt-1 block text-xs text-muted">in Euro laut Abrechnung, ohne Gebühren</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Gebühren (€)</span>
          <input className="input" name="fees" inputMode="decimal" defaultValue={initial ? de(initial.fees) : "0"} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm">Notiz (optional)</span>
        <input className="input" name="note" defaultValue={initial?.note} maxLength={255} />
      </label>

      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}
      {state?.ok && <p className="text-sm text-light-green">{state.ok}</p>}

      <div className="flex gap-2">
        <button className="btn" disabled={pending || !symbol}>
          {pending ? "Speichere …" : initial ? "Änderung speichern" : type === "SELL" ? "Verkauf speichern" : "Kauf speichern"}
        </button>
        {initial && (
          <a href="/kauf" className="btn-secondary">
            Abbrechen
          </a>
        )}
      </div>
    </form>
  );
}
