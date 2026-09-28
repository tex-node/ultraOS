import "server-only";

import type { GameEvent } from "@/generated/prisma/client";
import { buildVoidData } from "@/lib/scoring/void-data";
import type { WriteContext } from "./types";
import type { MutableGame } from "./load-mutable-game";

// The third and final canonical-write service shape: a status-flip, under the mutable (LIVE/
// PAUSED) gate. Source-agnostic by design - "only statisticians can void statistician events" is
// an authorization/selection question, not a write mechanic, so it stays in the caller's target-
// selection query, not here. This service trusts the eventId it's given: the caller resolves it
// inside the same transaction, under the same Fixture FOR UPDATE lock withGameWrite already
// took, so nothing can change between that resolution and this write. No redundant re-lookup.
export async function voidGameEvent(
  eventId: string,
  reason: string,
  ctx: WriteContext & { game: MutableGame },
): Promise<GameEvent> {
  return ctx.tx.gameEvent.update({
    where: { id: eventId },
    data: buildVoidData(reason, ctx.actor.id),
  });
}
