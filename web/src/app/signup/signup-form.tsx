"use client";

import { useActionState } from "react";
import { createFanAccount, type SignupState } from "./actions";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-rose-300">{errors[0]}</p>;
}

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(
    createFanAccount,
    {},
  );

  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-zinc-300">
        Full name
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          name="name"
          type="text"
          autoComplete="name"
          required
        />
        <FieldError errors={state.fieldErrors?.name} />
      </label>
      <label className="block text-sm font-medium text-zinc-300">
        Email
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <FieldError errors={state.fieldErrors?.email} />
      </label>
      <label className="block text-sm font-medium text-zinc-300">
        Password
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FieldError errors={state.fieldErrors?.password} />
      </label>
      <label className="block text-sm font-medium text-zinc-300">
        Confirm password
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FieldError errors={state.fieldErrors?.confirmPassword} />
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
        {pending ? "Creating account..." : "Create fan account"}
      </button>
    </form>
  );
}
