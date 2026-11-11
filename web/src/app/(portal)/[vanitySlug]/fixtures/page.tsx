import { notFound } from "next/navigation";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { resolveVanityCompetitionId } from "@/lib/vanity-tournament";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Side = { name: string };
type FixtureRow = {
  id: string;
  status: string;
  scheduledAt: Date;
  homeScore: number;
  awayScore: number;
  divisionName: string;
  home: Side;
  away: Side;
};

type StandingRow = {
  key: string;
  name: string;
  division: string;
  played: number;
  won: number;
  lost: number;
  pointDifference: number;
  leaguePoints: number;
};

function side(seasonClub: { club: { name: string } } | null, entrant: { name: string } | null): Side {
  return { name: seasonClub?.club.name ?? entrant?.name ?? "TBD" };
}

function sortStandings(rows: StandingRow[]) {
  return [...rows].sort(
    (a, b) =>
      b.leaguePoints - a.leaguePoints ||
      b.won - a.won ||
      b.pointDifference - a.pointDifference ||
      a.name.localeCompare(b.name),
  );
}

// Vanity tournament fixtures & standings - the short-URL sibling of /t/[slug]/fixtures for any
// other organization's tournament. Public fixture-detail links are omitted here (unlike /t/[slug]
// which resolves them via a FIXTURE locator scoped to Neon Ultra) since this route deliberately
// stays a self-contained summary page for a second organization's tournament - not a reason to
// widen the FIXTURE locator's own scope.
export default async function VanityTournamentFixtures({ params }: { params: Promise<{ vanitySlug: string }> }) {
  const { vanitySlug } = await params;
  const resolved = await resolveVanityCompetitionId(vanitySlug);
  if (!resolved) notFound();

  const competition = await withOrganizationContext(resolved.organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id: resolved.competitionId },
      include: {
        seasons: {
          include: {
            fixtures: {
              orderBy: { scheduledAt: "asc" },
              include: {
                division: true,
                homeSeasonClub: { include: { club: true } },
                awaySeasonClub: { include: { club: true } },
                homeEntrant: true,
                awayEntrant: true,
              },
            },
            standings: {
              include: {
                seasonClub: { include: { club: true, division: true } },
                entrant: { include: { division: true } },
              },
            },
          },
        },
      },
    }),
  );
  if (!competition) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {competition.seasons.length === 0 ? (
        <p className="text-zinc-400">The schedule will appear here once fixtures are added.</p>
      ) : null}
      {competition.seasons.map((season) => {
        const fixtures: FixtureRow[] = season.fixtures.map((f) => ({
          id: f.id,
          status: f.status,
          scheduledAt: f.scheduledAt,
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          divisionName: f.division.name,
          home: side(f.homeSeasonClub, f.homeEntrant),
          away: side(f.awaySeasonClub, f.awayEntrant),
        }));
        const standings = sortStandings(
          season.standings.map((s) => ({
            key: s.id,
            name: s.seasonClub?.club.name ?? s.entrant?.name ?? "TBD",
            division: s.seasonClub?.division.name ?? s.entrant?.division.name ?? "Open",
            played: s.played,
            won: s.won,
            lost: s.lost,
            pointDifference: s.pointDifference,
            leaguePoints: s.leaguePoints,
          })),
        );
        const byDivision = new Map<string, FixtureRow[]>();
        for (const f of fixtures) byDivision.set(f.divisionName, [...(byDivision.get(f.divisionName) ?? []), f]);
        const tablesByDivision = new Map<string, StandingRow[]>();
        for (const r of standings) tablesByDivision.set(r.division, [...(tablesByDivision.get(r.division) ?? []), r]);

        return (
          <section key={season.id} className="mb-12">
            <h2 className="text-2xl font-bold">{season.name}</h2>

            <h3 className="mb-3 mt-6 text-lg font-semibold text-text-1">Fixtures</h3>
            {fixtures.length === 0 ? (
              <p className="text-sm text-text-3">No fixtures scheduled yet.</p>
            ) : (
              <div className="space-y-3">
                {[...byDivision.entries()].map(([division, rows]) => (
                  <div key={division}>
                    <p className="mb-2 text-xs uppercase tracking-[.2em] text-text-3">{division}</p>
                    <div className="space-y-2">
                      {rows.map((f) => (
                        <div
                          key={f.id}
                          className="grid gap-3 rounded-lg border border-line bg-ink-800 p-5 md:grid-cols-[1fr_2fr_1fr]"
                        >
                          <span className="text-sm text-text-3">{formatLagosDateTime(f.scheduledAt)}</span>
                          <b>
                            {f.home.name} {f.status !== "SCHEDULED" ? f.homeScore : ""}{" "}
                            <span className="text-text-3">vs</span> {f.status !== "SCHEDULED" ? f.awayScore : ""} {f.away.name}
                          </b>
                          <span className="text-right text-sm">{f.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 className="mb-3 mt-8 text-lg font-semibold text-text-1">Standings</h3>
            {standings.length === 0 ? (
              <p className="text-sm text-text-3">Tables appear once results are finalized.</p>
            ) : (
              [...tablesByDivision.entries()].map(([division, rows]) => (
                <div key={division} className="mb-4">
                  <p className="mb-2 text-xs uppercase tracking-[.2em] text-text-3">{division}</p>
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <div className="min-w-[640px]">
                      {rows.map((row, index) => (
                        <div key={row.key} className="grid grid-cols-[50px_1fr_repeat(4,70px)] border-b border-line bg-ink-800 p-4">
                          <b>{index + 1}</b>
                          <span>{row.name}</span>
                          <span>{row.played} P</span>
                          <span>{row.won} W</span>
                          <span>{row.pointDifference} PD</span>
                          <b className="text-brand-400">{row.leaguePoints}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        );
      })}
    </main>
  );
}
