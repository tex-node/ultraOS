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
    <main className="grid min-h-screen place-items-center bg-[#050807] px-6 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b100e] p-8 shadow-2xl shadow-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">
          Ultra Basketball
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          League operating system
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Sign in with an authorized Season Zero operations account.
        </p>
        <div className="mt-8">
          <GoogleAuthButton callbackUrl={callbackUrl} label="Sign in with Google" />
        </div>
        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span className="h-px flex-1 bg-white/10" />
          or
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <LoginForm callbackUrl={callbackUrl} />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href={callbackUrl ? `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/signup"}
            className="rounded-xl border border-emerald-400/30 px-4 py-3 text-center text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
          >
            Sign up
          </Link>
          <Link
            href="/forgot-password"
            className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/50"
          >
            Forgot password
          </Link>
        </div>
      </section>
    </main>
  );
}
