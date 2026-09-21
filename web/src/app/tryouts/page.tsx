import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { DraftSelectionGroup } from "@/generated/prisma/enums";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

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
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/tryouts");
  }
  if (!hasPermission(session.user.roles, "draft:manage")) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold">Access required</h1>
          <p className="mt-3 text-sm text-text-2">
            Your account does not have draft management permission.
          </p>
        </main>
      </OperationsShell>
    );
  }
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  const counts = await withOrganizationContext(session.user.organizationId, (tx) => tx.player.groupBy({
    by: ["draftSelectionGroup"],
    _count: { _all: true },
  }));
  const countByGroup = new Map(counts.map((item) => [item.draftSelectionGroup, item._count._all]));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-brand-400">Player selection</p>
            <h1 className="mt-2 text-3xl font-semibold">Tryouts</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-2">
              Move approved player registrations into the main draft, secondary draft, pending,
              or not-selected pool before draft night.
            </p>
          </div>
          <Link
            className="rounded-md border border-line px-4 py-3 text-sm text-text-1 hover:border-emerald-400"
            href="/tryouts/export"
          >
            Export all CSV
          </Link>
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {groups.map((group) => (
            <Link
              className="rounded-lg border border-line bg-ink-800 p-5 transition hover:border-emerald-400/60"
              href={`/tryouts/${groupSlug(group)}`}
              key={group}
            >
              <p className="text-xs uppercase tracking-[.18em] text-text-3">{groupLabel(group)}</p>
              <p className="mt-4 text-4xl font-semibold text-white">{countByGroup.get(group) ?? 0}</p>
              <p className="mt-2 text-sm text-text-3">players</p>
            </Link>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}
