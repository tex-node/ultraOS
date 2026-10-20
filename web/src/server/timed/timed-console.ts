import { withOrganizationContext } from "@/lib/tenant-context";
import { computeTimedLeaderboard, formatRaceTime, type TimedLeaderboardRow } from "@/lib/sports/timed-standings";

// Data for the timing console (streak v12, Prompt 1b).
//
// A stopwatch needs two things the scoring panel never did: who could be timed, and what has already been recorded.
// Competitors are the fixture's players (a heat is run by athletes, not clubs) plus the two sides themselves, so a
// relay or a team race can be recorded without inventing a "team player".
export type TimedConsoleData = {
  competitors: { id: string; name: string }[];
  recent: { name: string; seconds: number; formatted: string }[];
};

export async function loadTimedConsoleData(organizationId: string, fixtureId: string): Promise<TimedConsoleData> {
  return withOrganizationContext(organizationId, async (tx) => {
    const fixture = await tx.fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      include: {
        homeSeasonClub: { select: { id: true, club: { select: { name: true } }, players: { select: { id: true, athlete: { select: { firstName: true, lastName: true } } } } } },
        awaySeasonClub: { select: { id: true, club: { select: { name: true } }, players: { select: { id: true, athlete: { select: { firstName: true, lastName: true } } } } } },
        homeEntrant: { select: { id: true, name: true } },
        awayEntrant: { select: { id: true, name: true } },
      },
    });

    // Events hang off the GAME, not the fixture (streak v12): querying `fixture.events` does not typecheck.
    const events = await tx.gameEvent.findMany({
      where: { game: { fixtureId }, typeKey: "FINISH_TIME" },
      orderBy: { sequenceNumber: "asc" },
      select: { data: true, playerId: true, seasonClubId: true, entrantId: true },
    });

    // A heat has more competitors than a fixture has sides (streak v12): entrant races are entered for the season,
    // so the season's active entrants are selectable as well as the fixture's own two sides and players.
    const seasonEntrants = await tx.entrant.findMany({
      where: { seasonId: fixture.seasonId, organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const nameById = new Map<string, string>();
    for (const entrant of seasonEntrants) nameById.set(entrant.id, entrant.name);
    for (const side of [fixture.homeSeasonClub, fixture.awaySeasonClub]) {
      if (!side) continue;
      nameById.set(side.id, side.club.name);
      for (const player of side.players) nameById.set(player.id, `${player.athlete.firstName} ${player.athlete.lastName}`.trim());
    }
    for (const entrant of [fixture.homeEntrant, fixture.awayEntrant]) if (entrant) nameById.set(entrant.id, entrant.name);

    const competitors = [...nameById.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const recent = events
      .map((event) => {
        const seconds = (event.data as { seconds?: number } | null)?.seconds;
        const subject = event.playerId ?? event.seasonClubId ?? event.entrantId;
        if (typeof seconds !== "number" || !subject) return null;
        return { name: nameById.get(subject) ?? "Unknown", seconds, formatted: formatRaceTime(seconds) };
      })
      .filter((entry): entry is { name: string; seconds: number; formatted: string } => entry !== null);

    return { competitors, recent };
  });
}

/**
 * The race table for a season (streak v12). A timed sport has no W/L table to show, so the standings page renders
 * this instead: every recorded finish across the season's fixtures, best time per competitor, fastest first.
 */
export async function loadSeasonTimedLeaderboard(organizationId: string, seasonId: string): Promise<TimedLeaderboardRow[]> {
  return withOrganizationContext(organizationId, async (tx) => {
    const events = await tx.gameEvent.findMany({
      where: { typeKey: "FINISH_TIME", game: { fixture: { seasonId } } },
      orderBy: { sequenceNumber: "asc" },
      select: {
        data: true,
        playerId: true,
        seasonClubId: true,
        entrantId: true,
        player: { select: { athlete: { select: { firstName: true, lastName: true } } } },
        seasonClub: { select: { club: { select: { name: true } } } },
        entrant: { select: { name: true } },
        game: { select: { fixture: { select: { homeSeasonClubId: true } } } },
      },
    });

    const finishes = events
      .map((event) => {
        const seconds = (event.data as { seconds?: number } | null)?.seconds;
        const key = event.playerId ?? event.seasonClubId ?? event.entrantId;
        const name = event.player
          ? `${event.player.athlete.firstName} ${event.player.athlete.lastName}`.trim()
          : event.seasonClub?.club.name ?? event.entrant?.name ?? "Unknown";
        if (typeof seconds !== "number" || !key) return null;
        return { key, name, seconds, side: event.seasonClubId === event.game.fixture.homeSeasonClubId ? ("HOME" as const) : event.seasonClubId ? ("AWAY" as const) : null };
      })
      .filter((finish): finish is { key: string; name: string; seconds: number; side: "HOME" | "AWAY" | null } => finish !== null);

    return computeTimedLeaderboard(finishes);
  });
}