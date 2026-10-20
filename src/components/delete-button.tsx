"use client";

import { useActionState } from "react";
import { deletePurchase } from "@/app/actions";

export function DeleteButton({ id, label }: { id: number; label: string }) {
  const [state, action, pending] = useActionState(deletePurchase, undefined);
  return (
    <form
      action={action}
      className="inline"
      onSubmit={(e) => {
        if (!confirm(`${label} wirklich löschen?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-light-red" disabled={pending}>Löschen</button>
      {state?.error && <span className="ml-2 block max-w-xs whitespace-normal text-xs text-light-red">{state.error}</span>}
    </form>
  );
}
