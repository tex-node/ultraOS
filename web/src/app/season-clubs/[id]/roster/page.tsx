import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { setPlayerJerseyNumber } from "@/app/players/actions";
import { auth } from "@/auth";
import { MissingOrganizationContextError, requireSession } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-number": "Jersey number must be a whole number between 0 and 999.",
  "player-not-on-roster": "That player is no longer on this roster.",
  "update-failed": "The jersey number could not be saved. Try again.",
};

export default async function SeasonClubRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; number?: string }>;
}) {
  const { id } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/season-clubs/${id}/roster`);
  const session = await requireSession();
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  const canEdit = hasPermission(session.user.roles, "player:manage");
  const query = await searchParams;

  const registration = await withOrganizationContext(session.user.organizationId, (tx) => tx.seasonClub.findUnique({
    where: { id },
    include: {
      club: { select: { id: true, name: true, shortName: true } },
      division: { select: { name: true } },
      headCoach: { select: { name: true } },
      players: {
        orderBy: [{ jerseyNumber: "asc" }, { athlete: { lastName: "asc" } }],
        include: { athlete: { select: { firstName: true, lastName: true, ultraAthleteId: true } } },
      },
    },
  }));
  if (!registration) notFound();

  const errorMessage =
    query.error === "duplicate-number"
      ? `Jersey number ${query.number ?? ""} is already taken by another player on this roster.`
      : query.error
        ? ERROR_MESSAGES[query.error]
        : null;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link className="text-sm text-zinc-400 hover:text-white" href={`/clubs/${registration.club.id}`}>
          ← Back to club
        </Link>
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">
            {registration.division.name} roster
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{registration.club.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Head coach: {registration.headCoach?.name ?? "Unassigned"} · {registration.players.length} players
          </p>
        </div>

        {errorMessage ? (
          <p className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">
            {errorMessage}
          </p>
        ) : null}

        {!canEdit ? (
          <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
            You have read-only access to this roster. Jersey numbers can only be edited by an operator with player management access.
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08]">
          <div className="grid grid-cols-[1fr_140px_140px] gap-4 border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 text-xs uppercase tracking-wide text-zinc-500">
            <span>Player</span>
            <span>Position</span>
            <span>Jersey No.</span>
          </div>
          {registration.players.map((player) => (
            <div
              key={player.id}
              className="grid grid-cols-[1fr_140px_140px] items-center gap-4 border-b border-white/[0.06] bg-[#0b100e] px-5 py-4 last:border-0"
            >
              <div>
                <p className="font-medium">
                  {player.athlete.firstName} {player.athlete.lastName}
                </p>
                <p className="text-xs text-zinc-500">{player.athlete.ultraAthleteId ?? "No Ultra Athlete ID"}</p>
              </div>
              <p className="text-sm text-zinc-400">{player.position || "—"}</p>
              {canEdit ? (
                <form action={setPlayerJerseyNumber.bind(null, player.id, registration.id)} className="flex gap-2">
                  <input
                    className="w-16 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-center text-sm text-white outline-none focus:border-emerald-400"
                    defaultValue={player.jerseyNumber ?? ""}
                    max={999}
                    min={0}
                    name="jerseyNumber"
                    placeholder="—"
                    type="number"
                  />
                  <button className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-300" type="submit">
                    Save
                  </button>
                </form>
              ) : (
                <p className="text-sm font-semibold">{player.jerseyNumber ?? "—"}</p>
              )}
            </div>
          ))}
          {registration.players.length === 0 ? (
            <p className="bg-[#0b100e] p-8 text-center text-sm text-zinc-400">No players on this roster yet.</p>
          ) : null}
        </div>
      </main>
    </OperationsShell>
  );
}
