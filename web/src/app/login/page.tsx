import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { GoogleAuthButton } from "@/app/components/google-auth-button";
import { hasPermission } from "@/lib/permissions";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(
      callbackUrl ||
        (hasPermission(session.user.roles, "fixture:manage") ||
        hasPermission(session.user.roles, "event:manage")
          ? "/dashboard"
          : "/public/events"),
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ink-900 px-6 py-12 text-text-1">
      <section className="w-full max-w-md rounded-lg border border-line bg-ink-800 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-400">
          Neon Ultra
        </p>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
          Tournament management system
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-2">
          Sign in with an authorized Season Zero operations account.
        </p>
        <div className="mt-8">
          <GoogleAuthButton callbackUrl={callbackUrl} label="Sign in with Google" />
        </div>
        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-text-3">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <LoginForm callbackUrl={callbackUrl} />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href={callbackUrl ? `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/signup"}
            className="rounded-md border border-brand-400/30 px-4 py-3 text-center text-sm font-semibold text-brand-300 transition hover:bg-brand-400/10"
          >
            Sign up
          </Link>
          <Link
            href="/forgot-password"
            className="rounded-md border border-line-strong px-4 py-3 text-center text-sm font-semibold text-text-1 transition hover:border-brand-400/50"
          >
            Forgot password
          </Link>
        </div>
      </section>
    </main>
  );
}
