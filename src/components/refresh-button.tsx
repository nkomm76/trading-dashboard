"use client";

import { useState, useTransition } from "react";
import { runRefresh, type FormState } from "@/app/actions";

export function RefreshButton({ withOutlook = false }: { withOutlook?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>();
  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-secondary" disabled={pending} onClick={() => start(async () => setMsg(await runRefresh(withOutlook)))}>
        {pending ? "Aktualisiere …" : withOutlook ? "Alles inkl. KI-Ausblick aktualisieren" : "Jetzt aktualisieren"}
      </button>
      {msg?.ok && <span className="text-xs text-light-green">{msg.ok}</span>}
      {msg?.error && <span className="max-w-md text-right text-xs text-light-red">{msg.error}</span>}
    </div>
  );
}
