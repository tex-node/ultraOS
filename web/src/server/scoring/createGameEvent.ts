import "server-only";

import { remainingClockSeconds } from "@/lib/game-clock";
import { ledgerSourceFor } from "@/lib/scoring/provenance";
import { buildGameEventCreateData } from "@/lib/scoring/build-game-event";
import { loadMutableGame } from "./load-mutable-game";
import type { CreateGameEventInput, WriteContext } from "./types";

// The single canonical write path for a GameEvent. Three callers, one function:
//   - the live UI server actions (source: LIVE_UI)
//   - the sync replay endpoint (source: OFFLINE_SYNC, tx supplied, called in a loop)
//   - the vision promotion seam (source: VISION_PROMOTED) — B4
//
// The service owns the ENTIRE canonical write:
//   1. Lock Fixture (FOR UPDATE) + load game + assert mutable/active
//   2. Clear verification stamp for statistician writes (with audit log)
//   3. Compute remainingClockSeconds (if not provided)
//   4. Assign sequence number (increment counter, use old value)
//   5. Insert GameEvent with source mapping + provenance columns
//
// `ctx.tx` is REQUIRED: this function never opens its own transaction. The caller owns the
// boundary — a single statement for the live UI, or a 100-record atomic batch for sync. The
// service stays idempotency-agnostic; the SyncIdempotency insert lives in the sync endpoint,
// inside the same transaction (see docs/canonical-write-audit.md and the rule-#6 brief).
export async function createGameEvent(
  input: CreateGameEventInput,
  ctx: WriteContext,
): Promise<{ id: string; sequenceNumber: number }> {
  const tx = ctx.tx;

  // 1. Load mutable game (lock + mutable check + verification-stamp clearing)
  const game = await loadMutableGame(
    tx,
    ctx.actor.organizationId,
    input.gameId,
    input.fixtureId,
    ctx.actor.id,
    ctx.source,
    ctx.ledgerSourceHint,
  );

  // 2. Compute clock (use provided value for sync replay, otherwise compute from game state)
  const clockSeconds = input.clockSeconds ?? remainingClockSeconds(game);

  // 3. Assign sequence (increment counter, use old value — matches the old `nextSequence` helper)
  const sequenceNumber = game.nextEventSequence;
  await tx.game.update({
    where: { id: input.gameId },
    data: { nextEventSequence: { increment: 1 } },
  });

  // 4. Validate seasonClubId if provided
  if (input.seasonClubId) {
    const homeId = game.fixture.homeSeasonClubId;
    const awayId = game.fixture.awaySeasonClubId;
    if (input.seasonClubId !== homeId && input.seasonClubId !== awayId) {
      throw new Error("INVALID_TEAM");
    }
  }

  // 5. Insert
  const created = await tx.gameEvent.create({
    data: buildGameEventCreateData(
      { ...input, clockSeconds, sequenceNumber, period: input.period ?? game.currentPeriod },
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        source: ledgerSourceFor(ctx.source, ctx.ledgerSourceHint),
        provenance: ctx.provenance,
      },
    ),
    select: { id: true, sequenceNumber: true },
  });

  return { id: created.id, sequenceNumber: created.sequenceNumber ?? sequenceNumber };
}
