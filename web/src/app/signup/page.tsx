import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleAuthButton } from "@/app/components/google-auth-button";
import { hasPermission } from "@/lib/permissions";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
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
          Create your fan account
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Sign up to reserve seats, join fan clubs, vote for MVP, and follow
          Season Zero events.
        </p>
        <div className="mt-8">
          <GoogleAuthButton callbackUrl={callbackUrl} label="Sign up with Google" />
        </div>
        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span className="h-px flex-1 bg-white/10" />
          or
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <SignupForm callbackUrl={callbackUrl} />
        <p className="mt-6 text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link
            href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login"}
            className="font-medium text-emerald-400"
          >
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
