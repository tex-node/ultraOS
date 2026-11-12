"""Make the desktop agent authoritative for drain() while keeping IndexedDB as the safety net.

Routing rules (Prompt 4):
  * readPendingBatch / pendingCount: the agent's SQLite when it is present, IndexedDB otherwise.
  * drain(): identical network contract. On success it marks the exact keys on the agent AND deletes the mirrored IndexedDB rows;
    on failure it marks the agent record failed and leaves the mirror alone, so the browser path still has the record.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTBOX = ROOT / "src/lib/offline/outbox.ts"

source = OUTBOX.read_text(encoding="utf-8")

IMPORTS = """import { detectLocalAgent, markSyncedOnAgent, readPendingFromAgent } from "./local-agent";"""

if "markSyncedOnAgent" in source:
    print("outbox: agent routing already present")
    raise SystemExit(0)

# 1. import the agent helpers next to the other local imports
anchor = 'import type { OutboxRecord'
if anchor in source:
    index = source.index(anchor)
    line_end = source.index("\n", index) + 1
    source = source[:line_end] + IMPORTS + "\n" + source[line_end:]
else:
    first_newline = source.index("\n") + 1
    source = source[:first_newline] + IMPORTS + "\n" + source[first_newline:]

# 2. readPendingBatch reads the agent when it is present
old_read = """  const pending = await db.outbox.filter((record) => !record.syncedAt && !record.deadLetteredAt).sortBy("clientUpdatedAt");
    return pending.slice(0, batchSize);"""
new_read = """  // Desktop: the agent owns the queue. Its rows carry the SQLite rowid in localId, so callers must address them by
    // idempotencyKey - which drain() already does when it reads the server's per-key results.
    if (await detectLocalAgent()) {
      const fromAgent = (await readPendingFromAgent()) as OutboxRecord[];
      if (fromAgent.length > 0) {
        return fromAgent.slice(0, batchSize).sort((left, right) => left.clientUpdatedAt.localeCompare(right.clientUpdatedAt));
      }
    }
    const pending = await db.outbox.filter((record) => !record.syncedAt && !record.deadLetteredAt).sortBy("clientUpdatedAt");
    return pending.slice(0, batchSize);"""
if old_read not in source:
    raise SystemExit("readPendingBatch body changed - not patched")
source = source.replace(old_read, new_read, 1)

# 3. pendingCount reads the agent when it is present
old_count = """export async function pendingCount(db: OfflineScoringDatabase = offlineDb): Promise<number> {
  return db.outbox.filter((record) => !record.syncedAt && !record.deadLetteredAt).count();
}"""
new_count = """export async function pendingCount(db: OfflineScoringDatabase = offlineDb): Promise<number> {
  if (await detectLocalAgent()) {
    const pending = await readPendingFromAgent();
    if (pending.length > 0) return pending.length;
  }
  return db.outbox.filter((record) => !record.syncedAt && !record.deadLetteredAt).count();
}"""
if old_count not in source:
    raise SystemExit("pendingCount body changed - not patched")
source = source.replace(old_count, new_count, 1)

# 4. drain: after the server answers, mirror the per-key outcome to the agent and delete the IndexedDB copy of what synced
old_synced = """    if (syncedLocalIds.length > 0) {
      await markSynced(syncedLocalIds, db);
    }"""
new_synced = """    if (syncedLocalIds.length > 0) {
      await markSynced(syncedLocalIds, db);
      // The desktop keeps the record until the SERVER confirms it; once it has, drop the IndexedDB mirror so the next drain does
      // not re-send it. Matched by idempotencyKey, not localId, because the agent's rows carry SQLite rowids.
      const syncedKeys = batch
        .filter((record) => syncedLocalIds.includes(record.localId!))
        .map((record) => record.idempotencyKey);
      await markSyncedOnAgent(syncedKeys, "APPLIED");
      if (syncedKeys.length > 0) {
        await db.outbox.where("idempotencyKey").anyOf(syncedKeys).delete();
      }
    }

    // Failures are mirrored to the agent too, but the IndexedDB copy stays: if the agent dies mid-game the browser path is the
    // only thing left holding the record, and deleting it here would be the exact data loss this design exists to prevent.
    const failedRecords = batch.filter((record) => !syncedLocalIds.includes(record.localId!));
    for (const record of failedRecords) {
      const result = resultByKey.get(record.idempotencyKey);
      await markSyncedOnAgent(
        [record.idempotencyKey],
        result?.status === "CONFLICT" ? "CONFLICT" : "FAILED",
        result ? JSON.stringify(result.detail ?? "FAILED") : "NO_RESULT_FROM_SERVER",
      );
    }"""
if old_synced not in source:
    raise SystemExit("drain synced block changed - not patched")
source = source.replace(old_synced, new_synced, 1)

OUTBOX.write_text(source, encoding="utf-8", newline="\n")
print("outbox: agent-authoritative reads, per-key marks, mirror cleanup")
