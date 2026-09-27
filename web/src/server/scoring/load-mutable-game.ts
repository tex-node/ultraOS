import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import type { EventSource, LedgerSourceHint } from "./types";

export type MutableGame = Prisma.GameGetPayload<{
  include: { fixture: true; ruleSnapshot: true };
}>;

export class GameNotMutableError extends Error {
  constructor(message = "GAME_NOT_MUTABLE") {
    super(message);
    this.name = "GameNotMutableError";
  }
}

export class GameNotActiveError extends Error {
  constructor(message = "GAME_NOT_ACTIVE") {
    super(message);
    this.name = "GameNotActiveError";
  }
}

export class InvalidEventError extends Error {
  constructor(message = "INVALID_EVENT") {
    super(message);
    this.name = "InvalidEventError";
  }
}

function assertGameIsMutable(status: string, fixtureStatus: string) {
  if (status === "FINAL" || fixtureStatus === "FINAL" || fixtureStatus === "CANCELLED" || fixtureStatus === "POSTPONED") {
    throw new GameNotMutableError();
  }
}

// Loads a game with the FOR UPDATE lock on Fixture, asserts it's mutable and active, and clears
// the verification stamp for statistician writes. This is the canonical pre-write state load.
export async function loadMutableGame(
  tx: Prisma.TransactionClient,
  organizationId: string,
  gameId: string,
  fixtureId: string,
  actorId: string,
  source: EventSource,
  ledgerSourceHint?: LedgerSourceHint,
) {
  // Locks the same row the scorer console locks (Fixture, not Game) so a concurrent scorer
  // write and a concurrent statistician write can never both read the same
  // Game.nextEventSequence value before either commits - true mutual exclusion requires both
  // consoles to serialize through one shared lock, even though this path never writes Fixture.
  await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
  const game = await tx.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: true, ruleSnapshot: true },
  });
  assertGameIsMutable(game.status, game.fixture.status);
  if (game.status !== "LIVE" && game.status !== "PAUSED") {
    throw new GameNotActiveError();
  }
  if (game.fixtureId !== fixtureId) throw new InvalidEventError();

  // Part XXXIV: statistics that have been VERIFIED must not silently keep that badge once the
  // underlying ledger changes again. Rather than hard-blocking every post-verification entry
  // (which would make correcting a statistician's own mistake impossible without reopening the
  // whole game), any new statistician write automatically clears the stale verification stamp
  // - the reconciliation panel then honestly shows "needs re-verification" instead of a lying
  // green badge. The clearing itself is audited, same as the verification was.
  //
  // Only clear for statistician writes (LIVE_UI + STATISTICIAN hint, or OFFLINE_SYNC with STATISTICIAN hint).
  const isStatisticianWrite =
    (source === "LIVE_UI" && ledgerSourceHint === "STATISTICIAN") ||
    (source === "OFFLINE_SYNC" && ledgerSourceHint === "STATISTICIAN");
  
  if (isStatisticianWrite && game.statisticsVerifiedAt) {
    await tx.game.update({ where: { id: gameId }, data: { statisticsVerifiedAt: null, statisticsVerifiedById: null } });
    await writeAuditLog(tx, {
      organizationId,
      userId: actorId,
      action: "STATISTICS_VERIFICATION_CLEARED",
      entityType: "Game",
      entityId: gameId,
      details: { fixtureId, reason: "New statistician event recorded after verification" },
    });
  }

  return game;
}
