import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { OutboxRecord } from "@/lib/sync/outbox-schema";

// Authorization pre-check scope: every game the batch touches, checked before any record is
// processed - not resolved lazily per-record as processing reaches it (see route.ts).
//
// Mechanism: SYNTHESIZED REFERENCE. A Game record's payload carries fixtureId directly. A
// GameEvent record only carries gameId (LocalGameEvent's actual shape - checked, not assumed).
// Rather than deferring that GameEvent's authorization check until after its Game has been
// created (which would mean enforcing auth mid-batch, breaking the "reject the whole batch before
// touching the DB" contract), this resolves the GameEvent's fixtureId from the in-batch Game
// CREATE record's own payload - the client-side reference is "synthesized" into a fixtureId
// without needing that Game to exist in the DB yet. Only a GameEvent whose gameId does NOT match
// any in-batch Game record falls back to a DB lookup (the game already exists from an earlier,
// already-synced batch).
//
// Contract this establishes for Commit 3's replay loop: by the time authorization has passed,
// every fixture any record in the batch touches - whether that record's own game already exists
// or is being created earlier in this same batch - has been checked. The replay loop can trust
// this and does not need to defensively re-check authorization per record.
export async function resolveFixtureIdsToAuthorize(tx: Prisma.TransactionClient, records: OutboxRecord[]): Promise<Set<string>> {
  const fixtureIds = new Set<string>();
  const fixtureIdByGameId = new Map<string, string>();

  for (const record of records) {
    if (record.entityType !== "Game") continue;
    const payload = record.payload as { fixtureId?: unknown } | null;
    const fixtureId = typeof payload?.fixtureId === "string" ? payload.fixtureId : undefined;
    if (fixtureId) {
      fixtureIds.add(fixtureId);
      fixtureIdByGameId.set(record.entityId, fixtureId);
    }
  }

  const unresolvedGameIds = new Set<string>();
  for (const record of records) {
    if (record.entityType !== "GameEvent") continue;
    const payload = record.payload as { gameId?: unknown } | null;
    const gameId = typeof payload?.gameId === "string" ? payload.gameId : undefined;
    if (!gameId) continue;
    const knownFixtureId = fixtureIdByGameId.get(gameId);
    if (knownFixtureId) {
      fixtureIds.add(knownFixtureId);
    } else {
      unresolvedGameIds.add(gameId);
    }
  }

  if (unresolvedGameIds.size > 0) {
    const games = await tx.game.findMany({
      where: { id: { in: [...unresolvedGameIds] } },
      select: { fixtureId: true },
    });
    for (const game of games) fixtureIds.add(game.fixtureId);
  }

  return fixtureIds;
}
