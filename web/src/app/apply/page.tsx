import Link from "next/link";
import { applicationCards, applicationConfigs } from "@/app/apply/application-config";

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-[#050807] px-6 py-12 text-white">
      <section className="mx-auto max-w-6xl">
        <Link className="text-sm text-emerald-400 hover:text-emerald-300" href="/public">
          Back to public site
        </Link>
        <div className="mt-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
            Participant applications
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Apply to join Ultra operations</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Use Signup to create an account. Players, coaches, scouts, officials,
            vendors, media, and volunteers submit role-specific applications for
            review. Sensitive roles are never assigned automatically.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {applicationCards.map((card) => {
            const config = applicationConfigs[card.type];
            return (
              <Link
                className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.04]"
                href={card.href}
                key={card.type}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  {card.type}
                </p>
                <h2 className="mt-3 text-xl font-semibold">{card.label}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {config.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
