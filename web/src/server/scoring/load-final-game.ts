import "server-only";

import type { Prisma } from "@/generated/prisma/client";

export type FinalGame = Prisma.GameGetPayload<{
  include: { fixture: true; ruleSnapshot: true };
}>;

// Loads a game with the FOR UPDATE lock on Fixture - the same row loadMutableGame locks, so a
// concurrent live write and a concurrent post-final correction can never race on
// Game.nextEventSequence - and asserts it's FINAL. Deliberately the opposite gate from
// loadMutableGame(): this loader exists specifically for a game that has already ended. A
// still-live game should use the ordinary live correction flow (undo/void/re-record) instead;
// routing it through here would bypass loadMutableGame's LIVE/PAUSED check for no reason.
//
// Verification-stamp reset: NOT the same operation as loadMutableGame's. That one only fires
// when the write is statistician-sourced AND a stamp is currently set, and it logs its own
// dedicated STATISTICS_VERIFICATION_CLEARED audit row. This one is unconditional - a correction
// to an already-verified FINAL game always invalidates the verification, no source check needed
// since every caller here is by definition a statistician correction - and it does not write
// its own audit row; the before/after state is folded into the caller's own correction audit
// entry instead (see correctStatisticianEventPostFinal). Kept local to this loader rather than
// shared with loadMutableGame because the two are genuinely different operations, not the same
// one expressed two ways.
export async function loadFinalGameForCorrection(
  tx: Prisma.TransactionClient,
  gameId: string,
  fixtureId: string,
): Promise<FinalGame> {
  await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
  const game = await tx.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: true, ruleSnapshot: true },
  });
  if (game.fixtureId !== fixtureId) throw new Error("INVALID_EVENT");
  if (game.fixture.status === "CANCELLED" || game.fixture.status === "POSTPONED") throw new Error("GAME_NOT_MUTABLE");
  if (game.status !== "FINAL") throw new Error("GAME_NOT_FINAL_USE_LIVE_CORRECTION_INSTEAD");
  await tx.game.update({ where: { id: gameId }, data: { statisticsVerifiedAt: null, statisticsVerifiedById: null } });
  return game;
}
