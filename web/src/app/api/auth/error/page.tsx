import Link from "next/link";

// Auth.js redirects provider failures here (e.g. /api/auth/error?error=Configuration,
// an OAuth callback that failed). Without this page those failures surfaced as a bare
// 404 — the sign-in "not working" report. Always route the user back to /login with a
// clear message instead of a dead end.
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  Configuration: "Sign-in is temporarily misconfigured. Please try again, or use email and password.",
  AccessDenied: "Sign-in was denied for this account.",
  Verification: "The sign-in link has expired. Please request a new one.",
  OAuthSignin: "Could not start sign-in with the provider. Please try again.",
  OAuthCallback: "The provider returned an error while signing you in. Please try again.",
  OAuthCreateAccount: "Could not create your account from the provider profile.",
  EmailCreateAccount: "Could not create your account.",
  Callback: "Sign-in could not be completed. Please try again.",
  default: "Sign-in could not be completed. Please try again.",
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = REASONS[error ?? "default"] ?? REASONS.default;

  return (
    <main className="grid min-h-screen place-items-center bg-ink-900 px-6 py-12 text-text-1">
      <section className="w-full max-w-md rounded-lg border border-line bg-ink-800 p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-danger">Sign-in failed</p>
        <h1 className="mt-4 font-display text-3xl font-bold">We could not sign you in</h1>
        <p className="mt-3 text-sm leading-6 text-text-2">{message}</p>
        {error ? <p className="mt-2 font-mono text-xs text-text-3">{error}</p> : null}
        <div className="mt-6 grid gap-3">
          <Link
            href="/login"
            className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
          >
            Back to sign in
          </Link>
          <Link
            href="/public/events"
            className="rounded-md border border-line-strong px-4 py-3 text-sm font-semibold text-text-1 transition hover:border-brand-400/50"
          >
            Continue as a guest
          </Link>
        </div>
      </section>
    </main>
  );
}