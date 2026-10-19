import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";
import { apiTeam } from "@/lib/api-v1/teams";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/exports/tournament/[id] (streak v9, Prompt 3)
//
// Bulk historical export for a partner: a competition's metadata, participants, fixtures with final scores, and -
// on PRO/ENTERPRISE only - the per-player statistics. It is one request by design; a partner that needs the whole
// league's history for cold storage uses scripts/export-league-data.ts instead.
//
// Honesty rules:
//   - `stats.included` says whether the caller's tier received statistics, and `stats.reason` says why not -
//     an empty `players` array must never be mistaken for "this league has no stats";
//   - a competition from another league is 404, never a hint that it exists;
//   - `dataCapability` per fixture comes from the game, so a BOX_SCORE_ONLY game is visibly different from one
//     that was captured at event level.

const TIERS_WITH_STATS = new Set(["PRO", "ENTERPRISE"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withPublicApiV1(request, async ({ key }) => {
    const { id } = await params;
    const organization = await resolveDefaultPublicOrganization();
    const tier = key?.tier ?? "BASIC";

    const data = await withOrganizationContext(organization.id, async (tx) => {
      const competition = await tx.competition.findFirst({
        where: { id, organizationId: organization.id },
        select: {
          id: true,
          name: true,
          slug: true,
          sport: { select: { slug: true, name: true } },
          // Divisions belong to the COMPETITION, not the season (the first version of this route put them on the
          // season and the query did not typecheck).
          divisions: { select: { id: true, name: true, slug: true } },
          seasons: {
            orderBy: { startDate: "asc" },
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              seasonClubs: { select: { id: true, club: { select: { id: true, name: true, shortName: true } } } },
              entrants: { select: { id: true, name: true, type: true } },
              fixtures: {
                orderBy: { scheduledAt: "asc" },
                select: {
                  id: true,
                  scheduledAt: true,
                  status: true,
                  homeScore: true,
                  awayScore: true,
                  round: true,
                  homeSeasonClubId: true,
                  awaySeasonClubId: true,
                  homeEntrantId: true,
                  awayEntrantId: true,
                  homeSeasonClub: { select: { club: { select: { name: true, shortName: true } } } },
                  awaySeasonClub: { select: { club: { select: { name: true, shortName: true } } } },
                  homeEntrant: { select: { id: true, name: true } },
                  awayEntrant: { select: { id: true, name: true } },
                  game: {
                    select: {
                      id: true,
                      status: true,
                      dataCapability: true,
                      periodScores: { orderBy: { period: "asc" }, select: { period: true, label: true, homeScore: true, awayScore: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!competition) return null;

      // Statistics are tier-gated. The query runs only when the caller may see them, so a BASIC key cannot even
      // time the difference.
      const fixtureIds = competition.seasons.flatMap((season) => season.fixtures.map((fixture) => fixture.id));
      const players = TIERS_WITH_STATS.has(tier) && fixtureIds.length > 0
        ? await tx.playerStat.findMany({
            where: { organizationId: organization.id, game: { fixtureId: { in: fixtureIds } } },
            select: {
              playerId: true,
              gameId: true,
              minutesPlayed: true,
              points: true,
              rebounds: true,
              assists: true,
              steals: true,
              blocks: true,
              turnovers: true,
              fouls: true,
              statSource: true,
              player: { select: { athlete: { select: { firstName: true, lastName: true } }, seasonClub: { select: { club: { select: { shortName: true } } } } } },
              game: { select: { fixtureId: true } },
            },
          })
        : [];
      return { competition, players };
    });

    if (!data) return apiError("SEASON_NOT_FOUND", "No tournament found for this id.");
    const { competition, players } = data;

    const payload = {
      generatedAt: new Date().toISOString(),
      organization: { id: organization.id, slug: organization.slug, name: organization.name },
      tournament: {
        id: competition.id,
        name: competition.name,
        slug: competition.slug,
        sport: competition.sport,
        seasons: competition.seasons.map((season) => ({
          id: season.id,
          name: season.name,
          startDate: season.startDate.toISOString().slice(0, 10),
          endDate: season.endDate.toISOString().slice(0, 10),
          // Divisions are competition-scoped, so they are reported once above rather than per season.
          participants: [
            ...season.seasonClubs.map((seasonClub) => ({ kind: "CLUB" as const, id: seasonClub.id, name: seasonClub.club.name, shortName: seasonClub.club.shortName })),
            ...season.entrants.map((entrant) => ({ kind: "ENTRANT" as const, id: entrant.id, name: entrant.name, type: entrant.type })),
          ],
          fixtures: season.fixtures.map((fixture) => ({
            id: fixture.id,
            scheduledAt: fixture.scheduledAt.toISOString(),
            status: fixture.status,
            round: fixture.round,
            home: apiTeam({ seasonClub: fixture.homeSeasonClub, entrant: fixture.homeEntrant }),
            away: apiTeam({ seasonClub: fixture.awaySeasonClub, entrant: fixture.awayEntrant }),
            score: { home: fixture.homeScore, away: fixture.awayScore },
            game: fixture.game
              ? { id: fixture.game.id, status: fixture.game.status, dataCapability: fixture.game.dataCapability, periods: fixture.game.periodScores }
              : null,
          })),
        })),
      },
      stats: {
        included: TIERS_WITH_STATS.has(tier),
        reason: TIERS_WITH_STATS.has(tier) ? null : "Player statistics require the PRO or ENTERPRISE tier.",
        games: players.length,
        players: players.map((row) => ({
          playerId: row.playerId,
          name: `${row.player.athlete.firstName} ${row.player.athlete.lastName}`.trim(),
          clubShortName: row.player.seasonClub?.club.shortName ?? null,
          fixtureId: row.game.fixtureId,
          gameId: row.gameId,
          statSource: row.statSource,
          minutes: row.minutesPlayed,
          points: row.points,
          rebounds: row.rebounds,
          assists: row.assists,
          steals: row.steals,
          blocks: row.blocks,
          turnovers: row.turnovers,
          fouls: row.fouls,
        })),
      },
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  });
}
