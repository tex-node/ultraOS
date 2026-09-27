// Pure scoring helpers shared by client and server (no Prisma, no server-only). The derived
// PlayerStat projection lives here so the client can project local events for fast UI while the
// server projects canonical events after each sync batch. A3b/A3c fill in the projection; this
// module starts with the provenance mapping that both sides agree on.

export type EventSource = "LIVE_UI" | "OFFLINE_SYNC" | "VISION_PROMOTED" | "MANUAL_ADMIN";
export type LedgerSourceHint = "SCORER" | "STATISTICIAN";

// Maps the transport-level EventSource to the canonical GameEvent.source (StatDataSource) ledger
// value. Pure and shared, so the value never depends on which caller produced the write.
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
      return "OFFLINE_SYNC";
    case "VISION_PROMOTED":
      return "EXTERNAL_PROVIDER";
    case "MANUAL_ADMIN":
      return "MANUAL_ADMIN_ENTRY";
    case "LIVE_UI":
      return hint === "STATISTICIAN" ? "ULTRA_NATIVE_LIVE_STATISTICIAN" : "ULTRA_NATIVE_LIVE_SCORER";
  }
}
