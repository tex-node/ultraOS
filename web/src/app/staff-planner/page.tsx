import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { gameControlRoleLabel } from "@/lib/game-access";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

// Who can control which games. Reads the same GameControlGrant rows the Access dashboard writes and
// requireFixturePermission enforces, so this board can never drift from actual access. (It replaced a
// read-only board over EventStaffAssignment's free-text labels, which no permission ever consulted.)
export default async function StaffPlannerPage() {
  const session = await requirePermissionOrRedirect("operations:view", "/staff-planner");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const grants = await withOrganizationContext(organizationId, (tx) =>
    tx.gameControlGrant.findMany({
      where: { revokedAt: null },
      include: {
        user: { select: { name: true, email: true } },
        competition: { select: { name: true } },
        season: { select: { name: true } },
        event: { select: { name: true } },
      },
      orderBy: [{ competitionId: "asc" }, { seasonId: "asc" }, { eventId: "asc" }, { createdAt: "desc" }],
    }),
  );

  const scopeLabel = (grant: (typeof grants)[number]) => {
    if (grant.competitionId) return `Tournament · ${grant.competition?.name ?? grant.competitionId}`;
    if (grant.seasonId) return `Season · ${grant.season?.name ?? grant.seasonId}`;
    if (grant.eventId) return `Event · ${grant.event?.name ?? grant.eventId}`;
    return "Organization-wide";
  };

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Game control</h1>
            <p className="mt-2 text-sm text-text-2">
              Everyone who can operate games right now, and what they can reach.
            </p>
          </div>
          <Link href="/access" className="rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900">
            Grant access
          </Link>
        </div>

        {grants.length === 0 ? (
          <p className="mt-8 rounded-lg border border-line bg-ink-800 p-6 text-sm text-text-2">
            No game-control grants yet. Grant access from the Access page to let someone run a
            tournament, season or event without a league-wide role.
          </p>
        ) : (
          <section className="mt-8 overflow-x-auto rounded-lg border border-line bg-ink-800 p-5">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-text-3">
                <tr>
                  <th className="py-2 pr-4">Person</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4">Granted</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.id} className="border-t border-white/5">
                    <td className="py-3 pr-4">
                      <span className="font-medium">{grant.user?.name ?? "—"}</span>
                      <span className="ml-2 text-text-2">{grant.user?.email}</span>
                    </td>
                    <td className="py-3 pr-4">{gameControlRoleLabel(grant.role) ?? grant.role}</td>
                    <td className="py-3 pr-4 text-text-1">{scopeLabel(grant)}</td>
                    <td className="py-3 pr-4 text-text-3">{grant.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="mt-6 text-xs text-text-3">
          Roles: Tournament admin (schedule + scoring + confirm) · Game controller (scoring + confirm) ·
          Scorekeeper (scoring only) · Statistician (player stats only).
        </p>
      </main>
    </OperationsShell>
  );
}
