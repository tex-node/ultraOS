import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { DraftSelectionGroup } from "@/generated/prisma/enums";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";
import { bulkUpdateTryoutGroup, updatePlayerTryout } from "../actions";

const groups = Object.values(DraftSelectionGroup);

function groupSlug(group: DraftSelectionGroup) {
  return group.toLowerCase().replaceAll("_", "-");
}

function groupLabel(group: DraftSelectionGroup) {
  return group.split("_").join(" ");
}

function groupFromSlug(slug: string) {
  return groups.find((group) => groupSlug(group) === slug) ?? null;
}

type TryoutPlayer = {
  id: string;
  draftSelectionGroup: DraftSelectionGroup;
  position: string;
  selectionNotes: string | null;
  status: string;
  tryoutNumber: string | null;
  tryoutScore: { toString(): string } | null;
  athlete: { firstName: string; lastName: string };
  season: { name: string };
  seasonClub: { club: { name: string }; division: { name: string } } | null;
};

export default async function TryoutGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group: groupParam } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=/tryouts/${groupParam}`);
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
  const group = groupFromSlug(groupParam);
  if (!group) notFound();
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }

  const players = await withOrganizationContext(session.user.organizationId, (tx) => tx.player.findMany({
    include: {
      athlete: true,
      season: true,
      seasonClub: { include: { club: true, division: true } },
    },
    orderBy: [{ tryoutScore: "desc" }, { athlete: { lastName: "asc" } }],
    where: { draftSelectionGroup: group },
  }));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-brand-400 hover:text-brand-300" href="/tryouts">
          Back to tryouts
        </Link>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-brand-400">Tryout pool</p>
            <h1 className="mt-2 text-3xl font-semibold">{groupLabel(group)}</h1>
            <p className="mt-2 text-sm text-text-2">{players.length} players in this group</p>
          </div>
          <Link
            className="rounded-md border border-line px-4 py-3 text-sm text-text-1 hover:border-emerald-400"
            href={`/tryouts/export?group=${group}`}
          >
            Export CSV
          </Link>
        </div>

        <form action={bulkUpdateTryoutGroup} className="mt-8 rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="font-semibold">Bulk move selected players</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <select
              className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
              name="draftSelectionGroup"
              required
            >
              {groups.map((option) => (
                <option key={option} value={option}>
                  Move selected to {groupLabel(option)}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
              name="selectionNotes"
              placeholder="Selection notes for selected players"
            />
            <button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">
              Apply bulk update
            </button>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {players.map((player) => (
              <label
                className="flex items-center gap-3 rounded-md border border-line bg-black/20 p-3 text-sm"
                key={player.id}
              >
                <input name="playerId" type="checkbox" value={player.id} />
                <span>
                  {player.athlete.firstName} {player.athlete.lastName} - {player.position}
                </span>
              </label>
            ))}
          </div>
        </form>

        <section className="mt-6 grid gap-4">
          {players.map((player) => (
            <article className="rounded-lg border border-line bg-ink-800 p-5" key={player.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">
                    {player.athlete.firstName} {player.athlete.lastName}
                  </h2>
                  <p className="mt-1 text-sm text-text-2">
                    {player.position} - {player.season.name}
                  </p>
                  <p className="mt-1 text-xs text-text-3">
                    {player.seasonClub!
                      ? `${player.seasonClub!.club.name} (${player.seasonClub!.division.name})`
                      : "No SeasonClub assigned"}
                  </p>
                </div>
                <div className="text-right text-xs text-text-3">
                  <p>Status: {player.status}</p>
                  <p>Tryout #: {player.tryoutNumber ?? "Not set"}</p>
                  <p>Score: {player.tryoutScore?.toString() ?? "Not set"}</p>
                </div>
              </div>
              <PlayerTryoutForm player={player} />
            </article>
          ))}
          {players.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-10 text-center text-text-2">
              No players in this pool.
            </p>
          ) : null}
        </section>
      </main>
    </OperationsShell>
  );
}

function PlayerTryoutForm({ player }: { player: TryoutPlayer }) {
  return (
    <form
      action={updatePlayerTryout.bind(null, player.id)}
      className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[1fr_1fr_1fr_2fr_auto]"
    >
      <select
        className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
        defaultValue={player.draftSelectionGroup}
        name="draftSelectionGroup"
        required
      >
        {groups.map((option) => (
          <option key={option} value={option}>
            {groupLabel(option)}
          </option>
        ))}
      </select>
      <input
        className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
        defaultValue={player.tryoutNumber ?? ""}
        name="tryoutNumber"
        placeholder="Tryout number"
      />
      <input
        className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
        defaultValue={player.tryoutScore?.toString() ?? ""}
        max="100"
        min="0"
        name="tryoutScore"
        placeholder="Score"
        step="0.01"
        type="number"
      />
      <input
        className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
        defaultValue={player.selectionNotes ?? ""}
        name="selectionNotes"
        placeholder="Selection notes"
      />
      <button className="rounded-md border border-line px-4 py-3 text-sm font-semibold text-text-1 hover:border-emerald-400">
        Save
      </button>
    </form>
  );
}
