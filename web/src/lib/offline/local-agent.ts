"use client";

// Detection and transport for the desktop local agent (documentation/architecture/DESKTOP_APP.md, Option B).
//
// AUTH, AND WHY IT IS A HEADER AND NOT A COOKIE. The first design had the agent set an HttpOnly cookie and the page send it back.
// The acceptance run proved that cannot work: a `Set-Cookie` from 127.0.0.1:8012 is stored but never attached to a fetch from the
// app's origin (handshake 200, every authenticated call 401). The flow is now:
//
//   1. GET /api/desktop/agent-token      — session-authenticated, returns a short-lived HMAC-signed proof
//   2. POST 127.0.0.1:8012/handshake     — the agent verifies the proof and returns a bearer token
//   3. every call sends `X-UltraOS-Token: <token>`
//
// The token is held in a module variable and nowhere else: not localStorage, not sessionStorage, not a cookie. An app restart
// clears the agent's in-memory map, so a token from a previous launch stops working even if it were captured.
//
// Detection is cached for a few seconds because it runs on render paths, and it only ever runs inside the shell - a plain browser
// (and the test suite) must never make a loopback request that cannot be answered.

const AGENT_ORIGIN = "http://127.0.0.1:8012";
const TOKEN_ENDPOINT = "/api/desktop/agent-token";
const DETECT_TTL_MS = 5_000;
const DETECT_TIMEOUT_MS = 2_500;

export type AgentAction =
  | "PING"
  | "SAVE_OUTBOX"
  | "READ_OUTBOX"
  | "MARK_SYNCED"
  | "RETRY_DEAD_LETTERED"
  | "CLEAR_OUTBOX"
  | "SAVE_VISION_OBSERVATIONS"
  | "READ_VISION_OBSERVATIONS"
  | "MARK_VISION_SYNCED"
  | "VISION_STATUS"
  | "DOWNLOAD_VISION_ENGINE"
  | "START_VISION_SIDECAR"
  | "STOP_VISION_SIDECAR";

export type AgentResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

let agentToken: string | null = null;
let cached: { at: number; present: boolean } | null = null;
let inFlight: Promise<boolean> | null = null;

/**
 * Is this page running inside the UltraOS desktop shell?
 *
 * The shell sets a marker in its user agent (`UltraOSDesktop/…`, see desktop/src-tauri/src/lib.rs). A plain browser never probes a
 * loopback port that will not answer - and neither does the component test suite, which asserts that no request leaves the badge
 * until the user asks for a sync.
 */
export function looksLikeDesktopShell(): boolean {
  if (typeof navigator === "undefined") return false;
  return /UltraOSDesktop/i.test(navigator.userAgent);
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a fresh proof from the server and exchange it for an agent token. Returns false if either step fails. */
async function handshake(): Promise<boolean> {
  try {
    const proofResponse = await withTimeout((signal) =>
      fetch(TOKEN_ENDPOINT, { credentials: "include", cache: "no-store", signal }),
    );
    if (!proofResponse.ok) return false;

    const { proof } = (await proofResponse.json()) as { proof?: string };
    if (!proof) return false;

    const handshakeResponse = await withTimeout((signal) =>
      fetch(`${AGENT_ORIGIN}/handshake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof }),
        signal,
      }),
    );
    if (!handshakeResponse.ok) return false;

    const body = (await handshakeResponse.json()) as { ok?: boolean; data?: { agentToken?: string } };
    const token = body.data?.agentToken;
    if (!token) return false;

    agentToken = token;
    return true;
  } catch {
    agentToken = null;
    return false;
  }
}

/**
 * Is the desktop agent reachable and authenticated? Safe to call from anywhere client-side; returns false on the server, in a
 * plain browser, and in tests - the loopback probe only happens inside the shell.
 */
export async function detectLocalAgent(force = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!looksLikeDesktopShell()) return false;
  if (agentToken) return true;
  if (!force && cached && Date.now() - cached.at < DETECT_TTL_MS) return cached.present;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const present = await handshake();
    cached = { at: Date.now(), present };
    inFlight = null;
    return present;
  })();

  return inFlight;
}

/** Call one allow-listed agent action. Throws only on transport failure; protocol errors come back as `{ ok: false }`. */
export async function callLocalAgent<T = unknown>(action: AgentAction, payload?: unknown): Promise<AgentResponse<T>> {
  const send = async (token: string | null) =>
    fetch(`${AGENT_ORIGIN}/api/local/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-UltraOS-Token": token } : {}),
      },
      body: JSON.stringify({ action, payload: payload ?? null }),
    });

  try {
    if (!agentToken) {
      const present = await detectLocalAgent();
      if (!present) return { ok: false, error: "agent unavailable" };
    }

    let response = await send(agentToken);
    if (response.status === 401) {
      // The token expired or the app restarted (its in-memory map is gone). One re-handshake and one retry, then give up.
      agentToken = null;
      cached = null;
      if (!(await handshake())) return { ok: false, error: "agent handshake failed" };
      response = await send(agentToken);
    }

    const body = (await response.json()) as { ok: boolean; data?: T; error?: string };
    return body.ok ? { ok: true, data: body.data as T } : { ok: false, error: body.error ?? "agent error" };
  } catch (error) {
    cached = { at: Date.now(), present: false };
    return { ok: false, error: error instanceof Error ? error.message : "agent unreachable" };
  }
}

/** Test seam: forget the cached detection result and the token. */
export function resetLocalAgentDetection() {
  cached = null;
  inFlight = null;
  agentToken = null;
}

/**
 * Pending records from the desktop's SQLite outbox, in the same shape as the IndexedDB rows.
 *
 * When the agent is authoritative this IS the queue; IndexedDB is only the mirror. `localId` is the SQLite rowid and deliberately
 * not used as a Dexie key - callers address records by `idempotencyKey`.
 */
export async function readPendingFromAgent(): Promise<unknown[]> {
  if (!(await detectLocalAgent())) return [];
  const response = await callLocalAgent<unknown[]>("READ_OUTBOX");
  return response.ok && Array.isArray(response.data) ? response.data : [];
}

/** Mark exact keys synced (APPLIED / DUPLICATE) or failed. Per key, never per batch. */
export async function markSyncedOnAgent(
  idempotencyKeys: string[],
  status: "APPLIED" | "DUPLICATE" | "FAILED" | "CONFLICT",
  failureReason?: string,
): Promise<boolean> {
  if (idempotencyKeys.length === 0) return true;
  // No agent (plain browser, test): this must be a no-op, not a fetch to a port that is not listening.
  if (!(await detectLocalAgent())) return true;
  const response = await callLocalAgent("MARK_SYNCED", { idempotencyKeys, status, failureReason });
  return response.ok;
}

/** Reset every dead-lettered record so the next drain attempts it again. */
export async function retryDeadLetteredOnAgent(): Promise<number> {
  if (!(await detectLocalAgent())) return 0;
  const response = await callLocalAgent<{ retried: number }>("RETRY_DEAD_LETTERED");
  return response.ok ? (response.data?.retried ?? 0) : 0;
}


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
