"use client";

import { signIn } from "next-auth/react";

export function GoogleAuthButton({
  callbackUrl,
  label = "Continue with Google",
}: {
  callbackUrl?: string;
  label?: string;
}) {
  return (
    <button
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:border-emerald-400/50 hover:bg-white/[0.07]"
      onClick={() => signIn("google", { callbackUrl: callbackUrl || "/public/events" })}
      type="button"
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-black text-zinc-950">
        G
      </span>
      {label}
    </button>
  );
}
