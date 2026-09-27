import "server-only";

import { prisma } from "@/lib/prisma";
import { loadMutableGame, type MutableGame } from "./load-mutable-game";
import type { AuthActor, EventSource, LedgerSourceHint, WriteContext } from "./types";

// Opens a transaction, loads the game under FOR UPDATE lock, and passes the locked game to the
// callback. This prevents the double-load pattern where the caller loads the game (without lock)
// to compute event fields, then the service loads it again (with lock) — which can cause stale
// descriptions if two concurrent calls race.
//
// Callers must derive event fields (descriptions, computed values) from the locked game passed
// to the callback, not from a separate load outside the transaction.
export async function withGameWrite<T>(
  gameId: string,
  fixtureId: string,
  ctx: {
    actor: AuthActor;
    source: EventSource;
    ledgerSourceHint?: LedgerSourceHint;
  },
  fn: (writeCtx: WriteContext & { game: MutableGame }) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const game = await loadMutableGame(
      tx,
      ctx.actor.organizationId,
      gameId,
      fixtureId,
      ctx.actor.id,
      ctx.source,
      ctx.ledgerSourceHint,
    );
    return fn({ ...ctx, tx, game });
  });
}
