import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { competitiveFixtureScope } from "@/lib/competitive-scope";
import type { GameDataCapability } from "@/lib/game-data-capability";
import type { PlayerGameLogRow } from "./player-game-log";
import type { GameCore, PlayerLine, TeamSideStats } from "./types";

// The one file in this directory that touches Prisma. Fetches a completed game's full data
// and reshapes it into the plain GameCore shape every other analytics module consumes. Keeping
// the DB fetch here (not in a React page) is what lets the website, broadcast API, and future
// social-graphic renderer all call the exact same analytics functions on the exact same data.
//
// Phase 1 Stage 5.2C: every exported function here now takes an optional `db` parameter
// (Prisma.TransactionClient | typeof prisma, defaulting to the bare client) - the same shim
// pattern used elsewhere in this codebase (e.g. draftSquadCapacityConfig,
// draftReadinessForPlayer) to convert an authenticated caller without breaking every existing
// public/share caller in one pass. The authenticated broadcast dashboards
// (src/app/broadcast/*) now pass their own withOrganizationContext-scoped tx explicitly; every
// public/share/api caller (public/stats/*, public/share/*, api/share/*, api/v1/seasons/...)
// keeps using the default bare client - those are genuinely public reads, classified DEFER_5.2D
// in the Stage 5.2C documentation, not converted here.
type Db = Prisma.TransactionClient | typeof prisma;

const gameInclude = {
  fixture: {
    include: {
      homeSeasonClub: { include: { club: true }, select: undefined },
      awaySeasonClub: { include: { club: true }, select: undefined },
      division: true,
    },
  },
  teamStats: { include: { seasonClub: { include: { club: true } } } },
  playerStats: {
    include: {
      player: { include: { athlete: true } },
      seasonClub: { include: { club: true } },
    },
  },
  periodScores: { orderBy: { period: "asc" as const } },
} as const;

type RawGame = NonNullable<Awaited<ReturnType<typeof fetchRawGame>>>;

async function fetchRawGame(db: Db, gameId: string) {
  return db.game.findUnique({ where: { id: gameId }, include: gameInclude });
}

async function fetchRawGameByFixture(db: Db, fixtureId: string) {
  return db.game.findUnique({ where: { fixtureId }, include: gameInclude });
}

// TeamStat itself has no shooting/rebound split columns (only PlayerStat does) — team-level
// FG/OREB/DREB are derived by summing that side's PlayerStat rows instead.
function sumPlayerField(players: RawGame["playerStats"], field: "fieldGoalsMade" | "fieldGoalsAttempted" | "offensiveRebounds" | "defensiveRebounds"): number | null {
  const values = players.map((p) => p[field]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

function toTeamSideStats(
  teamStat: RawGame["teamStats"][number] | undefined,
  score: number,
  sidePlayers: RawGame["playerStats"],
): TeamSideStats {
  const club = teamStat?.seasonClub.club;
  return {
    seasonClubId: teamStat?.seasonClubId ?? "",
    shortName: club?.shortName ?? "TBD",
    name: club?.name ?? "TBD",
    logoUrl: club?.logoUrl ?? null,
    primaryColor: club?.primaryColor ?? null,
    score,
    rebounds: teamStat?.rebounds ?? 0,
    assists: teamStat?.assists ?? 0,
    turnovers: teamStat?.turnovers ?? 0,
    fouls: teamStat?.fouls ?? 0,
    fieldGoalsMade: sumPlayerField(sidePlayers, "fieldGoalsMade"),
    fieldGoalsAttempted: sumPlayerField(sidePlayers, "fieldGoalsAttempted"),
    twoPointsMade: null,
    twoPointsAttempted: null,
    threePointsMade: null,
    threePointsAttempted: null,
    freeThrowsMade: null,
    freeThrowsAttempted: null,
    offensiveRebounds: sumPlayerField(sidePlayers, "offensiveRebounds"),
    defensiveRebounds: sumPlayerField(sidePlayers, "defensiveRebounds"),
    pointsFromTurnovers: teamStat?.pointsFromTurnovers ?? null,
    pointsInPaint: teamStat?.pointsInPaint ?? null,
    pointsInPaintMade: teamStat?.pointsInPaintMade ?? null,
    pointsInPaintAttempted: teamStat?.pointsInPaintAttempted ?? null,
    secondChancePoints: teamStat?.secondChancePoints ?? null,
    fastBreakPoints: teamStat?.fastBreakPoints ?? null,
    fastBreakPointsFromTurnovers: teamStat?.fastBreakPointsFromTurnovers ?? null,
    benchPoints: teamStat?.benchPoints ?? null,
    biggestLead: teamStat?.biggestLead ?? null,
    biggestScoringRun: teamStat?.biggestScoringRun ?? null,
    pointsPerPossession: teamStat?.pointsPerPossession != null ? Number(teamStat.pointsPerPossession) : null,
    leadChanges: teamStat?.leadChanges ?? null,
    timesTied: teamStat?.timesTied ?? null,
    timeWithLeadSeconds: teamStat?.timeWithLeadSeconds ?? null,
    fourPointsMade: teamStat?.fourPointsMade ?? null,
    fourPointsAttempted: teamStat?.fourPointsAttempted ?? null,
    ultraTimePointsFor: teamStat?.ultraTimePointsFor ?? null,
    ultraTimePointsAgainst: teamStat?.ultraTimePointsAgainst ?? null,
  };
}

function toPlayerLine(stat: RawGame["playerStats"][number], side: "HOME" | "AWAY"): PlayerLine {
  return {
    playerId: stat.playerId,
    name: `${stat.player.athlete.firstName} ${stat.player.athlete.lastName}`,
    jerseyNumber: stat.player.jerseyNumber,
    photoUrl: stat.player.athlete.photoUrl,
    seasonClubId: stat.seasonClubId,
    seasonClubShortName: stat.seasonClub!.club.shortName,
    side,
    didNotPlay: stat.didNotPlay,
    minutesPlayed: stat.minutesPlayed,
    points: stat.points,
    rebounds: stat.rebounds,
    assists: stat.assists,
    steals: stat.steals,
    blocks: stat.blocks,
    turnovers: stat.turnovers,
    fouls: stat.fouls,
    fieldGoalsMade: stat.fieldGoalsMade,
    fieldGoalsAttempted: stat.fieldGoalsAttempted,
    twoPointsMade: stat.twoPointsMade,
    twoPointsAttempted: stat.twoPointsAttempted,
    threePointsMade: stat.threePointsMade,
    threePointsAttempted: stat.threePointsAttempted,
    freeThrowsMade: stat.freeThrowsMade,
    freeThrowsAttempted: stat.freeThrowsAttempted,
    offensiveRebounds: stat.offensiveRebounds,
    defensiveRebounds: stat.defensiveRebounds,
    foulsDrawn: stat.foulsDrawn,
    plusMinus: stat.plusMinus,
    efficiency: stat.efficiency,
    fourPointsMade: stat.fourPointsMade,
    fourPointsAttempted: stat.fourPointsAttempted,
    ultraTimePoints: stat.ultraTimePoints,
  };
}

function toGameCore(game: RawGame): GameCore {
  const fixture = game.fixture;
  const homeTeamStat = game.teamStats.find((t) => t.seasonClubId === fixture.homeSeasonClubId!);
  const awayTeamStat = game.teamStats.find((t) => t.seasonClubId === fixture.awaySeasonClubId!);
  const homePlayers = game.playerStats.filter((s) => s.seasonClubId === fixture.homeSeasonClubId!);
  const awayPlayers = game.playerStats.filter((s) => s.seasonClubId === fixture.awaySeasonClubId!);
  return {
    gameId: game.id,
    fixtureId: fixture.id,
    status: game.status,
    dataCapability: game.dataCapability as GameDataCapability,
    divisionName: fixture.division.name,
    scheduledAt: fixture.scheduledAt,
    home: toTeamSideStats(homeTeamStat, fixture.homeScore, homePlayers),
    away: toTeamSideStats(awayTeamStat, fixture.awayScore, awayPlayers),
    players: game.playerStats.map((s) => toPlayerLine(s, s.seasonClubId === fixture.homeSeasonClubId! ? "HOME" : "AWAY")),
    periods: game.periodScores.map((p) => ({ period: p.period, label: p.label, homeScore: p.homeScore, awayScore: p.awayScore })),
  };
}

export async function loadGameCoreByFixture(fixtureId: string, db: Db = prisma): Promise<GameCore | null> {
  const raw = await fetchRawGameByFixture(db, fixtureId);
  if (!raw || raw.status !== "FINAL") return null;
  return toGameCore(raw);
}

export async function loadGameCore(gameId: string, db: Db = prisma): Promise<GameCore | null> {
  const raw = await fetchRawGame(db, gameId);
  if (!raw || raw.status !== "FINAL") return null;
  return toGameCore(raw);
}

export async function loadSeasonGameCores(seasonId: string, db: Db = prisma): Promise<GameCore[]> {
  const games = await db.game.findMany({
    where: { status: "FINAL", fixture: { seasonId, ...competitiveFixtureScope() } },
    include: gameInclude,
  });
  return games.map(toGameCore);
}

// Season-wide per-player totals for leaderboards. PlayerStat doesn't carry seasonId directly,
// so this aggregates in application code from the (small, Season-Zero-scale) row set rather
// than attempting a cross-relation Prisma groupBy.
export async function loadSeasonPlayerTotals(seasonId: string, db: Db = prisma) {
  const stats = await db.playerStat.findMany({
    where: { didNotPlay: false, game: { status: "FINAL", fixture: { seasonId, ...competitiveFixtureScope() } } },
    include: { player: { include: { athlete: true, seasonClub: { include: { club: true } } } } },
  });

  const byPlayer = new Map<string, {
    playerId: string; athleteId: string; name: string; seasonClubShortName: string; gamesPlayed: number;
    points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number;
    fieldGoalsMade: number; fieldGoalsAttempted: number; twoPointsMade: number; twoPointsAttempted: number;
    threePointsMade: number; threePointsAttempted: number; freeThrowsMade: number; freeThrowsAttempted: number;
    plusMinus: number;
  }>();

  for (const s of stats) {
    const existing = byPlayer.get(s.playerId) ?? {
      playerId: s.playerId,
      athleteId: s.player.athleteId,
      name: `${s.player.athlete.firstName} ${s.player.athlete.lastName}`,
      seasonClubShortName: s.player.seasonClub?.club.shortName ?? "—",
      gamesPlayed: 0, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
      fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointsMade: 0, twoPointsAttempted: 0,
      threePointsMade: 0, threePointsAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, plusMinus: 0,
    };
    existing.gamesPlayed += 1;
    existing.points += s.points;
    existing.rebounds += s.rebounds;
    existing.assists += s.assists;
    existing.steals += s.steals;
    existing.blocks += s.blocks;
    existing.turnovers += s.turnovers;
    existing.fieldGoalsMade += s.fieldGoalsMade ?? 0;
    existing.fieldGoalsAttempted += s.fieldGoalsAttempted ?? 0;
    existing.twoPointsMade += s.twoPointsMade ?? 0;
    existing.twoPointsAttempted += s.twoPointsAttempted ?? 0;
    existing.threePointsMade += s.threePointsMade ?? 0;
    existing.threePointsAttempted += s.threePointsAttempted ?? 0;
    existing.freeThrowsMade += s.freeThrowsMade ?? 0;
    existing.freeThrowsAttempted += s.freeThrowsAttempted ?? 0;
    existing.plusMinus += s.plusMinus ?? 0;
    byPlayer.set(s.playerId, existing);
  }

  return [...byPlayer.values()];
}

export type PlayerBestGame = {
  fixtureId: string;
  opponentShortName: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  efficiency: number;
};

// Deterministic "best game" — the same effective-efficiency metric Game Star uses (real
// `efficiency` when the source provided it, otherwise the same PTS+REB+AST+STL+BLK-misses-TO
// proxy), never just "most points," so a big scoring night with poor efficiency doesn't
// automatically outrank a genuinely complete performance.
export async function loadPlayerBestGame(playerId: string, db: Db = prisma): Promise<PlayerBestGame | null> {
  const stats = await db.playerStat.findMany({
    where: { playerId, didNotPlay: false, game: { status: "FINAL", fixture: competitiveFixtureScope() } },
    include: {
      game: {
        include: {
          fixture: {
            include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } },
          },
        },
      },
    },
  });
  if (stats.length === 0) return null;

  function effProxy(s: (typeof stats)[number]): number {
    if (s.efficiency != null) return s.efficiency;
    const missedFg = s.fieldGoalsAttempted != null && s.fieldGoalsMade != null ? s.fieldGoalsAttempted - s.fieldGoalsMade : 0;
    const missedFt = s.freeThrowsAttempted != null && s.freeThrowsMade != null ? s.freeThrowsAttempted - s.freeThrowsMade : 0;
    return s.points + s.rebounds + s.assists + s.steals + s.blocks - missedFg - missedFt - s.turnovers;
  }

  const best = [...stats].sort((a, b) => effProxy(b) - effProxy(a))[0];
  const fixture = best.game.fixture;
  const opponent = fixture.homeSeasonClubId! === best.seasonClubId ? fixture.awaySeasonClub!.club.shortName : fixture.homeSeasonClub!.club.shortName;

  return {
    fixtureId: fixture.id,
    opponentShortName: opponent,
    points: best.points,
    rebounds: best.rebounds,
    assists: best.assists,
    steals: best.steals,
    fieldGoalsMade: best.fieldGoalsMade,
    fieldGoalsAttempted: best.fieldGoalsAttempted,
    efficiency: effProxy(best),
  };
}

// Full per-game history for a player, for the Player Game Log — complements loadPlayerBestGame
// (single overall-best game) by exposing every game so a caller can select the best game in a
// specific category (see selectBestGameByCategory in player-game-log.ts).
export async function loadPlayerGameLog(playerId: string, db: Db = prisma): Promise<PlayerGameLogRow[]> {
  const stats = await db.playerStat.findMany({
    where: { playerId, game: { status: "FINAL", fixture: competitiveFixtureScope() } },
    include: {
      game: {
        include: {
          fixture: {
            include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } },
          },
        },
      },
    },
  });

  function effProxyRow(s: (typeof stats)[number]): number {
    if (s.efficiency != null) return s.efficiency;
    const missedFg = s.fieldGoalsAttempted != null && s.fieldGoalsMade != null ? s.fieldGoalsAttempted - s.fieldGoalsMade : 0;
    const missedFt = s.freeThrowsAttempted != null && s.freeThrowsMade != null ? s.freeThrowsAttempted - s.freeThrowsMade : 0;
    return s.points + s.rebounds + s.assists + s.steals + s.blocks - missedFg - missedFt - s.turnovers;
  }

  const rows = stats.map((s): PlayerGameLogRow => {
    const fixture = s.game.fixture;
    const isHome = fixture.homeSeasonClubId! === s.seasonClubId;
    const own = isHome ? fixture.homeScore : fixture.awayScore;
    const opp = isHome ? fixture.awayScore : fixture.homeScore;
    const opponentShortName = isHome ? fixture.awaySeasonClub!.club.shortName : fixture.homeSeasonClub!.club.shortName;
    return {
      fixtureId: fixture.id,
      scheduledAt: fixture.scheduledAt,
      opponentShortName,
      result: own > opp ? "W" : own < opp ? "L" : "T",
      didNotPlay: s.didNotPlay,
      minutesPlayed: s.minutesPlayed,
      points: s.points,
      rebounds: s.rebounds,
      assists: s.assists,
      steals: s.steals,
      blocks: s.blocks,
      turnovers: s.turnovers,
      fieldGoalsMade: s.fieldGoalsMade,
      fieldGoalsAttempted: s.fieldGoalsAttempted,
      threePointsMade: s.threePointsMade,
      threePointsAttempted: s.threePointsAttempted,
      freeThrowsMade: s.freeThrowsMade,
      freeThrowsAttempted: s.freeThrowsAttempted,
      efficiency: effProxyRow(s),
    };
  });

  return rows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
