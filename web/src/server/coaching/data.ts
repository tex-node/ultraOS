import "server-only";
import type { GameCore } from "@/lib/analytics/types";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import type { PlayerMeta } from "@/lib/coaching/player-development";
import { withOrganizationContext } from "@/lib/tenant-context";
import type { ClubScope } from "./scope";

// Read-only data the coaching pages feed to the pure engines in lib/coaching. One organization
// context per call; nothing here writes.

export type RosterPlayer = { playerId: string; name: string; jerseyNumber: number | null; position: string | null; heightCm: number | null };
export type SeasonClubSummary = { seasonClubId: string; name: string; shortName: string };
export type UpcomingFixture = { fixtureId: string; scheduledAt: Date; opponent: SeasonClubSummary; isHome: boolean };

export type ClubCoachingData = {
  scope: ClubScope;
  games: GameCore[];
  meta: Map<string, PlayerMeta>;
  roster: RosterPlayer[];
  clubs: SeasonClubSummary[];
  upcoming: UpcomingFixture[];
};

export async function loadClubCoachingData(scope: ClubScope): Promise<ClubCoachingData> {
  return withOrganizationContext(scope.organizationId, async (tx) => {
    const games = await loadSeasonGameCores(scope.seasonId, tx);

    const players = await tx.player.findMany({
      where: { seasonId: scope.seasonId, organizationId: scope.organizationId },
      select: { id: true, seasonClubId: true, jerseyNumber: true, position: true, heightCm: true, athlete: { select: { firstName: true, lastName: true } } },
    });
    const meta = new Map<string, PlayerMeta>(players.map((p) => [p.id, { position: p.position, heightCm: p.heightCm }]));
    const roster: RosterPlayer[] = players
      .filter((p) => p.seasonClubId === scope.seasonClubId)
      .map((p) => ({ playerId: p.id, name: `${p.athlete.firstName} ${p.athlete.lastName}`, jerseyNumber: p.jerseyNumber, position: p.position, heightCm: p.heightCm }))
      .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) || a.name.localeCompare(b.name));

    const seasonClubs = await tx.seasonClub.findMany({
      where: { seasonId: scope.seasonId, organizationId: scope.organizationId },
      select: { id: true, club: { select: { name: true, shortName: true } } },
    });
    const clubs: SeasonClubSummary[] = seasonClubs.map((c) => ({ seasonClubId: c.id, name: c.club.name, shortName: c.club.shortName }));
    const byId = new Map(clubs.map((c) => [c.seasonClubId, c]));

    const fixtures = await tx.fixture.findMany({
      where: {
        seasonId: scope.seasonId,
        organizationId: scope.organizationId,
        status: "SCHEDULED",
        OR: [{ homeSeasonClubId: scope.seasonClubId }, { awaySeasonClubId: scope.seasonClubId }],
      },
      select: { id: true, scheduledAt: true, homeSeasonClubId: true, awaySeasonClubId: true },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });
    const upcoming: UpcomingFixture[] = [];
    for (const f of fixtures) {
      const isHome = f.homeSeasonClubId === scope.seasonClubId;
      const opponent = byId.get((isHome ? f.awaySeasonClubId : f.homeSeasonClubId) ?? "");
      if (opponent) upcoming.push({ fixtureId: f.id, scheduledAt: f.scheduledAt, opponent, isHome });
    }

    return { scope, games, meta, roster, clubs, upcoming };
  });
}
