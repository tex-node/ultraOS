import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { DraftSelectionGroup } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const groups = [
  DraftSelectionGroup.PENDING_SELECTION,
  DraftSelectionGroup.MAIN_DRAFT,
  DraftSelectionGroup.SECONDARY_DRAFT,
  DraftSelectionGroup.NOT_SELECTED,
];

function groupSlug(group: DraftSelectionGroup) {
  return group.toLowerCase().replaceAll("_", "-");
}

function groupLabel(group: DraftSelectionGroup) {
  return group.split("_").join(" ");
}

export default async function TryoutsPage() {
  const session = await requirePermission("draft:manage");
  const counts = await prisma.player.groupBy({
    by: ["draftSelectionGroup"],
    _count: { _all: true },
  });
  const countByGroup = new Map(counts.map((item) => [item.draftSelectionGroup, item._count._all]));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-emerald-400">Player selection</p>
            <h1 className="mt-2 text-3xl font-semibold">Tryouts</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Move approved player registrations into the main draft, secondary draft, pending,
              or not-selected pool before draft night.
            </p>
          </div>
          <Link
            className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-200 hover:border-emerald-400"
            href="/tryouts/export"
          >
            Export all CSV
          </Link>
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {groups.map((group) => (
            <Link
              className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 transition hover:border-emerald-400/60"
              href={`/tryouts/${groupSlug(group)}`}
              key={group}
            >
              <p className="text-xs uppercase tracking-[.18em] text-zinc-500">{groupLabel(group)}</p>
              <p className="mt-4 text-4xl font-semibold text-white">{countByGroup.get(group) ?? 0}</p>
              <p className="mt-2 text-sm text-zinc-500">players</p>
            </Link>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}
