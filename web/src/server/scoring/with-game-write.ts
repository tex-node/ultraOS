import "server-only";

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
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
    // Injected, not always the global singleton - same "caller owns which client opens the
    // transaction" rule replayOutboxRecord's own ReplayContext.prisma follows (see that file's
    // comment on why: a DB-integration test's isolated schema is invisible to the global `prisma`
    // singleton, which is built once from process.env.DATABASE_URL at module load with no
    // `{schema}` option). Defaults to the global singleton so every existing LIVE_UI call site is
    // unaffected.
    prisma?: PrismaClient;
  },
  fn: (writeCtx: WriteContext & { game: MutableGame }) => Promise<T>,
): Promise<T> {
  const client = ctx.prisma ?? defaultPrisma;
  return client.$transaction(async (tx) => {
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
