"use client";

export default function SecondaryDraftError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-6">
        <p className="text-xs uppercase tracking-[.2em] text-rose-300">Secondary Draft error</p>
        <h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-zinc-300">{error.message || "An unexpected error occurred."}</p>
        {error.digest ? <p className="mt-2 text-xs text-zinc-500">Error digest: {error.digest}</p> : null}
        <p className="mt-4 text-sm text-zinc-400">No pick or roster change was made. It is safe to go back and try again.</p>
        <button className="mt-6 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
