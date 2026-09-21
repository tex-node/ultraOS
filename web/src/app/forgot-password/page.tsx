import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) {
    redirect(
      hasPermission(session.user.roles, "fixture:manage") ||
        hasPermission(session.user.roles, "event:manage")
        ? "/dashboard"
        : "/public/events",
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ink-900 px-6 py-12 text-white">
      <section className="w-full max-w-md rounded-lg border border-line bg-ink-800 p-8 shadow-none shadow-none">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-400">
          Neon Ultra
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Forgot password
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-2">
          Enter your account email. For now, reset requests are routed to league
          operations until email delivery is configured.
        </p>
        <ForgotPasswordForm />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/login"
            className="rounded-md border border-line px-4 py-3 text-center text-sm font-semibold text-text-1 transition hover:border-emerald-400/50"
          >
            Back to login
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-brand-400/30 px-4 py-3 text-center text-sm font-semibold text-brand-300 transition hover:bg-brand-400/10"
          >
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
