// Pure scoring helpers shared by client and server (no Prisma, no server-only). The derived
// PlayerStat projection lives here so the client can project local events for fast UI while the
// server projects canonical events after each sync batch. A3b/A3c fill in the projection; this
// module starts with the provenance mapping that both sides agree on.

export type EventSource = "LIVE_UI" | "OFFLINE_SYNC" | "VISION_PROMOTED" | "MANUAL_ADMIN";
export type LedgerSourceHint = "SCORER" | "STATISTICIAN";

// Maps the transport-level EventSource to the canonical GameEvent.source (StatDataSource) ledger
// value. Pure and shared, so the value never depends on which caller produced the write.
//
// `source` records WHO logged the event (which console); it is transport-stable - the same hint
// produces the same ledger value whether the write arrived live or via offline sync. WHETHER it
// arrived via sync is a separate question, answered by the persisted GameEvent.syncBatchId column
// (non-null iff the row arrived through the offline outbox), not by this value. Collapsing both
// questions into one enum was tried first and reverted: `loadActiveStatisticianEvents` and
// `rebuildGameStatsFromEvents` (stats-actions.ts) filter on the literal
// ULTRA_NATIVE_LIVE_STATISTICIAN, and `correctStatisticianEvent` gates on it too - a synced
// statistician event that lost its hint here would be invisible to the live box score, never get
// materialized by verifyStatistics, and become uncorrectable.
export function ledgerSourceFor(
  source: EventSource,
  hint?: LedgerSourceHint,
):
  | "OFFLINE_SYNC"
  | "EXTERNAL_PROVIDER"
  | "MANUAL_ADMIN_ENTRY"
  | "ULTRA_NATIVE_LIVE_SCORER"
  | "ULTRA_NATIVE_LIVE_STATISTICIAN" {
  switch (source) {
    case "OFFLINE_SYNC":
      // Scoring sync always carries a hint (the client knows which console logged the event it's
      // replaying), so this resolves the same as LIVE_UI below. The bare "OFFLINE_SYNC" fallback
      // is reserved for a sync entity with no semantic origin hint - no scoring caller emits one
      // today. Any future caller that needs it should get a design note first, not silently rely
      // on this default.
      if (hint === "STATISTICIAN") return "ULTRA_NATIVE_LIVE_STATISTICIAN";
      if (hint === "SCORER") return "ULTRA_NATIVE_LIVE_SCORER";
      return "OFFLINE_SYNC";
    case "VISION_PROMOTED":
      return "EXTERNAL_PROVIDER";
    case "MANUAL_ADMIN":
      return "MANUAL_ADMIN_ENTRY";
    case "LIVE_UI":
      return hint === "STATISTICIAN" ? "ULTRA_NATIVE_LIVE_STATISTICIAN" : "ULTRA_NATIVE_LIVE_SCORER";
  }
}
