import { NextResponse } from "next/server";
import { hasUltraStatDerivation, type GameDataCapability } from "@/lib/game-data-capability";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function playerLine(stat: {
  playerId: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  minutesPlayed: number | null;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  twoPointsMade: number | null;
  twoPointsAttempted: number | null;
  threePointsMade: number | null;
  threePointsAttempted: number | null;
  freeThrowsMade: number | null;
  freeThrowsAttempted: number | null;
  didNotPlay: boolean;
  fourPointsMade: number | null;
  fourPointsAttempted: number | null;
  ultraTimePoints: number | null;
  ultraTimeFieldGoalsMade: number | null;
  ultraTimeFieldGoalsAttempted: number | null;
  player: { athlete: { firstName: string; lastName: string } };
}, includeUltra: boolean) {
  return {
    playerId: stat.playerId,
    name: `${stat.player.athlete.firstName} ${stat.player.athlete.lastName}`,
    didNotPlay: stat.didNotPlay,
    minutesPlayed: stat.minutesPlayed,
    points: stat.points,
    rebounds: stat.rebounds,
    assists: stat.assists,
    steals: stat.steals,
    blocks: stat.blocks,
    turnovers: stat.turnovers,
    fouls: stat.fouls,
    fieldGoals: { made: stat.fieldGoalsMade, attempted: stat.fieldGoalsAttempted },
    twoPoints: { made: stat.twoPointsMade, attempted: stat.twoPointsAttempted },
    threePoints: { made: stat.threePointsMade, attempted: stat.threePointsAttempted },
    freeThrows: { made: stat.freeThrowsMade, attempted: stat.freeThrowsAttempted },
    // null (NOT_CAPTURED) unless this game's dataCapability supports Ultra stat derivation -
    // see docs/architecture/data-capability-and-provenance.md. Never a guessed/fabricated 0.
    ultra: includeUltra
      ? {
          fourPoints: { made: stat.fourPointsMade, attempted: stat.fourPointsAttempted },
          ultraTimePoints: stat.ultraTimePoints,
          ultraTimeFieldGoals: { made: stat.ultraTimeFieldGoalsMade, attempted: stat.ultraTimeFieldGoalsAttempted },
        }
      : null,
  };
}

// Public, read-only box score for one game - team totals plus per-player lines. Respects the
// NOT_CAPTURED convention: Ultra-specific fields (4PT, Ultra Time splits) are only ever
// surfaced when this game's dataCapability actually supports deriving them (native scoring),
// never guessed for an imported box-score-only game.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const game = await withOrganizationContext(organization.id, (tx) =>
    tx.game.findUnique({
      where: { id },
      include: {
        fixture: {
          include: {
            homeSeasonClub: { include: { club: true } },
            awaySeasonClub: { include: { club: true } },
          },
        },
        teamStats: true,
        playerStats: { include: { player: { include: { athlete: true } } } },
      },
    }),
  );
  if (!game) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const capability = game.dataCapability as GameDataCapability;
  const includeUltra = hasUltraStatDerivation(capability);

  const teamStat = (seasonClubId: string) => game.teamStats.find((t) => t.seasonClubId === seasonClubId) ?? null;
  const playerStats = (seasonClubId: string) => game.playerStats.filter((p) => p.seasonClubId === seasonClubId);

  const teamLine = (seasonClubId: string) => {
    const stat = teamStat(seasonClubId);
    return {
      points: stat?.points ?? 0,
      rebounds: stat?.rebounds ?? 0,
      assists: stat?.assists ?? 0,
      turnovers: stat?.turnovers ?? 0,
      fouls: stat?.fouls ?? 0,
      ultra: includeUltra
        ? {
            fourPoints: { made: stat?.fourPointsMade ?? null, attempted: stat?.fourPointsAttempted ?? null },
            ultraTimePointsFor: stat?.ultraTimePointsFor ?? null,
            ultraTimePointsAgainst: stat?.ultraTimePointsAgainst ?? null,
          }
        : null,
      players: playerStats(seasonClubId).map((p) => playerLine(p, includeUltra)),
    };
  };

  return NextResponse.json({
    gameId: game.id,
    dataCapability: capability,
    home: { club: game.fixture.homeSeasonClub.club.shortName, ...teamLine(game.fixture.homeSeasonClubId) },
    away: { club: game.fixture.awaySeasonClub.club.shortName, ...teamLine(game.fixture.awaySeasonClubId) },
  });
}
