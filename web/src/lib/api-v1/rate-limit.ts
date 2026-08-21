// Application-level rate limiting for the public API v1 (G.20, Part XX). In-memory, per-process
// - this app runs as a single systemd service instance (ultraos-web.service on 127.0.0.1:4110,
// unchanged since G.15), so there is no multi-instance skew to worry about and no case for
// standing up Redis solely for this. Documented explicitly as a scale-appropriate choice, not an
// oversight - see documentation/api/ULTRA_LIVE_API_V1.md.
//
// Fixed-window counter per client IP. Deliberately only applied to /api/v1/* (public) routes -
// internal broadcast consumers (/api/broadcast/program, the browser-source graphics routes, the
// diagnostics page) never pass through this limiter, so a legitimate high-frequency OBS source
// can never be rate-limited by a policy meant for public/unknown consumers (Part XX: "Do not
// accidentally rate-limit internal broadcast consumers").
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120; // generous relative to the fastest real consumer cadence (public /live polls every 8s = ~8 req/min)

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

// Bound memory: an unbounded Map keyed by arbitrary client IPs would leak forever under a real
// public API. Sweep expired buckets opportunistically on each check rather than running a timer.
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
  }
}

export type RateLimitResult = { limited: boolean; limit: number; remaining: number; retryAfterSeconds: number };

export function checkRateLimit(clientKey: string, now: number = Date.now()): RateLimitResult {
  if (buckets.size > 5000) sweep(now);
  const existing = buckets.get(clientKey);
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    buckets.set(clientKey, { count: 1, windowStart: now });
    return { limited: false, limit: MAX_REQUESTS_PER_WINDOW, remaining: MAX_REQUESTS_PER_WINDOW - 1, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - existing.count);
  const retryAfterSeconds = Math.ceil((existing.windowStart + WINDOW_MS - now) / 1000);
  return { limited: existing.count > MAX_REQUESTS_PER_WINDOW, limit: MAX_REQUESTS_PER_WINDOW, remaining, retryAfterSeconds };
}

export function clientKeyFromRequest(request: Request): string {
  // Behind the established reverse-proxy (Caddy, per prior tracks' deploy notes) - trust
  // X-Forwarded-For's first hop; fall back to a constant so local/dev requests don't all collide
  // under one bucket in a way that masks the logic during testing, without needing a real socket
  // address (Next.js route handlers don't expose one directly).
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// Exposed for tests only, so each test run starts clean.
export function _resetRateLimitState() {
  buckets.clear();
}
