"use client";

// Detection and transport for the desktop local agent (documentation/architecture/DESKTOP_APP.md, Option B).
//
// The agent runs inside the Tauri shell on 127.0.0.1:8012. The page cannot read its token: the token arrives as an HttpOnly
// cookie set by /handshake, and every call is made with `credentials: "include"` so the browser attaches it. That is the whole
// point - an XSS in this origin can make requests, but it cannot steal the credential, and the allow-list bounds what a request
// can do.
//
// Detection is cached for a few seconds because it runs on render paths: without the cache every badge render would fire a
// request at a port that, in a browser, is simply closed.

const AGENT_ORIGIN = "http://127.0.0.1:8012";
const DETECT_TTL_MS = 5_000;
const DETECT_TIMEOUT_MS = 1_200;

export type AgentAction = "PING" | "SAVE_OUTBOX" | "READ_OUTBOX" | "MARK_SYNCED" | "RETRY_DEAD_LETTERED" | "CLEAR_OUTBOX";

export type AgentResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

let cached: { at: number; present: boolean } | null = null;
let inFlight: Promise<boolean> | null = null;

/**
 * Is this page running inside the UltraOS desktop shell?
 *
 * The shell sets a marker in its user agent (`UltraOSDesktop/…`, see desktop/src-tauri/src/lib.rs). A plain browser never probes
 * a loopback port that will not answer - and neither does the component test suite, which asserts that no request leaves the
 * badge until the user asks for a sync.
 */
export function looksLikeDesktopShell(): boolean {
  if (typeof navigator === "undefined") return false;
  return /UltraOSDesktop/i.test(navigator.userAgent);
}

/**
 * Is the desktop agent reachable? Safe to call from anywhere client-side; returns false on the server, in a plain browser, and
 * in tests - the loopback probe only happens inside the shell.
 */
export async function detectLocalAgent(force = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!looksLikeDesktopShell()) return false;
  if (!force && cached && Date.now() - cached.at < DETECT_TTL_MS) return cached.present;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
    try {
      const response = await fetch(`${AGENT_ORIGIN}/handshake`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
        // A plain browser has no agent; failing fast matters more than a retry.
        cache: "no-store",
      });
      const present = response.ok;
      cached = { at: Date.now(), present };
      return present;
    } catch {
      cached = { at: Date.now(), present: false };
      return false;
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Call one allow-listed agent action. Throws only on transport failure; protocol errors come back as `{ ok: false }`. */
export async function callLocalAgent<T = unknown>(action: AgentAction, payload?: unknown): Promise<AgentResponse<T>> {
  try {
    const response = await fetch(`${AGENT_ORIGIN}/api/local/agent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload: payload ?? null }),
    });
    if (response.status === 401) {
      // The token expired (12h) or the agent restarted; re-handshake once and let the caller retry.
      cached = null;
      await detectLocalAgent(true);
      return { ok: false, error: "agent token expired" };
    }
    const body = (await response.json()) as { ok: boolean; data?: T; error?: string };
    return body.ok ? { ok: true, data: body.data as T } : { ok: false, error: body.error ?? "agent error" };
  } catch (error) {
    cached = { at: Date.now(), present: false };
    return { ok: false, error: error instanceof Error ? error.message : "agent unreachable" };
  }
}

/** Test seam: forget the cached detection result. */
export function resetLocalAgentDetection() {
  cached = null;
  inFlight = null;
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
  // No agent (plain browser, test): this must be a no-op, not a fetch to a port that is not listening. The component test that
  // counts sync requests caught exactly that.
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
