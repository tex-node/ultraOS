"use client";

import Link from "next/link";

// One boundary for the whole app (nested route segments may define their own and take precedence).
// Missing-organization cases never reach here: constructing MissingOrganizationContextError
// redirects to /no-league instead (see lib/authorization.ts), because error classes do not survive
// serialization to client boundaries in production.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string; name?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400">Neon Ultra</p>
        <h1 className="mt-4 text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-zinc-400">
          The page could not be loaded. {error?.digest ? `Reference ${error.digest}.` : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/10 px-5 py-3 text-sm text-zinc-300 hover:border-white/25"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
