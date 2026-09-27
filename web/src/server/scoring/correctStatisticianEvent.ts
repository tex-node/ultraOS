import "server-only";

import type { GameEvent } from "@/generated/prisma/client";
import { ledgerSourceFor } from "@/lib/scoring/provenance";
import { buildGameEventCreateData } from "@/lib/scoring/build-game-event";
import { assignNextSequence } from "./sequence";
import type { CreateGameEventInput, WriteContext } from "./types";
import type { FinalGame } from "./load-final-game";

// A fixed ledger value, not derived from `ctx` - this checks a historical fact about the
// ORIGINAL event ("was this ever a statistician write"), which is independent of who is
// performing the current correction. Every post-final correction today is itself LIVE_UI +
// STATISTICIAN, but that's a fact about the caller, not about what the original event must be.
const STATISTICIAN_LEDGER_SOURCE = ledgerSourceFor("LIVE_UI", "STATISTICIAN");

export type CorrectStatisticianEventInput =
  | {
      mode: "REPLACE";
      originalEventId: string;
      reason: string;
      // period/clockSeconds are required (not defaulted the way createGameEvent defaults them
      // from current game state) because "current" is meaningless for a FINAL game - the
      // caller must freeze these to the ORIGINAL event's own domain time.
      replacement: Omit<CreateGameEventInput, "gameId" | "fixtureId" | "supersedesEventId" | "period" | "clockSeconds"> & {
        period: number;
        clockSeconds: number;
      };
    }
  | { mode: "VOID"; originalEventId: string; reason: string };

export type CorrectionResult =
  | { mode: "REPLACE"; original: GameEvent; replacement: GameEvent }
  | { mode: "VOID"; original: GameEvent };

// The sibling to createGameEvent for the one shape it can't express: a FINAL game, a mutation
// of an existing event (not just an insert), and - for VOID - no insert at all. See
// docs/canonical-write-audit.md, "Sites that don't fit createGameEvent."
export async function correctStatisticianEvent(
  input: CorrectStatisticianEventInput,
  ctx: WriteContext & { game: FinalGame },
): Promise<CorrectionResult> {
  const tx = ctx.tx;

  // Scoped by gameId + source + status, same discipline as recordStatisticianShot's
  // causedByEventId lookup: a correction can only target an ACTIVE statistician event from
  // THIS game. Kept as three separate checks (not one collapsed compound-where) so a rejection
  // tells the caller exactly which precondition failed - matching current behavior exactly,
  // not just the same outcome.
  const original = await tx.gameEvent.findUniqueOrThrow({ where: { id: input.originalEventId } });
  if (original.gameId !== ctx.game.id) throw new Error("INVALID_EVENT");
  if (original.source !== STATISTICIAN_LEDGER_SOURCE) throw new Error("NOT_A_STATISTICIAN_EVENT");
  if (original.status !== "ACTIVE") throw new Error("EVENT_NOT_ACTIVE");

  if (input.mode === "VOID") {
    const voided = await tx.gameEvent.update({
      where: { id: original.id },
      data: {
        status: "VOIDED",
        correctedAt: new Date(),
        correctedById: ctx.actor.id,
        correctionReason: input.reason,
      },
    });
    return { mode: "VOID", original: voided };
  }

  const sequenceNumber = await assignNextSequence(tx, ctx.game.id, ctx.game.nextEventSequence);
  const replacement = await tx.gameEvent.create({
    data: buildGameEventCreateData(
      {
        ...input.replacement,
        gameId: ctx.game.id,
        sequenceNumber,
        supersedesEventId: original.id,
      },
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        source: ledgerSourceFor(ctx.source, ctx.ledgerSourceHint),
        provenance: ctx.provenance,
      },
    ),
  });

  const corrected = await tx.gameEvent.update({
    where: { id: original.id },
    data: {
      status: "CORRECTED",
      correctedAt: new Date(),
      correctedById: ctx.actor.id,
      correctionReason: input.reason,
    },
  });

  return { mode: "REPLACE", original: corrected, replacement };
}
