"use client";

import { useState, useTransition } from "react";
import { runRefresh, runWatchRefresh, type FormState } from "@/app/actions";

/** Aktualisieren-Knopf für das Depot (optional mit KI-Ausblick) oder für die Watchliste. */
export function RefreshButton({ withOutlook = false, target = "portfolio" }: { withOutlook?: boolean; target?: "portfolio" | "watchlist" }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>();
  const run = () => (target === "watchlist" ? runWatchRefresh() : runRefresh(withOutlook));
  const label = target === "watchlist" ? "Aktualisieren" : withOutlook ? "Alles inkl. KI-Ausblick aktualisieren" : "Jetzt aktualisieren";
  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-secondary" disabled={pending} onClick={() => start(async () => setMsg(await run()))}>
        {pending ? "Aktualisiere …" : label}
      </button>
      {msg?.ok && <span className="text-xs text-light-green">{msg.ok}</span>}
      {msg?.error && <span className="max-w-md text-right text-xs text-light-red">{msg.error}</span>}
    </div>
  );
}
