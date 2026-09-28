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
  // (ULTRA_NATIVE_LIVE_SCORER vs ULTRA_NATIVE_LIVE_STATISTICIAN). Load-bearing for OFFLINE_SYNC
  // too, not just LIVE_UI: ledgerSourceFor() resolves a synced statistician event to
  // ULTRA_NATIVE_LIVE_STATISTICIAN, the same value a live write would get, so it stays visible to
  // loadActiveStatisticianEvents/rebuildGameStatsFromEvents/correctStatisticianEvent. Whether the
  // write arrived via sync is recorded separately, on GameEvent.syncBatchId - not on this value.
  ledgerSourceHint?: LedgerSourceHint;
  provenance?: EventProvenance;
  // REQUIRED Prisma transaction client. The service never opens its own transaction. The caller
  // owns the boundary — a single statement for the live UI (via withGameWrite), or a 100-record
  // atomic batch for sync. See the rule-#6 brief.
  tx: Prisma.TransactionClient;
}

// A canonical GameEvent write, expressed in domain terms rather than as a raw Prisma input, so the
// service — not the caller — owns sequence assignment, clock computation, and organization scoping.
export interface CreateGameEventInput {
  // Optional, caller-supplied. Absent for every live-UI site; sync replay supplies the offline
  // client's own client-generated id, so the server creates the row under the same id rather than
  // a new one - see GameEventFields's comment in src/lib/scoring/build-game-event.ts.
  id?: string;
  fixtureId: string; // Required for the FOR UPDATE lock
  gameId: string;
  eventType: string;
  period?: number; // Optional — service computes from game state if not provided
  clockSeconds?: number; // Optional — service computes from game state if not provided (for sync replay, pass the captured value)
  description: string;
  seasonClubId?: string | null;
  entrantId?: string | null;
  playerId?: string | null;
  fouledPlayerId?: string | null;
  foulType?: string | null;
  technicalClass?: string | null; // NCAA-style: Class A vs Class B technicals
  foulTarget?: string | null; // PLAYER, BENCH, or COACH
  freeThrowsAwarded?: number | null; // Number of free throws awarded by a foul
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
}
