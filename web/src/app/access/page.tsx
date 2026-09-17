import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { GAME_CONTROL_ROLE_LABELS, GAME_CONTROL_ROLE_LIST, gameControlRoleLabel } from "@/lib/game-access";
import { withOrganizationContext } from "@/lib/tenant-context";
import { grantGameControl, revokeGameControl } from "./actions";

export const dynamic = "force-dynamic";

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

// Admin console for game-control access. Grants are scoped to a tournament (competition), season,
// event, or the whole organization, so an admin can hand someone control of one tournament without
// giving them a league-wide role.
export default async function AccessPage() {
  const session = await requirePermissionOrRedirect("staff:manage", "/access");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const { competitions, seasons, events, grants } = await withOrganizationContext(organizationId, async (tx) => {
    const [competitions, seasons, events, grants] = await Promise.all([
      tx.competition.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, sport: { select: { name: true } } } }),
      tx.season.findMany({
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, competition: { select: { name: true } } },
      }),
      tx.event.findMany({
        orderBy: { startTime: "asc" },
        select: { id: true, name: true, season: { select: { name: true } } },
      }),
      tx.gameControlGrant.findMany({
        where: { revokedAt: null },
        include: { user: { select: { name: true, email: true } } },
        orderBy: [{ createdAt: "desc" }],
      }),
    ]);
    return { competitions, seasons, events, grants };
  });

  const competitionName = new Map(competitions.map((competition) => [competition.id, competition.name]));
  const seasonName = new Map(seasons.map((season) => [season.id, season.name]));
  const eventName = new Map(events.map((event) => [event.id, event.name]));

  const scopeLabel = (grant: { competitionId: string | null; seasonId: string | null; eventId: string | null }) => {
    if (grant.competitionId) return `Tournament · ${competitionName.get(grant.competitionId) ?? grant.competitionId}`;
    if (grant.seasonId) return `Season · ${seasonName.get(grant.seasonId) ?? grant.seasonId}`;
    if (grant.eventId) return `Event · ${eventName.get(grant.eventId) ?? grant.eventId}`;
    return "Organization-wide";
  };

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Game-control access</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Give a user control of games for one tournament, season or event — without a league-wide role.
          Organization-wide grants apply everywhere in this organization.
        </p>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Grant access</h2>
          <form action={grantGameControl} className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              User email
              <input name="email" type="email" required placeholder="staff@example.com" className={inputClass} />
            </label>
            <label className={labelClass}>
              Role
              <select name="role" defaultValue="GAME_CONTROLLER" className={inputClass}>
                {GAME_CONTROL_ROLE_LIST.map((role) => (
                  <option key={role} value={role}>
                    {GAME_CONTROL_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Scope
              <select name="scope" defaultValue="org" className={inputClass}>
                <option value="org">Organization-wide (every game)</option>
                {competitions.length ? <optgroup label="Tournaments">{competitions.map((competition) => (
                  <option key={competition.id} value={`competition:${competition.id}`}>
                    {competition.name} · {competition.sport.name}
                  </option>
                ))}</optgroup> : null}
                {seasons.length ? <optgroup label="Seasons">{seasons.map((season) => (
                  <option key={season.id} value={`season:${season.id}`}>
                    {season.name} · {season.competition.name}
                  </option>
                ))}</optgroup> : null}
                {events.length ? <optgroup label="Events">{events.map((event) => (
                  <option key={event.id} value={`event:${event.id}`}>
                    {event.name} · {event.season.name}
                  </option>
                ))}</optgroup> : null}
              </select>
            </label>
            <div className="sm:col-span-3">
              <button className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950">Grant access</button>
            </div>
          </form>
          <p className="mt-3 text-xs text-zinc-500">
            {GAME_CONTROL_ROLE_LIST.map((role) => `${GAME_CONTROL_ROLE_LABELS[role]}`).join(" · ")} — a
            scorekeeper scores but cannot confirm a result; a statistician records player stats only.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Active grants</h2>
          {grants.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No game-control grants yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Scope</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {grants.map((grant) => (
                    <tr key={grant.id} className="border-t border-white/5">
                      <td className="py-2 pr-4">
                        <span className="font-medium">{grant.user?.name ?? "—"}</span>
                        <span className="ml-2 text-zinc-400">{grant.user?.email}</span>
                      </td>
                      <td className="py-2 pr-4">{gameControlRoleLabel(grant.role) ?? grant.role}</td>
                      <td className="py-2 pr-4 text-zinc-300">{scopeLabel(grant)}</td>
                      <td className="py-2 pr-4 text-right">
                        <form action={revokeGameControl}>
                          <input type="hidden" name="grantId" value={grant.id} />
                          <button className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs text-rose-300 hover:border-rose-400/60">
                            Revoke
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-6 text-xs text-zinc-500">
          Fixtures must be attached to an event for event-scoped grants to apply; tournament and season
          grants cover fixtures by their schedule, with no attachment needed. See{" "}
          <Link href="/gameday" className="text-emerald-300 underline">
            Game Day
          </Link>{" "}
          to open a console.
        </p>
      </main>
    </OperationsShell>
  );
}
