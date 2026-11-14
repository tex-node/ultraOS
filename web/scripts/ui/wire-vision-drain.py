"""Add the vision wrappers and the vision drain (Prompt 5c-iv Action 2).

Two pieces: thin transport wrappers in local-agent.ts, and `drainVisionObservations()` in outbox.ts, which groups queued rows by
(gameVideoId, analysisRunId) because the sync endpoint takes one video per batch and scopes the insert to that pair.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
agent = ROOT / "web/src/lib/offline/local-agent.ts"
outbox = ROOT / "web/src/lib/offline/outbox.ts"

# --- wrappers -----------------------------------------------------------------------------------------------------------------
source = agent.read_text(encoding="utf-8")
if "visionStatus" not in source:
    source = source.replace(
        '  | "CLEAR_OUTBOX";',
        '  | "CLEAR_OUTBOX"\n  | "SAVE_VISION_OBSERVATIONS"\n  | "READ_VISION_OBSERVATIONS"\n  | "MARK_VISION_SYNCED"\n'
        '  | "VISION_STATUS"\n  | "DOWNLOAD_VISION_ENGINE"\n  | "START_VISION_SIDECAR"\n  | "STOP_VISION_SIDECAR";',
    )
    source += '''

// --- vision (Prompt 5c-iv) ---------------------------------------------------------------------------------------------------
// The queue lives in the agent's SQLite beside the scoring outbox, with the same retry rules. These wrappers stay thin on purpose:
// what to send and what to mark belongs to drainVisionObservations, not to the transport.

export type VisionEngineStatus = {
  installed: boolean;
  running: boolean;
  version: string | null;
  downloading: boolean;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
};

export async function visionStatus(): Promise<VisionEngineStatus | null> {
  if (!(await detectLocalAgent())) return null;
  const response = await callLocalAgent<VisionEngineStatus>("VISION_STATUS");
  return response.ok ? (response.data ?? null) : null;
}

export async function downloadVisionEngine(): Promise<boolean> {
  return (await callLocalAgent("DOWNLOAD_VISION_ENGINE")).ok;
}

export async function startVisionSidecar(): Promise<boolean> {
  return (await callLocalAgent("START_VISION_SIDECAR")).ok;
}

export async function stopVisionSidecar(): Promise<boolean> {
  return (await callLocalAgent("STOP_VISION_SIDECAR")).ok;
}

export type QueuedVisionObservation = {
  id: string;
  gameVideoId: string;
  analysisRunId: string;
  observation: Record<string, unknown>;
  attemptCount: number;
};

export async function saveVisionObservations(input: {
  gameVideoId: string;
  analysisRunId: string;
  observations: Record<string, unknown>[];
}): Promise<{ saved: number; pending: number } | null> {
  if (!(await detectLocalAgent())) return null;
  const response = await callLocalAgent<{ saved: number; pending: number }>("SAVE_VISION_OBSERVATIONS", input);
  return response.ok ? (response.data ?? null) : null;
}

export async function readVisionObservations(): Promise<QueuedVisionObservation[]> {
  if (!(await detectLocalAgent())) return [];
  const response = await callLocalAgent<QueuedVisionObservation[]>("READ_VISION_OBSERVATIONS");
  return response.ok && Array.isArray(response.data) ? response.data : [];
}

export async function markVisionSynced(
  ids: string[],
  status: "APPLIED" | "DUPLICATE" | "FAILED",
  reason?: string,
): Promise<boolean> {
  if (ids.length === 0) return true;
  if (!(await detectLocalAgent())) return true;
  const response = await callLocalAgent("MARK_VISION_SYNCED", { ids, status, reason });
  return response.ok;
}
'''
    agent.write_text(source, encoding="utf-8", newline="\n")

# --- drain --------------------------------------------------------------------------------------------------------------------
text = outbox.read_text(encoding="utf-8")
if "drainVisionObservations" in text:
    print("vision drain already present")
    raise SystemExit(0)

text = text.replace(
    'import { detectLocalAgent, markSyncedOnAgent, readPendingFromAgent } from "./local-agent";',
    'import {\n  detectLocalAgent,\n  markSyncedOnAgent,\n  markVisionSynced,\n  readPendingFromAgent,\n  readVisionObservations,\n} from "./local-agent";',
)

text += '''

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
'''

outbox.write_text(text, encoding="utf-8", newline="\n")
print("vision wrappers and drainVisionObservations added")
