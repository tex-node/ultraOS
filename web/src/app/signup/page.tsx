import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
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
          Create your fan account
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Sign up to reserve seats, join fan clubs, vote for MVP, and follow
          Season Zero events.
        </p>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-emerald-400">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
