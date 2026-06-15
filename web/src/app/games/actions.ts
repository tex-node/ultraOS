"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { remainingClockSeconds } from "@/lib/game-clock";
import { prisma } from "@/lib/prisma";
import { recalculateStandings } from "@/lib/standings";

function assertGameIsMutable(status: string, fixtureStatus: string) {
  if (
    status === "FINAL" ||
    fixtureStatus === "FINAL" ||
    fixtureStatus === "CANCELLED"
  ) {
    throw new Error("GAME_NOT_MUTABLE");
  }
}

export async function startGame(fixtureId: string) {
  await requirePermission("game:operate");
  await prisma.$transaction(async (tx) => {
    const fixture = await tx.fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      select: { status: true },
    });
    if (fixture.status === "CANCELLED" || fixture.status === "FINAL") {
      throw new Error("INVALID_FIXTURE");
    }
    await tx.game.upsert({
      where: { fixtureId },
      create: {
        fixtureId,
        status: "LIVE",
        startedAt: new Date(),
        clockStartedAt: new Date(),
      },
      update: {
        status: "LIVE",
        startedAt: new Date(),
        clockStartedAt: new Date(),
      },
    });
    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "LIVE" },
    });
  });
  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
}

export async function pauseGame(gameId: string, fixtureId: string) {
  await requirePermission("game:operate");
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: { select: { status: true } } },
  });
  assertGameIsMutable(game.status, game.fixture.status);
  if (game.status !== "LIVE") throw new Error("GAME_NOT_LIVE");

  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: "PAUSED",
      clockSecondsRemaining: remainingClockSeconds(game),
      clockStartedAt: null,
    },
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

export async function resumeGame(gameId: string, fixtureId: string) {
  await requirePermission("game:operate");
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: { select: { status: true } } },
  });
  assertGameIsMutable(game.status, game.fixture.status);
  if (game.status !== "PAUSED") throw new Error("GAME_NOT_PAUSED");

  await prisma.game.update({
    where: { id: gameId },
    data: { status: "LIVE", clockStartedAt: new Date() },
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

export async function advancePeriod(gameId: string, fixtureId: string) {
  await requirePermission("game:operate");
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: { select: { status: true } } },
  });
  assertGameIsMutable(game.status, game.fixture.status);

  await prisma.game.update({
    where: { id: gameId },
    data: {
      currentPeriod: { increment: 1 },
      clockSecondsRemaining: 600,
      clockStartedAt: null,
      status: "PAUSED",
    },
  });
  revalidatePath(`/games/${fixtureId}/live`);
}

const score = z.object({
  seasonClubId: z.string(),
  playerId: z.string(),
  points: z.coerce.number().int().min(-3).max(3).refine((value) => value !== 0),
  description: z.string(),
});

export async function recordScore(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  const session = await requirePermission("game:operate");
  const input = score.parse(Object.fromEntries(formData.entries()));

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") {
      throw new Error("GAME_NOT_ACTIVE");
    }
    if (
      ![
        game.fixture.homeSeasonClubId,
        game.fixture.awaySeasonClubId,
      ].includes(input.seasonClubId)
    ) {
      throw new Error("INVALID_TEAM");
    }

    const player = input.playerId
      ? await tx.player.findFirst({
          where: {
            id: input.playerId,
            seasonClubId: input.seasonClubId,
          },
        })
      : null;
    if (input.playerId && !player) throw new Error("INVALID_PLAYER");

    const isHome = input.seasonClubId === game.fixture.homeSeasonClubId;
    const currentScore = isHome
      ? game.fixture.homeScore
      : game.fixture.awayScore;
    const nextScore = Math.max(0, currentScore + input.points);
    const actualPoints = nextScore - currentScore;

    await tx.fixture.update({
      where: { id: game.fixtureId },
      data: isHome ? { homeScore: nextScore } : { awayScore: nextScore },
    });
    await tx.gameEvent.create({
      data: {
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: player?.id,
        eventType: "SCORE",
        points: actualPoints,
        period: game.currentPeriod,
        clockSeconds: remainingClockSeconds(game),
        description:
          input.description ||
          `${actualPoints > 0 ? "+" : ""}${actualPoints} points`,
      },
    });

    if (player && actualPoints !== 0) {
      const existing = await tx.playerStat.findUnique({
        where: { gameId_playerId: { gameId, playerId: player.id } },
      });
      await tx.playerStat.upsert({
        where: { gameId_playerId: { gameId, playerId: player.id } },
        create: {
          gameId,
          playerId: player.id,
          seasonClubId: input.seasonClubId,
          points: Math.max(0, actualPoints),
        },
        update: {
          points: Math.max(0, (existing?.points ?? 0) + actualPoints),
        },
      });
    }
    await tx.teamStat.upsert({
      where: {
        gameId_seasonClubId: {
          gameId,
          seasonClubId: input.seasonClubId,
        },
      },
      create: {
        gameId,
        seasonClubId: input.seasonClubId,
        points: nextScore,
      },
      update: { points: nextScore },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: actualPoints < 0 ? "SCORE_CORRECTED" : "SCORE_CHANGED",
      entityType: "Game",
      entityId: gameId,
      details: {
        fixtureId,
        seasonClubId: input.seasonClubId,
        playerId: player?.id ?? null,
        requestedPoints: input.points,
        actualPoints,
        previousScore: currentScore,
        newScore: nextScore,
        description: input.description,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/scoreboard/${gameId}`);
}

const statEvent = z.object({
  seasonClubId: z.string(),
  playerId: z.string().min(1),
  eventType: z.enum([
    "REBOUND",
    "ASSIST",
    "STEAL",
    "BLOCK",
    "TURNOVER",
    "FOUL",
  ]),
  description: z.string(),
});

export async function recordStatEvent(
  gameId: string,
  fixtureId: string,
  formData: FormData,
) {
  await requirePermission("game:operate");
  const input = statEvent.parse(Object.fromEntries(formData.entries()));

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") {
      throw new Error("GAME_NOT_ACTIVE");
    }
    if (
      ![
        game.fixture.homeSeasonClubId,
        game.fixture.awaySeasonClubId,
      ].includes(input.seasonClubId)
    ) {
      throw new Error("INVALID_TEAM");
    }

    const player = await tx.player.findFirst({
      where: {
        id: input.playerId,
        seasonClubId: input.seasonClubId,
      },
    });
    if (!player) throw new Error("INVALID_PLAYER");

    const field = {
      REBOUND: "rebounds",
      ASSIST: "assists",
      STEAL: "steals",
      BLOCK: "blocks",
      TURNOVER: "turnovers",
      FOUL: "fouls",
    }[input.eventType] as
      | "rebounds"
      | "assists"
      | "steals"
      | "blocks"
      | "turnovers"
      | "fouls";

    await tx.gameEvent.create({
      data: {
        gameId,
        seasonClubId: input.seasonClubId,
        playerId: player.id,
        eventType: input.eventType,
        period: game.currentPeriod,
        clockSeconds: remainingClockSeconds(game),
        description: input.description || input.eventType,
      },
    });
    await tx.playerStat.upsert({
      where: { gameId_playerId: { gameId, playerId: player.id } },
      create: {
        gameId,
        playerId: player.id,
        seasonClubId: input.seasonClubId,
        [field]: 1,
      },
      update: { [field]: { increment: 1 } },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
}

export async function finalizeGame(gameId: string, fixtureId: string) {
  const session = await requirePermission("result:confirm");
  const current = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: true },
  });
  assertGameIsMutable(current.status, current.fixture.status);
  if (current.fixture.homeScore === current.fixture.awayScore) {
    redirect(`/games/${fixtureId}/live?error=tied`);
  }

  await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { fixture: true },
    });
    assertGameIsMutable(game.status, game.fixture.status);
    const winnerSeasonClubId =
      game.fixture.homeScore > game.fixture.awayScore
        ? game.fixture.homeSeasonClubId
        : game.fixture.awaySeasonClubId;

    await tx.fixture.update({
      where: { id: fixtureId },
      data: { status: "FINAL", winnerSeasonClubId },
    });
    await tx.game.update({
      where: { id: gameId },
      data: {
        status: "FINAL",
        endedAt: new Date(),
        clockSecondsRemaining: remainingClockSeconds(game),
        clockStartedAt: null,
      },
    });
    await recalculateStandings(tx, game.fixture.seasonId);
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "STANDINGS_RECALCULATED",
      entityType: "Season",
      entityId: game.fixture.seasonId,
      details: { trigger: "GAME_FINALIZED", gameId, fixtureId },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "GAME_FINALIZED",
      entityType: "Game",
      entityId: gameId,
      details: {
        fixtureId,
        homeScore: game.fixture.homeScore,
        awayScore: game.fixture.awayScore,
        winnerSeasonClubId,
      },
    });
  });

  revalidatePath(`/games/${fixtureId}/live`);
  revalidatePath(`/fixtures/${fixtureId}`);
  revalidatePath("/standings");
  revalidatePath(`/scoreboard/${gameId}`);
}
