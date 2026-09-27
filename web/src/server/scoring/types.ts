import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { EventSource, LedgerSourceHint } from "@/lib/scoring/provenance";

export type { EventSource, LedgerSourceHint };

// Optional refinement the caller can pass to pick the precise StatDataSource ledger value, since
// the live UI has two consoles (scorer vs statistician) that must stay distinguishable.

// The provenance columns a canonical GameEvent carries. All optional: LIVE_UI writes may leave
// them null; sync-replayed writes populate them so the ledger stays auditable and reconstructable.
export interface EventProvenance {
  deviceId?: string | null;
  idempotencyKey?: string | null;
  // When the scorekeeper logged it on-device. Distinct from createdAt (serverReceivedAt) and from
  // the event's own domain time (period/clockSeconds).
  clientUpdatedAt?: string | null;
  syncBatchId?: string | null;
}

// Identity of the acting principal. Kept minimal and transport-agnostic: the caller resolves this
// from its own auth mechanism (Next.js session for server actions, service account for sync).
export interface AuthActor {
  id: string;
  organizationId: string;
}

export interface WriteContext {
  actor: AuthActor;
  source: EventSource;
  // Which live console is writing, so the ledger StatDataSource value stays precise
  // (ULTRA_NATIVE_LIVE_SCORER vs ULTRA_NATIVE_LIVE_STATISTICIAN). Offline/sync writes are always
  // OFFLINE_SYNC regardless of the console they originated on, but the hint is retained on the
  // outbox payload for forensics.
  ledgerSourceHint?: LedgerSourceHint;
  provenance?: EventProvenance;
  // Optional Prisma transaction client. When provided, the service participates in the caller's
  // transaction and never commits on its own. This is what lets the sync endpoint make a
  // 100-record batch atomic without the service knowing whether it was called once (live UI) or a
  // hundred times (replay). See the rule-#6 brief.
  tx?: Prisma.TransactionClient;
}

// A canonical GameEvent write, expressed in domain terms rather than as a raw Prisma input, so the
// service — not the caller — owns sequence assignment and organization scoping.
export interface CreateGameEventInput {
  gameId: string;
  eventType: string;
  period: number;
  clockSeconds: number;
  description: string;
  seasonClubId?: string | null;
  entrantId?: string | null;
  playerId?: string | null;
  fouledPlayerId?: string | null;
  foulType?: string | null;
  causedByEventId?: string | null;
  typeKey?: string | null;
  data?: Prisma.InputJsonValue | null;
  points?: number | null;
  basePointValue?: number | null;
  multiplier?: number | null;
  made?: boolean | null;
  isFourPointAttempt?: boolean;
  isUltraTime?: boolean;
  assistedByPlayerId?: string | null;
  substitutedOutPlayerId?: string | null;
  x?: number | null;
  y?: number | null;
  courtZone?: string | null;
  homeScoreBefore?: number | null;
  awayScoreBefore?: number | null;
  homeScoreAfter?: number | null;
  awayScoreAfter?: number | null;
  // Supersession: a correcting event points back at the event it replaces.
  supersedesEventId?: string | null;
  // Explicit sequence override. Normally omitted — the service assigns the next monotonic value
  // from Game.nextEventSequence. Callers that already reserved a sequence (e.g. the Ultra Time
  // transition, which bumps the counter in the same step) pass it here.
  sequenceNumber?: number | null;
  // When set, the service advances Game.nextEventSequence by 1 as part of the write.
  advanceSequence?: boolean;
}
