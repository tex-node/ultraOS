import Link from "next/link";
import { notFound } from "next/navigation";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

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

// Tournament sub-site fixtures & standings (product roadmap F2.2). Standings read the same
// Standing rows as the global table, scoped to each season and grouped by division —
// entrant-sided (individual-sport) rows included, never assumed to be clubs.
export default async function TournamentFixtures({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const competition = await withOrganizationContext(organization.id, (tx) =>
    tx.competition.findFirst({
      where: { organizationId: organization.id, slug, isActive: true },
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

  // Public match-page links resolve through locators (publicKey = fixture id).
  const fixtureIds = competition.seasons.flatMap((s) => s.fixtures.map((f) => f.id));
  const locatorIds = new Set(
    fixtureIds.length > 0
      ? await withOrganizationContext(organization.id, (tx) =>
          tx.publicResourceLocator
            .findMany({ where: { resourceType: "FIXTURE", resourceId: { in: fixtureIds }, status: "ACTIVE" }, select: { resourceId: true } })
            .then((rows) => rows.map((r) => r.resourceId)),
        )
      : [],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {competition.seasons.length === 0 ? (
        <p className="text-zinc-400">The schedule will appear here once fixtures are generated.</p>
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
                      {rows.map((f) => {
                        const body = (
                          <>
                            <span className="text-sm text-text-3">{formatLagosDateTime(f.scheduledAt)}</span>
                            <b>
                              {f.home.name} {f.status !== "SCHEDULED" ? f.homeScore : ""}{" "}
                              <span className="text-text-3">vs</span> {f.status !== "SCHEDULED" ? f.awayScore : ""} {f.away.name}
                            </b>
                            <span className="text-right text-sm">{f.status}</span>
                          </>
                        );
                        return locatorIds.has(f.id) ? (
                          <Link
                            key={f.id}
                            href={`/public/fixtures/${f.id}`}
                            className="grid gap-3 rounded-lg border border-line bg-ink-800 p-5 transition hover:border-brand-400/40 md:grid-cols-[1fr_2fr_1fr]"
                          >
                            {body}
                          </Link>
                        ) : (
                          <div
                            key={f.id}
                            className="grid gap-3 rounded-lg border border-line bg-ink-800 p-5 md:grid-cols-[1fr_2fr_1fr]"
                          >
                            {body}
                          </div>
                        );
                      })}
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
