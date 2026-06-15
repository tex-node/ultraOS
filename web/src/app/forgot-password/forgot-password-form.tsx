"use client";

import { useActionState } from "react";
import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "./actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<
    ForgotPasswordState,
    FormData
  >(requestPasswordReset, {});

  if (state.ok) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm leading-6 text-emerald-100">
        If an active account exists for that email, a reset request has been
        recorded. Contact league operations to complete the reset until email
        delivery is connected.
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-zinc-300">
        Account email
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        {state.fieldErrors?.email?.length ? (
          <p className="mt-1 text-xs text-rose-300">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </label>
      {state.error ? (
        <p className="text-sm text-rose-400" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Submitting..." : "Request password reset"}
      </button>
    </form>
  );
}
