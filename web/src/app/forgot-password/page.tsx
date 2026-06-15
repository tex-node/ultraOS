import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "FAN" ? "/public/events" : "/dashboard");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#050807] px-6 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b100e] p-8 shadow-2xl shadow-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">
          Ultra Basketball
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Forgot password
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Enter your account email. For now, reset requests are routed to league
          operations until email delivery is configured.
        </p>
        <ForgotPasswordForm />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/login"
            className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/50"
          >
            Back to login
          </Link>
          <Link
            href="/signup"
            className="rounded-xl border border-emerald-400/30 px-4 py-3 text-center text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
          >
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
