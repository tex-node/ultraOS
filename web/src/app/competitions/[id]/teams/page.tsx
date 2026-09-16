import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { withdrawTeam } from "./new/actions";

export const dynamic = "force-dynamic";

// Teams entered into a competition, grouped by season and division. A team is only operational once
// it has all four rows (Club, SeasonClub, Entrant, Standing) - the two boolean columns make a
// partially-entered team visible instead of silently missing from fixtures or standings.
export default async function CompetitionTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("club:manage", `/competitions/${id}/teams`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const competition = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id },
      include: {
        sport: true,
        seasons: {
          orderBy: { startDate: "desc" },
          include: {
            seasonClubs: {
              include: { club: true, entrant: true, division: true, standing: true },
            },
          },
        },
      },
    }),
  );
  if (!competition) notFound();

  const total = competition.seasons.reduce((sum, season) => sum + season.seasonClubs.length, 0);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href={`/competitions/${id}`} className="text-sm text-emerald-400">
          ← {competition.name}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Teams</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {total} team{total === 1 ? "" : "s"} entered into {competition.sport.name}.
            </p>
          </div>
          <Link
            href={`/competitions/${id}/teams/new`}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950"
          >
            Add a team
          </Link>
        </div>

        {competition.seasons.length === 0 || total === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6 text-sm text-zinc-400">
            No teams entered yet. Add a team to create its club, season registration, entrant and standing
            together.
          </p>
        ) : null}

        {competition.seasons.map((season) => {
          if (season.seasonClubs.length === 0) return null;
          const byDivision = new Map<string, typeof season.seasonClubs>();
          for (const seasonClub of season.seasonClubs) {
            const list = byDivision.get(seasonClub.division.name) ?? [];
            list.push(seasonClub);
            byDivision.set(seasonClub.division.name, list);
          }

          return (
            <section key={season.id} className="mt-8">
              <h2 className="text-lg font-semibold">{season.name}</h2>
              {[...byDivision.entries()].map(([divisionName, seasonClubs]) => (
                <div key={divisionName} className="mt-4 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">{divisionName}</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="py-2 pr-4">Team</th>
                          <th className="py-2 pr-4">Short</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Entrant</th>
                          <th className="py-2 pr-4">Standing</th>
                          <th className="py-2 pr-4" />
                        </tr>
                      </thead>
                      <tbody>
                        {seasonClubs
                          .slice()
                          .sort((a, b) => a.club.name.localeCompare(b.club.name))
                          .map((seasonClub) => (
                            <tr key={seasonClub.id} className="border-t border-white/5">
                              <td className="py-2 pr-4 font-medium">{seasonClub.club.name}</td>
                              <td className="py-2 pr-4 text-zinc-400">{seasonClub.club.shortName}</td>
                              <td className="py-2 pr-4">
                                <span className={seasonClub.status === "ACTIVE" ? "text-emerald-300" : "text-amber-300"}>
                                  {seasonClub.status}
                                </span>
                              </td>
                              <td className="py-2 pr-4">{seasonClub.entrant ? "yes" : <span className="text-rose-300">missing</span>}</td>
                              <td className="py-2 pr-4">{seasonClub.standing ? "yes" : <span className="text-rose-300">missing</span>}</td>
                              <td className="py-2 pr-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <Link
                                    href={`/season-clubs/${seasonClub.id}/edit`}
                                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:border-white/25"
                                  >
                                    Manage
                                  </Link>
                                  {seasonClub.status === "ACTIVE" ? (
                                    <form action={withdrawTeam}>
                                      <input type="hidden" name="competitionId" value={id} />
                                      <input type="hidden" name="seasonClubId" value={seasonClub.id} />
                                      <button className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs text-rose-300 hover:border-rose-400/60">
                                        Withdraw
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          );
        })}

        <p className="mt-6 text-xs text-zinc-500">
          Withdrawing keeps a team&apos;s fixtures and history but takes it out of schedule generation, which
          only reads ACTIVE teams.
        </p>
      </main>
    </OperationsShell>
  );
}
