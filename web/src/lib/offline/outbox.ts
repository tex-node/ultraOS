import { offlineDb, type OfflineScoringDatabase } from "./db";
import type { OutboxEnqueueInput, OutboxRecord } from "./types";
import type { OutboxRecord as WireOutboxRecord, SyncOutboxRecordResult } from "@/lib/sync/outbox-schema";
import {
  detectLocalAgent,
  markSyncedOnAgent,
  markVisionSynced,
  readPendingFromAgent,
  readVisionObservations,
} from "./local-agent";

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function enqueue(
  input: OutboxEnqueueInput,
  db: OfflineScoringDatabase = offlineDb,
): Promise<number> {
  const record: OutboxRecord = {
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    clientUpdatedAt: input.clientUpdatedAt ?? new Date().toISOString(),
    idempotencyKey: input.idempotencyKey ?? generateIdempotencyKey(),
    deviceId: input.deviceId,
    syncedAt: null,
    failureReason: null,
    attemptCount: 0,
    ledgerSourceHint: input.ledgerSourceHint,
  };
  const localId = await db.outbox.add(record);

  // Desktop mirror (documentation/architecture/DESKTOP_APP.md, Option B). When the Tauri shell's local agent is running, every
  // queued record is also written to its durable store, so a browser profile cleared mid-match - or a WebView2 data wipe on
  // update - cannot lose a game. The IndexedDB copy stays authoritative for the web path; this is the belt to that braces, not a
  // replacement for it, and it is deliberately fire-and-forget: the tap must not wait on a local HTTP call to be recorded.
  void (async () => {
    try {
      const { detectLocalAgent, callLocalAgent } = await import("./local-agent");
      if (!(await detectLocalAgent())) return;
      await callLocalAgent("SAVE_OUTBOX", [record]);
    } catch {
      // A missing or wedged agent must never surface as a scoring failure.
    }
  })();

  return localId;
}

// A record failing this many times is treated as a permanent failure, not a transient one - a bad
// FK, a deleted game, a malformed payload. Attempt-based, not time-based: evaluated whenever
// drain() actually runs (every online/visibilitychange trigger), not on its own timer - the same
// reasoning that kept drain() itself trigger-driven rather than timer-driven (see auto-sync.ts).
// 5, not 10: for a scorekeeper's tablet, failing across 5 separate trigger-driven attempts is
// already almost certainly permanent - retrying 5 more times only delays the scorekeeper seeing a
// problem they need to act on.
export const DEAD_LETTER_ATTEMPT_THRESHOLD = 5;

// Reads the next batch to sync - pure local read, no network, nothing marked. Named apart from
// drain() below: this function doesn't drain anything by itself (nothing here empties the
// outbox), it just answers "what's pending." drain() is the verb that actually empties it.
//
// "Pending" means not yet synced AND not dead-lettered. A failureReason alone does NOT exclude a
// record - attemptCount exists specifically so a FAILED/CONFLICT record can be retried on a later
// drain() rather than being silently abandoned after one failure. Only deadLetteredAt (set once
// attemptCount crosses DEAD_LETTER_ATTEMPT_THRESHOLD) stops that retry - a record past the cutoff
// needs the scorekeeper's attention (surfaced by SyncStatusBadge) or a manual retry
// (retryDeadLetteredRecords), not another silent automatic attempt.
export async function readPendingBatch(
  batchSize = 50,
  db: OfflineScoringDatabase = offlineDb,
): Promise<OutboxRecord[]> {
  // Desktop: the agent owns the queue. Its rows carry the SQLite rowid in localId, so callers must address them by
  // idempotencyKey - which drain() already does when it reads the server's per-key results.
  if (await detectLocalAgent()) {
    const fromAgent = (await readPendingFromAgent()) as OutboxRecord[];
    if (fromAgent.length > 0) {
      return fromAgent
        .slice()
        .sort((left, right) => left.clientUpdatedAt.localeCompare(right.clientUpdatedAt))
        .slice(0, batchSize);
    }
  }
  const pending = await db.outbox.filter((record) => !record.syncedAt && !record.deadLetteredAt).sortBy("clientUpdatedAt");
  return pending.slice(0, batchSize);
}

export async function markSynced(
  localIds: number[],
  db: OfflineScoringDatabase = offlineDb,
): Promise<void> {
  // Clears attemptCount/failureReason/deadLetteredAt too, not just syncedAt: a record that failed
  // a couple of times before eventually succeeding would otherwise keep showing a stale attempt
  // count and error message forever after it's done. readPendingBatch's filter means this can
  // never fire on a STILL-dead-lettered record (those are never offered to drain() in the first
  // place), but the failure history from a non-dead-lettered record's earlier attempts is real
  // leftover state with no reason to survive a successful sync.
  await db.outbox.bulkUpdate(
    localIds.map((localId) => ({
      key: localId,
      changes: { syncedAt: new Date().toISOString(), attemptCount: 0, failureReason: null, deadLetteredAt: null },
    })),
  );
}

export async function markFailed(
  localId: number,
  reason: string,
  db: OfflineScoringDatabase = offlineDb,
): Promise<void> {
  const existing = await db.outbox.get(localId);
  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const deadLetteredAt = attemptCount >= DEAD_LETTER_ATTEMPT_THRESHOLD ? new Date().toISOString() : null;
  await db.outbox.update(localId, { failureReason: reason, attemptCount, deadLetteredAt });
}

export async function pendingCount(db: OfflineScoringDatabase = offlineDb): Promise<number> {
  return db.outbox.filter((record) => !record.syncedAt && !record.deadLetteredAt).count();
}

export async function deadLetterCount(db: OfflineScoringDatabase = offlineDb): Promise<number> {
  return db.outbox.filter((record) => Boolean(record.deadLetteredAt)).count();
}

// A record dead-lettered by a genuinely permanent failure (a bad FK, a deleted game) will just
// fail its next 5 attempts again after a bulk reset, re-dead-letter, and invite another click -
// each cycle costing 5 round trips per record on a tablet that may be on flaky gym wifi. This
// cooldown doesn't stop the scorekeeper from retrying - it stops the RESET from doing anything
// within the window, so repeated clicks don't repeatedly spend 5 attempts on a record that hasn't
// had a chance to become fixable yet (someone correcting the underlying data server-side, for
// instance). One timestamp field, not a second counter alongside attemptCount - cheaper to reason
// about, and it achieves the same goal (stop the loop, not stop the retry).
export const MANUAL_RETRY_COOLDOWN_MS = 60 * 60 * 1000;

// Manual retry: resets every dead-lettered record - EXCEPT one retried within the last
// MANUAL_RETRY_COOLDOWN_MS (see above) - back to a clean, retryable state (attemptCount to 0,
// deadLetteredAt and failureReason cleared, lastManualRetryAt stamped) so the next drain() picks it
// up again. Bulk, not per-record - this project's only UI surface for it today (SyncStatusBadge) is
// a compact status pill, not a record list; per-record retry is the admin page's job (A4 PR 3), not
// this one's. Does not itself call drain() - the next trigger (or the caller) does that.
export async function retryDeadLetteredRecords(db: OfflineScoringDatabase = offlineDb): Promise<number> {
  const now = Date.now();
  const deadLettered = await db.outbox.filter((record) => Boolean(record.deadLetteredAt)).toArray();
  const eligible = deadLettered.filter((record) => {
    if (!record.lastManualRetryAt) return true;
    return now - new Date(record.lastManualRetryAt).getTime() >= MANUAL_RETRY_COOLDOWN_MS;
  });
  if (eligible.length === 0) return 0;
  const nowIso = new Date(now).toISOString();
  await db.outbox.bulkUpdate(
    eligible.map((record) => ({
      key: record.localId!,
      changes: { attemptCount: 0, deadLetteredAt: null, failureReason: null, lastManualRetryAt: nowIso },
    })),
  );
  return eligible.length;
}

// Strips client-only bookkeeping (localId, deviceId, syncedAt, failureReason, attemptCount) down
// to the wire shape - ledgerSourceHint only travels for GameEvent, matching outbox-schema.ts's
// own superRefine (a Game record has no scorer/statistician distinction to hint at).
function toWireRecord(record: OutboxRecord): WireOutboxRecord {
  return {
    idempotencyKey: record.idempotencyKey,
    entityType: record.entityType,
    operation: record.operation,
    entityId: record.entityId,
    payload: record.payload,
    clientUpdatedAt: record.clientUpdatedAt,
    ...(record.entityType === "GameEvent" ? { ledgerSourceHint: record.ledgerSourceHint } : {}),
  } as WireOutboxRecord;
}

let draining = false;

export interface DrainOptions {
  db?: OfflineScoringDatabase;
  fetchFn?: typeof fetch;
  endpoint?: string;
  batchSize?: number;
}

export type DrainOutcome =
  | { ok: true; attempted: number; applied: number; duplicate: number; failed: number; conflict: number }
  | { ok: false; reason: "ALREADY_DRAINING" }
  | { ok: false; reason: "REQUEST_FAILED"; status: number };

// The network-syncing half of the outbox lifecycle: reads the pending batch, POSTs it to the sync
// endpoint, and applies the per-record results back - APPLIED/DUPLICATE records are marked synced,
// FAILED/CONFLICT records are marked failed (bumping attemptCount; a later drain retries them until
// DEAD_LETTER_ATTEMPT_THRESHOLD is reached, at which point markFailed itself stops the retries).
//
// The in-flight guard is module-level, not per-call state: JS is single-threaded between awaits,
// so `draining = true` is visible to a second concurrent call before that call's own first await -
// no window where two calls both see `false` and both proceed.
export async function drain(deviceId: string, options: DrainOptions = {}): Promise<DrainOutcome> {
  if (draining) {
    return { ok: false, reason: "ALREADY_DRAINING" };
  }
  draining = true;
  try {
    const db = options.db ?? offlineDb;
    const fetchFn = options.fetchFn ?? fetch;
    const endpoint = options.endpoint ?? "/api/sync/outbox";

    const batch = await readPendingBatch(options.batchSize ?? 50, db);
    if (batch.length === 0) {
      return { ok: true, attempted: 0, applied: 0, duplicate: 0, failed: 0, conflict: 0 };
    }

    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ deviceId, records: batch.map(toWireRecord) }),
    });

    if (!response.ok) {
      // Whole-batch rejection (auth, malformed body) - not any individual record's fault, so
      // nothing in the outbox is touched. A later drain retries the identical batch untouched.
      return { ok: false, reason: "REQUEST_FAILED", status: response.status };
    }

    const body = (await response.json()) as { results: SyncOutboxRecordResult[] };
    // Matched by idempotencyKey, never array index - the server processes in clientUpdatedAt
    // order (sortRecordsForProcessing), which is not necessarily this batch's submission order.
    const resultByKey = new Map(body.results.map((result) => [result.idempotencyKey, result]));

    const syncedLocalIds: number[] = [];
    let applied = 0;
    let duplicate = 0;
    let failed = 0;
    let conflict = 0;

    for (const record of batch) {
      const result = resultByKey.get(record.idempotencyKey);
      if (result?.status === "APPLIED" || result?.status === "DUPLICATE") {
        syncedLocalIds.push(record.localId!);
        if (result.status === "APPLIED") applied++;
        else duplicate++;
      } else if (result?.status === "CONFLICT") {
        await markFailed(record.localId!, "CONFLICT", db);
        conflict++;
      } else {
        // FAILED, or the server returned no result for this key at all (shouldn't happen for an
        // authorized 200 response, but "no result" must never be silently treated as success).
        const reason = result ? JSON.stringify(result.detail ?? "FAILED") : "NO_RESULT_FROM_SERVER";
        await markFailed(record.localId!, reason, db);
        failed++;
      }
    }

    if (syncedLocalIds.length > 0) {
      await markSynced(syncedLocalIds, db);

      // Desktop: the agent keeps a record until the SERVER confirms it, then the IndexedDB mirror is deleted so the next drain
      // cannot re-send it. Matched by idempotencyKey, not localId - the agent's rows carry SQLite rowids.
      const syncedKeys = batch
        .filter((record) => syncedLocalIds.includes(record.localId!))
        .map((record) => record.idempotencyKey);
      await markSyncedOnAgent(syncedKeys, "APPLIED");

      // Only the desktop deletes the mirror. In a plain browser the synced rows are kept on purpose: the badge reads the newest
      // `syncedAt` to say "Synced · last sync 14:32", and deleting them would blank that history. When the agent owns the queue
      // the mirror exists for nothing but crash recovery, so once the server has confirmed a key it goes.
      if (syncedKeys.length > 0 && (await detectLocalAgent())) {
        const syncedKeySet = new Set(syncedKeys);
        const mirrors = await db.outbox.filter((record) => syncedKeySet.has(record.idempotencyKey)).toArray();
        if (mirrors.length > 0) {
          await db.outbox.bulkDelete(mirrors.map((record) => record.localId!));
        }
      }
    }

    // Failures are mirrored to the agent with their reason, but the IndexedDB copy stays. If the agent dies mid-game the browser
    // path is the only thing left holding the record; deleting it here would be the exact data loss this design prevents.
    for (const record of batch) {
      if (syncedLocalIds.includes(record.localId!)) continue;
      const result = resultByKey.get(record.idempotencyKey);
      await markSyncedOnAgent(
        [record.idempotencyKey],
        result?.status === "CONFLICT" ? "CONFLICT" : "FAILED",
        result ? JSON.stringify(result.detail ?? "FAILED") : "NO_RESULT_FROM_SERVER",
      );
    }

    return { ok: true, attempted: batch.length, applied, duplicate, failed, conflict };
  } finally {
    draining = false;
  }
}


/**
 * Push queued vision observations (Prompt 5c-iv).
 *
 * Grouped by (gameVideoId, analysisRunId): the sync endpoint scopes its insert to that pair and rejects a body that names another
 * organization, so a mixed batch would be a tenancy question the client has no business answering.
 *
 * Retry semantics mirror the scoring outbox: the server's per-observation outcome decides. APPLIED and DUPLICATE are both done
 * (a duplicate means it is already there, which is what idempotent sync is for); FAILED increments and dead-letters at five; a
 * whole-batch rejection marks every id in it, because none of them landed.
 */
export async function drainVisionObservations(
  options: { fetchFn?: typeof fetch; endpoint?: string } = {},
): Promise<{ ok: boolean; attempted: number; accepted: number; duplicates: number; failed: number; reason?: string }> {
  const fetchFn = options.fetchFn ?? fetch;
  const endpoint = options.endpoint ?? "/api/vision/sync";

  const queued = await readVisionObservations();
  if (queued.length === 0) {
    return { ok: true, attempted: 0, accepted: 0, duplicates: 0, failed: 0 };
  }

  const groups = new Map<string, typeof queued>();
  for (const row of queued) {
    const key = `${row.gameVideoId}::${row.analysisRunId}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  let accepted = 0;
  let duplicates = 0;
  let failed = 0;
  let attempted = 0;

  for (const [key, rows] of groups) {
    const separator = key.indexOf("::");
    const gameVideoId = key.slice(0, separator);
    const analysisRunId = key.slice(separator + 2);
    attempted += rows.length;

    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        gameVideoId,
        analysisRunId,
        observations: rows.map((row) => row.observation),
      }),
    });

    if (!response.ok) {
      // A 4xx (auth, wrong org, unknown references) will not fix itself on retry, but a 5xx or a network blip might. Either way the
      // rows are marked failed so the attempt counter advances and the death-letter threshold eventually stops the loop.
      const reason = `HTTP ${response.status}`;
      await markVisionSynced(rows.map((row) => row.id), "FAILED", reason);
      failed += rows.length;
      continue;
    }

    const body = (await response.json()) as { accepted?: number; duplicates?: number; rejected?: number };
    const acceptedCount = body.accepted ?? 0;
    const duplicateCount = body.duplicates ?? 0;

    // The server accepts a batch in order but reports counts, not ids. Marking the whole batch applies/duplicates is correct when
    // every row landed; when it did not, the leftover rows are marked failed so a retry can try again.
    const landed = acceptedCount + duplicateCount;
    if (landed >= rows.length) {
      await markVisionSynced(rows.map((row) => row.id), "APPLIED");
      accepted += acceptedCount;
      duplicates += duplicateCount;
    } else {
      const landedIds = rows.slice(0, landed).map((row) => row.id);
      const leftoverIds = rows.slice(landed).map((row) => row.id);
      await markVisionSynced(landedIds, "APPLIED");
      await markVisionSynced(leftoverIds, "FAILED", "not accepted by the server");
      accepted += acceptedCount;
      duplicates += duplicateCount;
      failed += leftoverIds.length;
    }
  }

  return { ok: failed === 0, attempted, accepted, duplicates, failed };
}
