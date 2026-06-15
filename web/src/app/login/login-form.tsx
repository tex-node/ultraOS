"use client";

import { useActionState } from "react";
import { signIn } from "next-auth/react";

type LoginState = {
  error?: string;
};

async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = await signIn("credentials", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirect: false,
  });

  if (result?.error) {
    return { error: "Invalid email or password." };
  }

  window.location.href = "/dashboard";
  return {};
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});

  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-zinc-300">
        Email
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label className="block text-sm font-medium text-zinc-300">
        Password
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
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
        {pending ? "Signing in..." : "Access system"}
      </button>
    </form>
  );
}
