import Link from "next/link";
import { notFound } from "next/navigation";
import { EventResultsBoard } from "@/app/components/event-results-board";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { parseEventResults, type EventResults } from "@/lib/public/event-results";
import { Prisma } from "@/generated/prisma/client";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "@/lib/tenant-context";

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
export default async function TournamentFixtures({ params }: { params: Promise<{ organizationSlug: string; competitionSlug: string }> }) {
  const { organizationSlug, competitionSlug } = await params;
  // Multi-tenant public routing (streak v16, Prompt 2): the organization comes from the URL, not from the deployment.
  // resolveDefaultPublicOrganization() stays for pages that genuinely serve the platform default; a tournament sub-site
  // is addressed by its own tenant, which is what lets a partner league live at its own path.
  const organization = await resolveActiveOrganizationBySlug(organizationSlug).catch(() => null);
  if (!organization) notFound();
  const competition = await withOrganizationContext(organization.id, (tx) =>
    tx.competition.findFirst({
      where: { organizationId: organization.id, slug: competitionSlug, isActive: true },
      include: {
        sport: { select: { slug: true, name: true } },
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
            entrants: {
              where: { status: "ACTIVE" },
              select: { id: true, name: true, seed: true, division: { select: { name: true } } },
              orderBy: { seed: "asc" },
            },
          },
        },
      },
    }),
  );
  if (!competition) notFound();

  // A competition can be decided without a single fixture: GIESM's flag race was run on the day, with a published podium and
  // nineteen registered athletes, and no schedule. The fixtures page used to render an empty shell for that - this section is
  // what makes it a truthful page instead of a blank one. Results are read from the organization's published events and
  // filtered to categories of THIS competition's sport, so a volleyball podium never appears on the flag-race page.
  const sportKey = competition.sport.slug.toUpperCase().replace(/-/g, "_");
  const publishedResults = competition.seasons.some((season) => season.fixtures.length > 0)
    ? []
    : (
        await withOrganizationContext(organization.id, (tx) =>
          tx.event.findMany({
            where: { organizationId: organization.id, status: "COMPLETED", results: { not: Prisma.DbNull } },
            select: { id: true, name: true, slug: true, results: true },
          }),
        )
      )
        .flatMap((event): { id: string; name: string; results: EventResults }[] => {
          const parsed = parseEventResults(event.results);
          if (!parsed) return [];
          const categories = parsed.categories.filter((category) => (category.sport ?? "").toUpperCase().replace(/-/g, "_") === sportKey);
          if (categories.length === 0) return [];
          return [{ id: event.id, name: event.name, results: { publishedAt: parsed.publishedAt, categories } }];
        });

  const entrants = competition.seasons.flatMap((season) => season.entrants.map((entrant) => ({ ...entrant, season: season.name })));
  const noFixtures = competition.seasons.every((season) => season.fixtures.length === 0);

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
      {noFixtures ? (
        <>
          {publishedResults.map((entry) => (
            <EventResultsBoard key={entry.id} results={entry.results} title={entry.name} showGenderHeadings={false} className="mb-8" />
          ))}
          {entrants.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold">
                Registered athletes <span className="text-sm font-normal text-zinc-400">({entrants.length})</span>
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {competition.sport.name} ? {entrants.length} entrants. This competition had no scheduled fixtures - it was decided
                in a single session.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {entrants.map((entrant) => (
                  <div key={entrant.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10 text-xs font-bold text-zinc-300">
                      {entrant.seed != null ? String(entrant.seed).padStart(2, "0") : "?"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-100">{entrant.name}</span>
                      <span className="block text-[11px] text-zinc-500">{entrant.division.name}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {publishedResults.length === 0 && entrants.length === 0 ? (
            <p className="text-zinc-400">Nothing has been published for this competition yet.</p>
          ) : null}
          <p className="mt-8 text-sm text-zinc-400">
            <Link href={`/t/${organizationSlug}/${competitionSlug}`} className="text-emerald-400 underline">
              Back to the tournament overview
            </Link>
          </p>
        </>
      ) : null}
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
