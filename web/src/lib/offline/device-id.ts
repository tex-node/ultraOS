// A stable per-browser identifier for SyncIdempotency.deviceId provenance - generated once,
// persisted, reused across sessions. Every offline write site so far has defaulted to a hardcoded
// "local-device" placeholder (LocalScoringRepository's constructor default): harmless while
// nothing actually called drain() against a real deployment, but wiring drain() up for real is the
// first caller where every browser reporting the same fake identity would be a real regression -
// SyncIdempotency rows from two different tablets would be indistinguishable.
const STORAGE_KEY = "ultra-offline-device-id";

export function getOrCreateDeviceId(storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(STORAGE_KEY, id);
  return id;
}
