import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
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
        <LoginForm />
      </section>
    </main>
  );
}
