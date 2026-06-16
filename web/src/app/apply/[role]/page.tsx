import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ApplicationForm } from "@/app/apply/application-form";
import { applicationConfigs, applySlugToType } from "@/app/apply/application-config";

type ApplyRolePageProps = {
  params: Promise<{ role: string }>;
};

export default async function ApplyRolePage({ params }: ApplyRolePageProps) {
  const { role } = await params;
  const type = applySlugToType[role];
  if (!type) {
    notFound();
  }

  const config = applicationConfigs[type];
  const session = await auth();
  const callbackUrl = `/apply/${role}`;

  return (
    <main className="min-h-screen bg-[#050807] px-6 py-12 text-white">
      <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Link className="text-sm text-emerald-400 hover:text-emerald-300" href="/apply">
            Back to applications
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
            {config.type} intake
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{config.title}</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-400">{config.description}</p>
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Review rule</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{config.reviewNote}</p>
          </div>
        </div>
        {session?.user ? (
          <ApplicationForm config={config} />
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
              Account required
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Create or sign in to continue</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Applications must attach to one login identity. This prevents duplicate
              accounts and lets a fan apply for another role from the same account.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                className="rounded-xl bg-emerald-400 px-4 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
                href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Create fan account
              </Link>
              <Link
                className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/50"
                href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
