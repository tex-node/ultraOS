import Link from "next/link";

// Shown when a signed-in account belongs to no organization. This is a normal state - a brand-new
// user, or one whose access was revoked - never a bug, so it gets an explanation instead of an
// error page. Reached via redirect from MissingOrganizationContextError (see lib/authorization.ts),
// which every org-gated page throws; one route covers all of them. Deliberately standalone (no
// OperationsShell, no data fetching) so it cannot fail for the same reason.
export const dynamic = "force-dynamic";

export default function NoLeaguePage() {
  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400">Neon Ultra</p>
        <h1 className="mt-4 text-3xl font-semibold">No league yet</h1>
        <p className="mt-3 text-sm text-text-2">
          This account is not part of any league, so there is nothing to show here. Ask an
          administrator to grant you a role or game control, then come back.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/profile"
            className="rounded-lg bg-brand-400 px-5 py-3 text-sm font-semibold text-ink-900"
          >
            View your profile
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-line px-5 py-3 text-sm text-text-1 hover:border-white/25"
          >
            Sign in as someone else
          </Link>
        </div>
      </main>
    </div>
  );
}
