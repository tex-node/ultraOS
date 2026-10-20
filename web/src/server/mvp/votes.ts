import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

// Fan MVP voting (streak v12, Prompt 4).
//
// Two rules shape this file:
//   1. A vote is for a PERFORMER IN THAT GAME. The candidates are computed from the box score, so a vote cannot be
//      cast for a player who did not play, and the UI never offers a name that has no claim to the award.
//   2. One vote per user per game is a database UNIQUE, not an if-statement. The action catches the conflict and
//      reports it as "already voted" rather than pretending to count a second vote.
export type MvpCandidate = {
  playerId: string;
  athleteId: string;
  name: string;
  clubShortName: string | null;
  points: number;
  rebounds: number;
  assists: number;
  score: number;
  votes: number;
};

/** The three performers the voters choose between: most points, then the best all-round line. */
export async function mvpCandidates(prisma: PrismaClient | Prisma.TransactionClient, gameId: string): Promise<MvpCandidate[]> {
  const stats = await prisma.playerStat.findMany({
    where: { gameId },
    select: {
      playerId: true,
      points: true,
      rebounds: true,
      assists: true,
      player: {
        select: {
          athleteId: true,
          athlete: { select: { firstName: true, lastName: true } },
          seasonClub: { select: { club: { select: { shortName: true } } } },
        },
      },
    },
  });
  if (stats.length === 0) return [];

  const votes = await prisma.mVPVote.groupBy({ by: ["playerId"], where: { gameId }, _count: { playerId: true } });
  const votesByPlayer = new Map(votes.map((entry) => [entry.playerId, entry._count.playerId]));

  return stats
    .map((stat) => ({
      playerId: stat.playerId,
      athleteId: stat.player.athleteId,
      name: `${stat.player.athlete.firstName} ${stat.player.athlete.lastName}`.trim(),
      clubShortName: stat.player.seasonClub?.club.shortName ?? null,
      points: stat.points,
      rebounds: stat.rebounds,
      assists: stat.assists,
      // A simple, stated ranking: points first, then rebounds and assists at half weight. Not a claim of being the
      // best metric - it is the shortlist rule, and it is written down so a fan can see why these three.
      score: stat.points + stat.rebounds * 0.5 + stat.assists * 0.5,
      votes: votesByPlayer.get(stat.playerId) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.votes - a.votes || a.name.localeCompare(b.name))
    .slice(0, 3);
}

export type CastVoteResult = { ok: true } | { ok: false; reason: "NOT_FINAL" | "NOT_A_CANDIDATE" | "ALREADY_VOTED" };

export async function castMvpVote(args: {
  prisma: Prisma.TransactionClient;
  organizationId: string;
  userId: string;
  gameId: string;
  playerId: string;
}): Promise<CastVoteResult> {
  const { prisma: tx } = args;
  const game = await tx.game.findFirst({
    where: { id: args.gameId, organizationId: args.organizationId },
    select: { status: true, fixture: { select: { status: true } } },
  });
  if (!game || (game.status !== "FINAL" && game.fixture.status !== "FINAL")) return { ok: false, reason: "NOT_FINAL" };

  const candidates = await mvpCandidates(tx, args.gameId);
  if (!candidates.some((candidate) => candidate.playerId === args.playerId)) return { ok: false, reason: "NOT_A_CANDIDATE" };

  try {
    await tx.mVPVote.create({
      data: { organizationId: args.organizationId, userId: args.userId, gameId: args.gameId, playerId: args.playerId },
    });
    return { ok: true };
  } catch (error) {
    // P2002 is the (userId, gameId) unique: the fan already voted in this game.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, reason: "ALREADY_VOTED" };
    throw error;
  }
}

/** How many MVP awards an athlete has: the votes their performances won. */
export async function mvpAwardCount(prisma: PrismaClient | Prisma.TransactionClient, organizationId: string, athleteId: string): Promise<number> {
  return prisma.mVPVote.count({ where: { organizationId, player: { athleteId } } });
}

/** Whether this user has already voted in this game (the UI shows the result instead of the buttons). */
export async function hasVoted(prisma: PrismaClient | Prisma.TransactionClient, userId: string, gameId: string): Promise<boolean> {
  const vote = await prisma.mVPVote.findFirst({ where: { userId, gameId }, select: { id: true } });
  return vote !== null;
}
