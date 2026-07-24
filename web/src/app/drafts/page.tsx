import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { requireSession } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function Drafts() {
  const session = await requireSession();
  const canManageDraft = hasPermission(session.user.roles, "draft:manage");
  const drafts = await prisma.draft.findMany({
    include: {
      division: true,
      season: true,
      _count: { select: { picks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex justify-between">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-emerald-400">
              SeasonClub selections
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Drafts</h1>
          </div>
          {canManageDraft ? (
            <Link
              className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950"
              href="/drafts/new"
            >
              Create draft
            </Link>
          ) : null}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {drafts.map((draft) => (
            <Link
              className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"
              href={`/drafts/${draft.id}`}
              key={draft.id}
            >
              <div className="flex justify-between">
                <h2 className="font-semibold">{draft.name}</h2>
                <span className="text-xs text-emerald-400">{draft.status}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {draft.season.name} - {draft.division.name} - {draft.tier.replace("_", " ")}
              </p>
              <p className="mt-4 text-xs text-zinc-500">
                {draft._count.picks} picks - next #{draft.nextPickNumber}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </OperationsShell>
  );
}
