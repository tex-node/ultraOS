"use client";

import { useActionState } from "react";
import { emailTicketQr } from "../actions";

type State = { ok: true } | { ok: false; error: string } | null;

// "Email my QR" form for the ticket wallet page. The server action only ever sends to the
// booking address and reports not-configured gracefully, so this form is safe to show always.
export function EmailTicketForm({ code, emailConfigured }: { code: string; emailConfigured: boolean }) {
  const [state, submit, pending] = useActionState<State, FormData>(
    async () => emailTicketQr(code),
    null,
  );
  return (
    <div className="mt-4 border-t border-zinc-200 pt-4 text-center">
      {state?.ok ? (
        <p className="text-sm font-semibold text-emerald-700">Ticket emailed — check your inbox.</p>
      ) : (
        <form action={submit}>
          <button
            disabled={pending}
            className="w-full rounded-xl border border-zinc-300 p-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-500 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Email my QR code"}
          </button>
        </form>
      )}
      {state && !state.ok ? <p className="mt-2 text-xs text-zinc-500">{state.error}</p> : null}
      {!state && !emailConfigured ? (
        <p className="mt-2 text-xs text-zinc-500">Email delivery is off for this event — this QR scans at the gate.</p>
      ) : null}
    </div>
  );
}
