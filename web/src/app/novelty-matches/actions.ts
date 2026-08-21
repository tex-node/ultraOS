"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { remainingClockSeconds } from "@/lib/game-clock";
import { prisma } from "@/lib/prisma";

function assertGameIsMutable(status: string, matchStatus: string) {
  if (status === "FINAL" || matchStatus === "FINAL" || matchStatus === "CANCELLED") {
    throw new Error("GAME_NOT_MUTABLE");
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  scheduledAt: z.string().min(1),
  eventId: z.string(),
  venueId: z.string(),
});

export type NoveltyMatchState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

export async function createNoveltyMatch(_s: NoveltyMatchState, formData: FormData): Promise<NoveltyMatchState> {
  const session = await requirePermission("fixture:manage");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (parsed.data.homeTeamId === parsed.data.awayTeamId) return { error: "Home and away teams must be different." };

  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.noveltyMatch.create({
      data: {
        awayTeamId: parsed.data.awayTeamId,
        eventId: parsed.data.eventId || null,
        homeTeamId: parsed.data.homeTeamId,
        name: parsed.data.name,
        scheduledAt: new Date(parsed.data.scheduledAt),
        venueId: parsed.data.venueId || null,
      },
    });
    await writeAuditLog(tx, {
      action: "NOVELTY_MATCH_CREATED",
      details: { awayTeamId: parsed.data.awayTeamId, homeTeamId: parsed.data.homeTeamId, name: parsed.data.name, scheduledAt: parsed.data.scheduledAt },
      entityId: created.id,
      entityType: "NoveltyMatch",
      userId: session.user.id,
    });
    return created;
  });
  revalidatePath("/novelty-matches");
  redirect(`/novelty-matches/${match.id}/live`);
}

export async function startNoveltyGame(matchId: string) {
  await requirePermission("game:operate");
  await prisma.$transaction(async (tx) => {
    const match = await tx.noveltyMatch.findUniqueOrThrow({ where: { id: matchId }, select: { status: true } });
    if (match.status === "CANCELLED" || match.status === "FINAL") throw new Error("INVALID_MATCH");
    await tx.noveltyGame.upsert({
      where: { matchId },
      create: { clockStartedAt: new Date(), matchId, startedAt: new Date(), status: "LIVE" },
      update: { clockStartedAt: new Date(), startedAt: new Date(), status: "LIVE" },
    });
    await tx.noveltyMatch.update({ where: { id: matchId }, data: { status: "LIVE" } });
  });
  revalidatePath(`/novelty-matches/${matchId}/live`);
}

export async function pauseNoveltyGame(gameId: string, matchId: string) {
  await requirePermission("game:operate");
  const game = await prisma.noveltyGame.findUniqueOrThrow({ where: { id: gameId }, include: { match: { select: { status: true } } } });
  assertGameIsMutable(game.status, game.match.status);
  if (game.status !== "LIVE") throw new Error("GAME_NOT_LIVE");
  await prisma.noveltyGame.update({ where: { id: gameId }, data: { clockSecondsRemaining: remainingClockSeconds(game), clockStartedAt: null, status: "PAUSED" } });
  revalidatePath(`/novelty-matches/${matchId}/live`);
}

export async function resumeNoveltyGame(gameId: string, matchId: string) {
  await requirePermission("game:operate");
  const game = await prisma.noveltyGame.findUniqueOrThrow({ where: { id: gameId }, include: { match: { select: { status: true } } } });
  assertGameIsMutable(game.status, game.match.status);
  if (game.status !== "PAUSED") throw new Error("GAME_NOT_PAUSED");
  await prisma.noveltyGame.update({ where: { id: gameId }, data: { clockStartedAt: new Date(), status: "LIVE" } });
  revalidatePath(`/novelty-matches/${matchId}/live`);
}

export async function advanceNoveltyPeriod(gameId: string, matchId: string) {
  await requirePermission("game:operate");
  const game = await prisma.noveltyGame.findUniqueOrThrow({ where: { id: gameId }, include: { match: { select: { status: true } } } });
  assertGameIsMutable(game.status, game.match.status);
  await prisma.noveltyGame.update({ where: { id: gameId }, data: { clockSecondsRemaining: 600, clockStartedAt: null, currentPeriod: { increment: 1 }, status: "PAUSED" } });
  revalidatePath(`/novelty-matches/${matchId}/live`);
}

const scoreSchema = z.object({
  teamId: z.string(),
  playerId: z.string(),
  points: z.coerce.number().int().min(-3).max(3).refine((value) => value !== 0),
  description: z.string(),
});

export async function recordNoveltyScore(gameId: string, matchId: string, formData: FormData) {
  const session = await requirePermission("game:operate");
  const input = scoreSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.$transaction(async (tx) => {
    const game = await tx.noveltyGame.findUniqueOrThrow({ where: { id: gameId }, include: { match: true } });
    assertGameIsMutable(game.status, game.match.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") throw new Error("GAME_NOT_ACTIVE");
    if (![game.match.homeTeamId, game.match.awayTeamId].includes(input.teamId)) throw new Error("INVALID_TEAM");

    const player = input.playerId ? await tx.player.findUnique({ where: { id: input.playerId } }) : null;
    if (input.playerId && !player) throw new Error("INVALID_PLAYER");

    const isHome = input.teamId === game.match.homeTeamId;
    const currentScore = isHome ? game.match.homeScore : game.match.awayScore;
    const nextScore = Math.max(0, currentScore + input.points);
    const actualPoints = nextScore - currentScore;

    await tx.noveltyMatch.update({ where: { id: game.matchId }, data: isHome ? { homeScore: nextScore } : { awayScore: nextScore } });
    await tx.noveltyGameEvent.create({
      data: {
        clockSeconds: remainingClockSeconds(game),
        description: input.description || `${actualPoints > 0 ? "+" : ""}${actualPoints} points`,
        eventType: "SCORE",
        gameId,
        period: game.currentPeriod,
        playerId: player?.id,
        points: actualPoints,
        teamId: input.teamId,
      },
    });

    if (player && actualPoints !== 0) {
      const existing = await tx.noveltyPlayerStat.findUnique({ where: { gameId_playerId: { gameId, playerId: player.id } } });
      await tx.noveltyPlayerStat.upsert({
        create: { gameId, playerId: player.id, points: Math.max(0, actualPoints), teamId: input.teamId },
        update: { points: Math.max(0, (existing?.points ?? 0) + actualPoints) },
        where: { gameId_playerId: { gameId, playerId: player.id } },
      });
    }
    await writeAuditLog(tx, {
      action: actualPoints < 0 ? "NOVELTY_SCORE_CORRECTED" : "NOVELTY_SCORE_CHANGED",
      details: { actualPoints, matchId, newScore: nextScore, playerId: player?.id ?? null, previousScore: currentScore, teamId: input.teamId },
      entityId: gameId,
      entityType: "NoveltyGame",
      userId: session.user.id,
    });
  });

  revalidatePath(`/novelty-matches/${matchId}/live`);
}

const statEventSchema = z.object({
  teamId: z.string(),
  playerId: z.string().min(1),
  eventType: z.enum(["REBOUND", "ASSIST", "STEAL", "BLOCK", "TURNOVER", "FOUL"]),
  // Only meaningful when eventType is FOUL, and even then never required - some fouls
  // (technicals, unclear contact) don't have a clearly attributable other party.
  fouledPlayerId: z.string().optional(),
  foulType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["PERSONAL", "TECHNICAL", "FLAGRANT", "OFFENSIVE"]).optional()),
  description: z.string(),
});

export async function recordNoveltyStatEvent(gameId: string, matchId: string, formData: FormData) {
  await requirePermission("game:operate");
  const input = statEventSchema.parse(Object.fromEntries(formData.entries()));

  await prisma.$transaction(async (tx) => {
    const game = await tx.noveltyGame.findUniqueOrThrow({ where: { id: gameId }, include: { match: true } });
    assertGameIsMutable(game.status, game.match.status);
    if (game.status !== "LIVE" && game.status !== "PAUSED") throw new Error("GAME_NOT_ACTIVE");
    if (![game.match.homeTeamId, game.match.awayTeamId].includes(input.teamId)) throw new Error("INVALID_TEAM");

    const player = await tx.player.findUnique({ where: { id: input.playerId } });
    if (!player) throw new Error("INVALID_PLAYER");

    let fouledPlayerId: string | undefined;
    if (input.eventType === "FOUL" && input.fouledPlayerId) {
      const fouledPlayer = await tx.player.findUnique({ where: { id: input.fouledPlayerId } });
      if (!fouledPlayer) throw new Error("INVALID_FOULED_PLAYER");
      fouledPlayerId = fouledPlayer.id;
    }

    const field = { ASSIST: "assists", BLOCK: "blocks", FOUL: "fouls", REBOUND: "rebounds", STEAL: "steals", TURNOVER: "turnovers" }[input.eventType] as
      "rebounds" | "assists" | "steals" | "blocks" | "turnovers" | "fouls";

    await tx.noveltyGameEvent.create({
      data: {
        clockSeconds: remainingClockSeconds(game),
        description: input.description || input.eventType,
        eventType: input.eventType,
        foulType: input.eventType === "FOUL" ? input.foulType || undefined : undefined,
        fouledPlayerId: input.eventType === "FOUL" ? fouledPlayerId : undefined,
        gameId,
        period: game.currentPeriod,
        playerId: player.id,
        teamId: input.teamId,
      },
    });
    await tx.noveltyPlayerStat.upsert({
      create: { gameId, playerId: player.id, teamId: input.teamId, [field]: 1 },
      update: { [field]: { increment: 1 } },
      where: { gameId_playerId: { gameId, playerId: player.id } },
    });
  });

  revalidatePath(`/novelty-matches/${matchId}/live`);
}

export async function finalizeNoveltyGame(gameId: string, matchId: string) {
  const session = await requirePermission("result:confirm");
  const current = await prisma.noveltyGame.findUniqueOrThrow({ where: { id: gameId }, include: { match: true } });
  assertGameIsMutable(current.status, current.match.status);
  if (current.match.homeScore === current.match.awayScore) {
    redirect(`/novelty-matches/${matchId}/live?error=tied`);
  }

  await prisma.$transaction(async (tx) => {
    const game = await tx.noveltyGame.findUniqueOrThrow({ where: { id: gameId }, include: { match: true } });
    assertGameIsMutable(game.status, game.match.status);
    const winnerTeamId = game.match.homeScore > game.match.awayScore ? game.match.homeTeamId : game.match.awayTeamId;

    await tx.noveltyMatch.update({ where: { id: matchId }, data: { status: "FINAL", winnerTeamId } });
    await tx.noveltyGame.update({ where: { id: gameId }, data: { clockSecondsRemaining: remainingClockSeconds(game), clockStartedAt: null, endedAt: new Date(), status: "FINAL" } });
    await writeAuditLog(tx, {
      action: "NOVELTY_GAME_FINALIZED",
      details: { awayScore: game.match.awayScore, homeScore: game.match.homeScore, matchId, winnerTeamId },
      entityId: gameId,
      entityType: "NoveltyGame",
      userId: session.user.id,
    });
  });

  revalidatePath(`/novelty-matches/${matchId}/live`);
}
