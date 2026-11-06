"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm({ withCode }: { withCode: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <input className="input" type="password" name="password" placeholder="Passwort" autoComplete="current-password" required autoFocus />
      {withCode && (
        <input
          className="input tabular"
          name="code"
          placeholder="Code aus der Authenticator-App"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
        />
      )}
      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Prüfe …" : "Anmelden"}
      </button>
    </form>
  );
}
