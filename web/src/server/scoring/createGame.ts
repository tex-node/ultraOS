import "server-only";

import type { Game } from "@/generated/prisma/client";
import type { WriteContext } from "./types";

export interface CreateGameInput {
  // Caller-supplied, not server-generated: the offline client needs a stable id for this game
  // before it has ever synced, so it can attach GameEvents to it in the same offline session.
  id: string;
  fixtureId: string;
  status?: "NOT_STARTED" | "LIVE" | "PAUSED" | "FINAL";
  currentPeriod?: number;
  clockSecondsRemaining?: number;
  shotClockSecondsRemaining?: number;
}

// A3b Commit 3: the sync-replay counterpart to startGame (actions.ts). Not the same shape and
// deliberately not reused: startGame resolves the competition's rule-derived clock/period
// structure from the season's rule set before creating the Game - the offline client's own
// CreateGameInput carries no rule data at all, so replaying it 1:1 (this service's own defaults,
// matching LocalScoringRepository.createGame's defaults exactly) is the correct match, not an
// approximation of startGame's richer behavior. `Game.fixtureId` is `@unique` - if a game already
// exists for this fixture (e.g. started live on another device while this one was offline), the
// insert throws a unique-constraint violation, which the replay caller converts to a FAILED
// result. Resolving that as an intelligent conflict rather than a bare failure is Commit 4's
// LWW/SyncConflictLog scope, not this one's.
export async function createGame(input: CreateGameInput, ctx: WriteContext): Promise<Game> {
  return ctx.tx.game.create({
    data: {
      id: input.id,
      organizationId: ctx.actor.organizationId,
      fixtureId: input.fixtureId,
      status: input.status ?? "NOT_STARTED",
      currentPeriod: input.currentPeriod ?? 1,
      clockSecondsRemaining: input.clockSecondsRemaining ?? 600,
      shotClockSecondsRemaining: input.shotClockSecondsRemaining ?? 20,
    },
  });
}
