"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <input className="input" type="password" name="password" placeholder="Passwort" autoComplete="current-password" required autoFocus />
      {state?.error && <p className="text-sm text-light-red">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Prüfe …" : "Anmelden"}
      </button>
    </form>
  );
}
