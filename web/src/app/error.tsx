"use client";

import Link from "next/link";

// One boundary for the whole app (nested route segments may define their own and take precedence).
// A missing organization is not a bug: it happens to any signed-in account that belongs to no
// league - for example a brand-new user, or one whose grant was revoked. It used to render as a
// generic 500 ("Something went wrong"); now it explains itself.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string; name?: string };
  reset: () => void;
}) {
  if (error?.name === "MissingOrganizationContextError") {
    return (
      <div className="min-h-screen bg-[#050807] text-white">
        <main className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400">Neon Ultra</p>
          <h1 className="mt-4 text-3xl font-semibold">No league yet</h1>
          <p className="mt-3 text-sm text-zinc-400">
            This account is not part of any league, so there is nothing to show here. Ask an
            administrator to grant you a role or game control, then come back.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/profile"
              className="rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950"
            >
              View your profile
            </Link>
            <button
              onClick={reset}
              className="rounded-lg border border-white/10 px-5 py-3 text-sm text-zinc-300 hover:border-white/25"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400">Neon Ultra</p>
        <h1 className="mt-4 text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-zinc-400">
          The page could not be loaded. {error?.digest ? `Reference ${error.digest}.` : ""}
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950"
        >
          Try again
        </button>
      </main>
    </div>
  );
}
