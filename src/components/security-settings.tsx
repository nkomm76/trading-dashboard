"use client";

import { useActionState, useState, useTransition } from "react";
import { confirmTotpSetup, disableTotpAction, logoutEverywhere, startTotpSetup, type TotpSetupState } from "@/app/actions";

const CodeInput = () => (
  <input className="input tabular w-40" name="code" placeholder="6-stelliger Code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
);

function Setup() {
  const [setup, setSetup] = useState<TotpSetupState>();
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState(confirmTotpSetup, undefined);
  const shown = state?.qr ? state : setup;

  if (state?.ok) return <p className="text-sm text-light-green">{state.ok}</p>;
  if (!shown?.qr)
    return (
      <div className="space-y-2">
        {shown?.error && <p className="text-sm text-light-red">{shown.error}</p>}
        <button className="btn" disabled={starting} onClick={() => startTransition(async () => setSetup(await startTotpSetup()))}>
          {starting ? "Erzeuge …" : "Zweiten Faktor einrichten"}
        </button>
      </div>
    );
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm">1. QR-Code mit einer Authenticator-App scannen (z. B. Apple Passwörter, Google Authenticator, 2FAS).</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL, keine Bildoptimierung nötig */}
      <img src={shown.qr} alt="QR-Code für die Authenticator-App" width={220} height={220} className="rounded bg-white p-1" />
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Schlüssel zum Abtippen</summary>
        <code className="mt-1 block break-all font-mono">{shown.secret?.match(/.{1,4}/g)?.join(" ")}</code>
      </details>
      <p className="text-sm">2. Den angezeigten Code eingeben:</p>
      <div className="flex flex-wrap items-center gap-2">
        <CodeInput />
        <button className="btn" disabled={pending}>Bestätigen</button>
      </div>
      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}
    </form>
  );
}

function Disable() {
  const [state, action, pending] = useActionState(disableTotpAction, undefined);
  if (state?.ok) return <p className="text-sm text-light-green">{state.ok}</p>;
  return (
    <details>
      <summary className="cursor-pointer text-sm text-muted">Zweiten Faktor ausschalten</summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <CodeInput />
        <button className="btn btn-secondary" disabled={pending}>Ausschalten</button>
        {state?.error && <p className="w-full text-sm text-light-red">{state.error}</p>}
      </form>
    </details>
  );
}

export function SecuritySettings({ totpActive }: { totpActive: boolean }) {
  const [leaving, startLeave] = useTransition();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm">
          Zweiter Faktor:{" "}
          <span className={totpActive ? "text-light-green" : "text-light-orange"}>{totpActive ? "aktiv" : "nicht eingerichtet"}</span>
        </p>
        {totpActive ? <Disable /> : <Setup />}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm text-muted">Meldet alle Geräte ab, auch dieses. Sinnvoll nach Verlust eines Geräts oder an einem fremden Rechner.</p>
        <button
          className="btn btn-secondary"
          disabled={leaving}
          onClick={() => {
            if (confirm("Wirklich auf allen Geräten abmelden?")) startLeave(() => logoutEverywhere());
          }}
        >
          Überall abmelden
        </button>
      </div>
    </div>
  );
}
