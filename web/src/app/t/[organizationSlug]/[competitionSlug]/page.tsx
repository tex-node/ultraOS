import Link from "next/link";
import { notFound } from "next/navigation";
import { describeSport, getSportDefinition } from "@/lib/sports/registry";
import { isIndividualSport } from "@/lib/sports/fixture-sides";
import { eloForSeasonClubs } from "@/server/analytics/elo-ratings";
import { buildIndividualStandings, formatRatio, type IndividualStandingInput } from "@/lib/public/individual-standings";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tournament sub-site overview (product roadmap F2.1): rules, venues, teams, seasons.
// Everything reads the accepted model — no new tables, no new endpoints.
export default async function TournamentOverview({ params }: { params: Promise<{ organizationSlug: string; competitionSlug: string }> }) {
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
        sport: true,
        divisions: true,
        seasons: {
          include: {
            seasonClubs: { include: { club: true } },
            entrants: { where: { status: "ACTIVE" } },
            standings: {
              include: {
                metrics: true,
                entrant: { select: { id: true, name: true } },
                seasonClub: { select: { id: true, club: { select: { name: true } } } },
              },
            },
            fixtures: {
              include: {
                venue: true,
                homeEntrant: { select: { id: true, name: true } },
                awayEntrant: { select: { id: true, name: true } },
                homeSeasonClub: { select: { id: true, club: { select: { name: true } } } },
                awaySeasonClub: { select: { id: true, club: { select: { name: true } } } },
                game: { include: { periodScores: { select: { homeScore: true, awayScore: true } } } },
              },
              orderBy: { scheduledAt: "asc" },
            },
          },
        },
      },
    }),
  );
  if (!competition) notFound();

  const definition = getSportDefinition(competition.sport.slug);
  const formatSummary = definition ? describeSport(definition).formatSummary : null;
  const venues = [...new Map(competition.seasons.flatMap((s) => s.fixtures).map((f) => [f.venue.id, f.venue])).values()];
  const teams = competition.seasons.flatMap((s) =>
    s.seasonClubs.map((sc) => ({
      key: sc.id,
      name: sc.club.name,
      detail: `${s.name} · ${sc.club.shortName}`,
      color: sc.club.primaryColor,
    })),
  );
  const individuals = competition.seasons.flatMap((s) =>
    s.entrants
      .filter((e) => e.seasonClubId == null)
      .map((e) => ({ key: e.id, name: e.name, detail: `${s.name} · ${e.type}`, color: e.primaryColor })),
  );
  const participants = [...teams, ...individuals];

  // Elo (streak v13, Prompt 3): the strength number behind a pre-match probability, shown on the team list so a
  // reader can see why one side is favoured before a ball is thrown up.
  const elo = await withOrganizationContext(competition.organizationId, (tx) =>
    eloForSeasonClubs(tx, competition.organizationId, teams.map((team) => team.key)),
  );

  // Individual-sport standings (streak v6, Prompt 3). The engine's own Standing rows give matches and
  // sets; GAMES are summed from the per-set scores, because a tennis set's period score IS its games. A
  // participant with no standing row yet still appears, at the bottom, with zeroes - a table that hides
  // someone who has entered but not played reads as "not in the tournament".
  const individualSport = definition ? isIndividualSport(definition) : individuals.length > 0;
  const gamesByEntrant = new Map<string, { won: number; lost: number }>();
  for (const season of competition.seasons) {
    for (const fixture of season.fixtures) {
      if (!fixture.homeEntrantId || !fixture.awayEntrantId || !fixture.game) continue;
      let home = 0;
      let away = 0;
      for (const period of fixture.game.periodScores) {
        home += period.homeScore;
        away += period.awayScore;
      }
      const currentHome = gamesByEntrant.get(fixture.homeEntrantId) ?? { won: 0, lost: 0 };
      gamesByEntrant.set(fixture.homeEntrantId, { won: currentHome.won + home, lost: currentHome.lost + away });
      const currentAway = gamesByEntrant.get(fixture.awayEntrantId) ?? { won: 0, lost: 0 };
      gamesByEntrant.set(fixture.awayEntrantId, { won: currentAway.won + away, lost: currentAway.lost + home });
    }
  }
  const individualStandings = individualSport
    ? buildIndividualStandings(
        competition.seasons.flatMap((season) =>
          season.entrants.map((entrant) => {
            const standing = season.standings.find((row) => row.entrantId === entrant.id);
            const games = gamesByEntrant.get(entrant.id) ?? { won: 0, lost: 0 };
            const input: IndividualStandingInput = {
              entrantId: entrant.id,
              name: entrant.name,
              played: standing?.played ?? 0,
              won: standing?.won ?? 0,
              lost: standing?.lost ?? 0,
              drawn: standing?.drawn ?? 0,
              leaguePoints: standing?.leaguePoints ?? 0,
              rank: standing?.rank ?? null,
              rankTiebreak: standing?.rankTiebreak ?? null,
              metrics: (standing?.metrics ?? []).map((metric) => ({ metricKey: metric.metricKey, value: Number(metric.value) })),
              gamesWon: games.won,
              gamesLost: games.lost,
            };
            return input;
          }),
        ),
      )
    : [];

  // Bracket (streak v6, Prompt 3): knockout rounds are the fixtures that carry a round number. There is no
  // BracketNode component in the design system (checked), so this renders the rounds as columns of match
  // cards - the same information, no new dependency.
  const bracketRounds = new Map<number, typeof competition.seasons[number]["fixtures"]>();
  if (individualSport || competition.seasons.some((season) => season.fixtures.some((fixture) => fixture.round !== null))) {
    for (const season of competition.seasons) {
      for (const fixture of season.fixtures) {
        if (fixture.round === null) continue;
        const bucket = bracketRounds.get(fixture.round) ?? [];
        bucket.push(fixture);
        bracketRounds.set(fixture.round, bucket);
      }
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-400">Sport & format</h2>
          <p className="mt-2 font-semibold">{competition.sport.name}</p>
          {formatSummary ? <p className="mt-1 text-sm text-text-2">{formatSummary}</p> : null}
          <p className="mt-1 text-sm text-text-2">{competition.format.replace(/_/g, " ").toLowerCase()}</p>
        </section>
        <section className="rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-400">Seasons & divisions</h2>
          <p className="mt-2 text-sm text-text-1">
            Divisions: {competition.divisions.map((d) => d.name).join(", ") || "none yet"}
          </p>
          {competition.seasons.length === 0 ? (
            <p className="mt-2 text-sm text-text-3">No seasons yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {competition.seasons.map((s) => (
                <li key={s.id} className="text-text-1">
                  <span className="font-semibold text-white">{s.name}</span>
                  <span className="text-text-3"> · {s.status.replace(/_/g, " ").toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-400">Venues</h2>
          {venues.length === 0 ? (
            <p className="mt-2 text-sm text-text-3">Venues announced with the schedule.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-text-1">
              {venues.map((v) => (
                <li key={v.id}>{v.name}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">
          {teams.length > 0 ? "Teams" : "Athletes"} <span className="text-sm font-normal text-text-3">({participants.length})</span>
        </h2>
        {participants.length === 0 ? (
          <p className="mt-3 text-sm text-text-3">Entries open soon — teams and athletes will appear here.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((p) => (
              <div key={p.key} className="flex items-center gap-3 rounded-lg border border-line bg-ink-800 p-4">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-sm font-bold"
                  style={{
                    color: p.color ?? "#00F076",
                    background: `${p.color ?? "#00F076"}15`,
                    border: `1px solid ${p.color ?? "#00F076"}44`,
                  }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-text-3">{p.detail}</p>
                  {elo.get(p.key) ? (
                    <p className="truncate text-xs text-text-2">
                      Elo {elo.get(p.key)!.rating.toFixed(0)} <span className="text-text-3">#{elo.get(p.key)!.rank} of {elo.get(p.key)!.of}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {individualStandings.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-bold">Standings</h2>
          <p className="mt-1 text-sm text-text-3">
            Ranked by wins, then set ratio, then game ratio — the engine&apos;s own tiebreak order. A dash means
            nothing has been won or lost yet, not zero.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-ink-800">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-text-3">
                  <th className="p-3">#</th>
                  <th className="p-3">Athlete</th>
                  <th className="p-3 text-right">P</th>
                  <th className="p-3 text-right">W</th>
                  <th className="p-3 text-right">L</th>
                  <th className="p-3 text-right">Sets</th>
                  <th className="p-3 text-right">Set %</th>
                  <th className="p-3 text-right">Games</th>
                  <th className="p-3 text-right">Game %</th>
                </tr>
              </thead>
              <tbody>
                {individualStandings.map((standing, index) => (
                  <tr key={standing.entrantId} className="border-t border-line-subtle">
                    <td className="p-3 text-text-3">{standing.rank ?? index + 1}</td>
                    <td className="p-3 font-semibold text-text-1">{standing.name}</td>
                    <td className="p-3 text-right">{standing.played}</td>
                    <td className="p-3 text-right font-semibold text-brand-300">{standing.won}</td>
                    <td className="p-3 text-right">{standing.lost}</td>
                    <td className="p-3 text-right">{standing.setsWon}–{standing.setsLost}</td>
                    <td className="p-3 text-right tabular-nums">{formatRatio(standing.setRatio)}</td>
                    <td className="p-3 text-right">{standing.gamesWon}–{standing.gamesLost}</td>
                    <td className="p-3 text-right tabular-nums">{formatRatio(standing.gameRatio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {bracketRounds.size > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-bold">Bracket</h2>
          <p className="mt-1 text-sm text-text-3">Winners advance automatically as each round completes.</p>
          <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
            {[...bracketRounds.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([round, fixtures]) => (
                <div key={round} className="min-w-[240px] flex-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-3">Round {round}</h3>
                  <ul className="mt-2 space-y-2">
                    {fixtures.map((fixture) => {
                      const homeName = fixture.homeEntrant?.name ?? fixture.homeSeasonClub?.club.name ?? "TBD";
                      const awayName = fixture.awayEntrant?.name ?? fixture.awaySeasonClub?.club.name ?? "TBD";
                      const decided = fixture.status === "FINAL";
                      return (
                        <li key={fixture.id} className="rounded-md border border-line bg-ink-900 p-3 text-sm">
                          <p className={decided && fixture.homeScore > fixture.awayScore ? "font-bold text-brand-300" : "text-text-1"}>
                            {homeName} {decided ? <span className="tabular-nums">{fixture.homeScore}</span> : null}
                          </p>
                          <p className={decided && fixture.awayScore > fixture.homeScore ? "font-bold text-brand-300" : "text-text-1"}>
                            {awayName} {decided ? <span className="tabular-nums">{fixture.awayScore}</span> : null}
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-wider text-text-3">{fixture.status.replace(/_/g, " ").toLowerCase()}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-lg border border-brand-400/20 bg-brand-400/[.04] p-5">
        <h2 className="font-semibold text-brand-300">Follow the action</h2>
        <p className="mt-1 text-sm text-text-2">
          Fixtures, live scores, standings, and full match pages update automatically as games are scored.
        </p>
        <Link
          href={`/t/${organizationSlug}/${competition.slug}/fixtures`}
          className="mt-3 inline-block rounded-md bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
        >
          View fixtures & standings
        </Link>
      </section>
    </main>
  );
}
