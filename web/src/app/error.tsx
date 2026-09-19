"use client";

import Link from "next/link";

// Server-thrown errors reach a client boundary with only their message (and digest) - custom
// classes do not survive serialization in production. So match the missing-organization error by
// its message text as well as its class name; the name check still works in development.
function isMissingOrganizationError(error: { name?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.name === "MissingOrganizationContextError") return true;
  return (error.message ?? "").includes("no resolved organization context");
}
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string; name?: string };
  reset: () => void;
}) {
  if (isMissingOrganizationError(error)) {
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
