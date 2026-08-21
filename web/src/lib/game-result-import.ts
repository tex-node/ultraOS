import { Prisma } from "@/generated/prisma/client";
import type { StatDataSource } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// Imports a completed game's result from an external stats report (e.g. a FIBA/Genius
// Sports box score) — used when the live scorer console was not the system of record for
// a game. Never infers Ultra-specific data (4PT, Ultra Time) that the source doesn't report;
// those simply stay absent. Never overwrites an already-imported/live-scored game silently.

export type ImportPlayerLine = {
  reportedName: string;
  jerseyNumber: number | null;
  didNotPlay: boolean;
  minutesPlayed: number;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  twoPointsMade: number;
  twoPointsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  foulsCommitted: number;
  foulsDrawn: number;
  plusMinus: number;
  efficiency: number;
};

export type ImportTeamAdvanced = {
  pointsFromTurnovers: number;
  pointsInPaint: number;
  pointsInPaintMade: number;
  pointsInPaintAttempted: number;
  secondChancePoints: number;
  fastBreakPoints: number;
  fastBreakPointsFromTurnovers: number;
  benchPoints: number;
  biggestLead: number;
  biggestScoringRun: number;
  pointsPerPossession: number;
  leadChanges: number;
  timesTied: number;
  timeWithLeadSeconds: number;
};

export type ImportTeamTotals = {
  points: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  fouls: number;
};

export type ImportTeamLine = {
  seasonClubShortName: string;
  players: ImportPlayerLine[];
  totals: ImportTeamTotals;
  advanced: ImportTeamAdvanced;
};

export type ImportPeriodScore = { period: number; label: string; homeScore: number; awayScore: number };

export type GameResultImportInput = {
  fixtureId: string;
  homeShortName: string;
  awayShortName: string;
  homeScore: number;
  awayScore: number;
  periods: ImportPeriodScore[];
  home: ImportTeamLine;
  away: ImportTeamLine;
  // Free-text specific reference (e.g. the source PDF's filename) - see sourceLabel usage
  // below. statSource is the queryable *category* (Prisma.StatDataSource); every import this
  // pipeline has ever run has been a FIBA/Genius Sports box score PDF, so that's the default.
  sourceLabel: string;
  statSource?: StatDataSource;
};

export type PlayerMatch =
  | { status: "MATCHED"; playerId: string; reportedName: string }
  | { status: "AMBIGUOUS"; candidates: string[]; reportedName: string }
  | { status: "UNMATCHED"; reportedName: string };

export type GameResultImportReport = {
  fixtureId: string;
  status: "IMPORTED" | "BLOCKED";
  reason?: string;
  homeMatches: PlayerMatch[];
  awayMatches: PlayerMatch[];
  gameId?: string;
};

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

async function matchTeamPlayers(
  tx: Prisma.TransactionClient,
  seasonClubId: string,
  lines: ImportPlayerLine[],
): Promise<PlayerMatch[]> {
  const roster = await tx.player.findMany({
    where: { seasonClubId },
    select: { id: true, athlete: { select: { firstName: true, lastName: true } } },
  });
  const rosterEntries = roster.map((p) => ({
    id: p.id,
    key: normalizeName(`${p.athlete.firstName}${p.athlete.lastName}`),
  }));
  const byNormalizedName = new Map<string, string[]>();
  for (const p of rosterEntries) {
    const list = byNormalizedName.get(p.key) ?? [];
    list.push(p.id);
    byNormalizedName.set(p.key, list);
  }

  return lines.map((line): PlayerMatch => {
    const key = normalizeName(line.reportedName);
    const exact = byNormalizedName.get(key) ?? [];
    if (exact.length === 1) return { status: "MATCHED", playerId: exact[0], reportedName: line.reportedName };
    if (exact.length > 1) return { status: "AMBIGUOUS", candidates: exact, reportedName: line.reportedName };

    // Many external stats systems truncate a player's name (e.g. "ADAGIFT" for
    // "Ada Gift Okechukwu") to a fixed field width. Since a club's roster is small
    // (~7-9 people), a unique prefix match in either direction is safe and expected.
    const prefixMatches = rosterEntries.filter(
      (p) => p.key.startsWith(key) || key.startsWith(p.key),
    );
    const uniqueIds = [...new Set(prefixMatches.map((p) => p.id))];
    if (uniqueIds.length === 1) return { status: "MATCHED", playerId: uniqueIds[0], reportedName: line.reportedName };
    if (uniqueIds.length > 1) return { status: "AMBIGUOUS", candidates: uniqueIds, reportedName: line.reportedName };
    return { status: "UNMATCHED", reportedName: line.reportedName };
  });
}

export async function previewGameResultImport(input: GameResultImportInput): Promise<GameResultImportReport> {
  return prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: input.fixtureId },
      select: {
        homeSeasonClubId: true,
        awaySeasonClubId: true,
        homeSeasonClub: { select: { club: { select: { shortName: true } } } },
        awaySeasonClub: { select: { club: { select: { shortName: true } } } },
      },
    });
    if (!fixture) {
      return { fixtureId: input.fixtureId, status: "BLOCKED", reason: "Fixture not found.", homeMatches: [], awayMatches: [] };
    }
    const homeMatches = await matchTeamPlayers(tx, fixture.homeSeasonClubId, input.home.players);
    const awayMatches = await matchTeamPlayers(tx, fixture.awaySeasonClubId, input.away.players);
    return { fixtureId: input.fixtureId, status: "IMPORTED", homeMatches, awayMatches };
  });
}

export async function importGameResult(input: GameResultImportInput, actorId: string): Promise<GameResultImportReport> {
  return prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: input.fixtureId },
      include: {
        game: true,
        homeSeasonClub: { select: { id: true, club: { select: { shortName: true } } } },
        awaySeasonClub: { select: { id: true, club: { select: { shortName: true } } } },
      },
    });
    if (!fixture) return { fixtureId: input.fixtureId, status: "BLOCKED", reason: "Fixture not found.", homeMatches: [], awayMatches: [] };
    if (fixture.status === "FINAL" || fixture.game?.status === "FINAL") {
      return { fixtureId: input.fixtureId, status: "BLOCKED", reason: "Fixture is already FINAL. Use the supersede workflow instead of importing again.", homeMatches: [], awayMatches: [] };
    }
    if (fixture.homeSeasonClub.club.shortName.toUpperCase() !== input.homeShortName.toUpperCase()
      || fixture.awaySeasonClub.club.shortName.toUpperCase() !== input.awayShortName.toUpperCase()) {
      return { fixtureId: input.fixtureId, status: "BLOCKED", reason: `GAME_IDENTITY_MISMATCH: fixture is ${fixture.homeSeasonClub.club.shortName} vs ${fixture.awaySeasonClub.club.shortName}, import is ${input.homeShortName} vs ${input.awayShortName}.`, homeMatches: [], awayMatches: [] };
    }

    const homeMatches = await matchTeamPlayers(tx, fixture.homeSeasonClubId, input.home.players);
    const awayMatches = await matchTeamPlayers(tx, fixture.awaySeasonClubId, input.away.players);
    const unresolved = [...homeMatches, ...awayMatches].filter((m) => m.status !== "MATCHED");
    // Unresolved rows are skipped (no PlayerStat written for them), not blocking — team-level
    // results (score, TeamStat, standings) are still real and correct even when an individual
    // player couldn't be matched to an existing roster record. Every skip is reported back so
    // it can be reviewed, never silently dropped.

    const finalPeriod = input.periods.length;
    const winnerSeasonClubId = input.homeScore === input.awayScore
      ? null
      : input.homeScore > input.awayScore
        ? fixture.homeSeasonClubId
        : fixture.awaySeasonClubId;

    await tx.fixture.update({
      where: { id: input.fixtureId },
      data: { status: "FINAL", homeScore: input.homeScore, awayScore: input.awayScore, winnerSeasonClubId },
    });

    const statSource: StatDataSource = input.statSource ?? "FIBA_LIVESTATS_PDF_IMPORT";
    const game = await tx.game.upsert({
      where: { fixtureId: input.fixtureId },
      create: {
        fixtureId: input.fixtureId,
        status: "FINAL",
        currentPeriod: finalPeriod,
        clockSecondsRemaining: 0,
        startedAt: new Date(),
        endedAt: new Date(),
        resultSource: input.sourceLabel,
        resultImportedAt: new Date(),
        statSource,
        // A box score import never has 4PT/Ultra Time visibility - standard FIBA/Genius
        // Sports software has no concept of Ultra's custom rules. dataCapability stays at
        // the schema default (BOX_SCORE_ONLY) rather than being claimed here.
      },
      update: {
        status: "FINAL",
        currentPeriod: finalPeriod,
        clockSecondsRemaining: 0,
        endedAt: new Date(),
        resultSource: input.sourceLabel,
        resultImportedAt: new Date(),
        statSource,
      },
    });

    for (const p of input.periods) {
      await tx.gamePeriodScore.upsert({
        where: { gameId_period: { gameId: game.id, period: p.period } },
        create: { gameId: game.id, period: p.period, label: p.label, homeScore: p.homeScore, awayScore: p.awayScore },
        update: { label: p.label, homeScore: p.homeScore, awayScore: p.awayScore },
      });
    }

    const teamSides: Array<{ seasonClubId: string; line: ImportTeamLine; matches: PlayerMatch[] }> = [
      { seasonClubId: fixture.homeSeasonClubId, line: input.home, matches: homeMatches },
      { seasonClubId: fixture.awaySeasonClubId, line: input.away, matches: awayMatches },
    ];

    for (const side of teamSides) {
      await tx.teamStat.upsert({
        where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: side.seasonClubId } },
        create: {
          gameId: game.id,
          seasonClubId: side.seasonClubId,
          points: side.line.totals.points,
          rebounds: side.line.totals.rebounds,
          assists: side.line.totals.assists,
          turnovers: side.line.totals.turnovers,
          fouls: side.line.totals.fouls,
          ...side.line.advanced,
          statSource,
        },
        update: {
          points: side.line.totals.points,
          rebounds: side.line.totals.rebounds,
          assists: side.line.totals.assists,
          turnovers: side.line.totals.turnovers,
          fouls: side.line.totals.fouls,
          ...side.line.advanced,
          statSource,
        },
      });

      for (let i = 0; i < side.line.players.length; i++) {
        const p = side.line.players[i];
        const match = side.matches[i];
        if (match.status !== "MATCHED") continue;
        await tx.playerStat.upsert({
          where: { gameId_playerId: { gameId: game.id, playerId: match.playerId } },
          create: {
            gameId: game.id,
            playerId: match.playerId,
            seasonClubId: side.seasonClubId,
            points: p.points,
            rebounds: p.offensiveRebounds + p.defensiveRebounds,
            assists: p.assists,
            steals: p.steals,
            blocks: p.blocks,
            turnovers: p.turnovers,
            fouls: p.foulsCommitted,
            minutesPlayed: p.minutesPlayed,
            fieldGoalsMade: p.fieldGoalsMade,
            fieldGoalsAttempted: p.fieldGoalsAttempted,
            twoPointsMade: p.twoPointsMade,
            twoPointsAttempted: p.twoPointsAttempted,
            threePointsMade: p.threePointsMade,
            threePointsAttempted: p.threePointsAttempted,
            freeThrowsMade: p.freeThrowsMade,
            freeThrowsAttempted: p.freeThrowsAttempted,
            offensiveRebounds: p.offensiveRebounds,
            defensiveRebounds: p.defensiveRebounds,
            foulsDrawn: p.foulsDrawn,
            plusMinus: p.plusMinus,
            efficiency: p.efficiency,
            didNotPlay: p.didNotPlay,
            statSource,
          },
          update: {
            points: p.points,
            rebounds: p.offensiveRebounds + p.defensiveRebounds,
            assists: p.assists,
            steals: p.steals,
            blocks: p.blocks,
            turnovers: p.turnovers,
            fouls: p.foulsCommitted,
            minutesPlayed: p.minutesPlayed,
            fieldGoalsMade: p.fieldGoalsMade,
            fieldGoalsAttempted: p.fieldGoalsAttempted,
            twoPointsMade: p.twoPointsMade,
            twoPointsAttempted: p.twoPointsAttempted,
            threePointsMade: p.threePointsMade,
            threePointsAttempted: p.threePointsAttempted,
            freeThrowsMade: p.freeThrowsMade,
            freeThrowsAttempted: p.freeThrowsAttempted,
            offensiveRebounds: p.offensiveRebounds,
            defensiveRebounds: p.defensiveRebounds,
            foulsDrawn: p.foulsDrawn,
            plusMinus: p.plusMinus,
            efficiency: p.efficiency,
            didNotPlay: p.didNotPlay,
            statSource,
          },
        });
      }
    }

    await writeAuditLog(tx, {
      userId: actorId,
      action: "GAME_RESULT_IMPORTED",
      entityType: "Game",
      entityId: game.id,
      details: {
        source: input.sourceLabel,
        fixtureId: input.fixtureId,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        homeShortName: input.homeShortName,
        awayShortName: input.awayShortName,
      },
    });

    return { fixtureId: input.fixtureId, status: "IMPORTED" as const, homeMatches, awayMatches, gameId: game.id };
  });
}
