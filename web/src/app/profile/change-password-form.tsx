"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { changePassword, type PasswordFormState } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

export function ChangePasswordForm({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  // The new password is captured synchronously when the form is submitted: reading it from the DOM
  // after the action resolves races with re-renders that may already have cleared the inputs.
  const submittedPasswordRef = useRef<string | null>(null);
  const submitWithCapture = async (previous: PasswordFormState, formData: FormData) => {
    submittedPasswordRef.current = String(formData.get("newPassword") ?? "");
    return changePassword(previous, formData);
  };
  const [state, action, pending] = useActionState<PasswordFormState, FormData>(submitWithCapture, {});
  const [reauthNote, setReauthNote] = useState<string | null>(null);
  const router = useRouter();

  // The password change signs out every other device - and this one too, since its token carries
  // the old version. Re-authenticate here with the captured value so you stay signed in. The page
  // is refreshed only once the new session exists; on any failure it stays put with a plain
  // "sign in again" note instead of bouncing to /login.
  useEffect(() => {
    if (!state.ok) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await signIn("credentials", {
          email,
          password: submittedPasswordRef.current ?? "",
          redirect: false,
        });
        if (cancelled) return;
        if (!result?.error) {
          router.refresh();
          return;
        }
      } catch {
        if (cancelled) return;
      }
      setReauthNote("Password updated. Please sign in again to continue.");
    })();
    return () => {
      cancelled = true;
    };
  }, [state.ok, email, router]);

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
          Password updated. Every other device is signed out.
        </p>
      ) : null}
      {reauthNote ? (
        <p role="alert" className="sm:col-span-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {reauthNote}
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
