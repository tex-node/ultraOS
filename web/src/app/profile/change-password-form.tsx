"use client";

import { useActionState } from "react";
import { changePassword, type PasswordFormState } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<PasswordFormState, FormData>(changePassword, {});

  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      {hasPassword ? (
        <label className={`${labelClass} sm:col-span-2`}>
          Current password
          <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
      ) : (
        <p className="sm:col-span-2 rounded-lg border border-white/10 px-4 py-3 text-xs text-zinc-400">
          This account signs in with Google and has no password yet — setting one lets you sign in with
          email and password too.
        </p>
      )}
      <label className={labelClass}>
        New password
        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        <span className="mt-1 block text-xs text-zinc-500">At least 8 characters.</span>
      </label>
      <label className={labelClass}>
        Confirm new password
        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </label>

      {state.error ? (
        <p role="alert" className="sm:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="sm:col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Password updated. Other devices stay signed in until their session expires.
        </p>
      ) : null}

      <button
        disabled={pending}
        className="sm:col-span-2 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
