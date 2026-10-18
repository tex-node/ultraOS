import Link from "next/link";
import { FEED_HEADERS } from "@/lib/data-feed/signature";

export const dynamic = "force-static";

// Public developer portal (streak v5, Prompt 4). A static page - no auth, no data access - so it can be
// linked from a partner contract without exposing anything. The values that must not drift (rate limit,
// header names, signature scheme) are stated here AND enforced in code; where a constant exists it is
// imported rather than retyped (FEED_HEADERS), and the rest is cross-checked against
// documentation/api/ULTRA_LIVE_API_V1.md and openapi-v1.yaml.

const RATE_LIMIT_PER_MINUTE = 120;
const WINDOW_SECONDS = 60;

const endpoints: { path: string; what: string; tier: string }[] = [
  { path: "GET /api/v1/games/[publicId]", what: "One game: status, score, teams, capability.", tier: "all" },
  { path: "GET /api/v1/games/[publicId]/snapshot", what: "Display snapshot: score, clock, leaders, team comparison.", tier: "all" },
  { path: "GET /api/v1/games/[publicId]/box-score", what: "Per-player box score for the game.", tier: "all" },
  { path: "GET /api/v1/games/[publicId]/events", what: "Sequenced event ledger (null when the game is BOX_SCORE_ONLY).", tier: "EVENT_LEVEL" },
  { path: "GET /api/v1/games/[publicId]/live-feed", what: "Compressed live state for odds/media: score, period, clock, last 5 events.", tier: "all" },
  { path: "GET /api/v1/live", what: "Every game in progress across the league.", tier: "all" },
  { path: "GET /api/v1/clubs/[publicId]", what: "Club profile and season record.", tier: "all" },
  { path: "GET /api/v1/players/[publicId]", what: "Player profile and season totals.", tier: "all" },
  { path: "GET /api/v1/seasons/[publicId]/standings", what: "League table as the platform computes it.", tier: "all" },
  { path: "GET /api/v1/seasons/[publicId]/leaders", what: "Statistical leaders for a season.", tier: "all" },
];

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-ink-900 p-3 text-[11px] leading-5 text-text-2">{children}</pre>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-lg font-semibold text-text-1">
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm text-text-2">{children}</div>
    </section>
  );
}

export default function ApiDocsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-xs uppercase tracking-[.2em] text-info">Developer portal</p>
      <h1 className="mt-3 text-3xl font-bold text-text-1">Ultra League OS API v1</h1>
      <p className="mt-2 text-sm text-text-2">
        Read-only league data for the official website, broadcast graphics, media partners and odds providers. Basketball today;
        the same endpoints serve any sport the platform runs (see the capability tiers below).
      </p>
      <p className="mt-1 text-xs text-text-3">
        Machine-readable contract: <Link href="/api-docs/openapi-v1.yaml" className="text-info underline">openapi-v1.yaml</Link> ·{" "}
        <Link href="/api-docs/openapi-v1.yaml" className="text-info underline">download</Link>
      </p>

      <Section id="base" title="Base URL and format">
        <p>
          Everything lives under <code className="text-text-1">/api/v1</code> on the league&apos;s host. Responses are JSON, UTF-8,
          and every timestamp is ISO 8601 UTC. <code>publicId</code> values are the league&apos;s stable public identifiers, never
          internal database ids.
        </p>
        <Code>{`GET https://<league-host>/api/v1/games/<publicId>/live-feed
accept: application/json`}</Code>
      </Section>

      <Section id="auth" title="Authentication and the public/private boundary">
        <p>
          <strong className="text-text-1">/api/v1 is public and read-only.</strong> No key is required to read it today: the data it
          exposes is the same data the public site shows (scores, box scores, standings, leaders). There is no write endpoint anywhere
          in /api/v1.
        </p>
        <p>
          Private surfaces are deliberately <em>not</em> part of this API: operator/broadcast controls, internal reconciliation
          detail, player contact data, coach plans and training logs all live behind an authenticated session on separate routes.
          If a partner needs a private feed (for example pre-publication line-ups), that is a negotiated integration with its own
          credential, not a flag on these routes.
        </p>
        <p>
          CORS is allow-listed, not <code>*</code>: the league configures permitted browser origins (<code>PUBLIC_API_ALLOWED_ORIGINS</code>
          ); server-to-server calls are unaffected.
        </p>
      </Section>

      <Section id="rate-limits" title="Rate limits">
        <p>
          {RATE_LIMIT_PER_MINUTE} requests per {WINDOW_SECONDS} seconds per client IP, fixed window, applied to every /api/v1 route.
          Every response carries:
        </p>
        <Code>{`x-ratelimit-limit: ${RATE_LIMIT_PER_MINUTE}
x-ratelimit-remaining: <n>
retry-after: <seconds>   (only on 429)`}</Code>
        <p>
          Polling faster than once per second is not useful: the platform writes a live score change at human speed. Built-in
          partners poll the live feed every 5-10 seconds; the webhook below exists so odds pricing does not have to poll at all.
        </p>
      </Section>

      <Section id="tiers" title="Capability tiers">
        <p>Not every game was captured at the same depth. Each game reports its tier, and the API never fabricates what is missing.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code className="text-text-1">BOX_SCORE_ONLY</code> — the result and per-player totals exist (typically imported from a
            provider&apos;s box score). Event-level fields are <code>null</code>, with an explicit{" "}
            <code>available: false</code> on the events route. A <code>null</code> history means &quot;never captured&quot;, not
            &quot;nothing happened&quot;.
          </li>
          <li>
            <code className="text-text-1">EVENT_LEVEL</code> — captured live or from an event ledger: sequenced events, clock and period
            per event, and the live feed&apos;s last-five list.
          </li>
          <li>
            <code className="text-text-1">FULL_ULTRA</code> — everything in EVENT_LEVEL plus Ultra-specific rules data (four-point
            shots, Ultra Time).
          </li>
        </ul>
        <p className="text-xs text-text-3">
          Treat the tier as part of the data, not as an error: an odds model that needs event granularity should read{" "}
          <code>capability</code> and skip games that are not EVENT_LEVEL rather than infer from nulls.
        </p>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-text-3">
                <th className="p-2">Route</th>
                <th className="p-2">Returns</th>
                <th className="p-2">Needs</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.path} className="border-t border-line-subtle">
                  <td className="p-2 font-mono text-text-1">{endpoint.path}</td>
                  <td className="p-2">{endpoint.what}</td>
                  <td className="p-2 text-text-3">{endpoint.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="live-feed" title="Live feed (odds and media)">
        <p>
          Designed to be polled: short keys, no player names, no nested club objects. The whole body is a few hundred bytes.
        </p>
        <Code>{`GET /api/v1/games/<publicId>/live-feed

{
  "v": 1,
  "gid": "cm...",             // game id
  "fid": "cm...",             // fixture id
  "st": "LIVE",               // NOT_STARTED | LIVE | PAUSED | FINAL
  "s": [38, 41],              // [home, away] points
  "p": 3,                     // period number
  "pl": "H2",                 // period label, or null
  "c": 412,                   // clock seconds remaining, or null when the clock is not running
  "cap": "EVENT_LEVEL",       // capability tier of THIS game
  "t": "2026-10-18T18:02:11.000Z",   // server time the body was produced
  "e": [                      // last five ACTIVE events, oldest first; null for BOX_SCORE_ONLY
    { "q": 42, "p": 3, "c": 412, "t": "SHOT_MADE", "pts": 2, "side": "h" }
  ]
}`}</Code>
        <p className="text-xs text-text-3">
          <code>q</code> is a monotonic sequence number within the game: use it to drop out-of-order responses and to detect gaps.{" "}
          <code>t</code> is the staleness clock, not an event time. <code>side</code> is <code>h</code>, <code>a</code> or{" "}
          <code>null</code> when the event has no team attribution.
        </p>
      </Section>

      <Section id="webhook" title="Live feed webhook (push)">
        <p>
          Instead of polling, a partner can subscribe to signed webhooks. The league registers a URL and a shared secret per
          subscriber, and chooses the events it wants: <code>GAME_STARTED</code>, <code>SCORE_CHANGED</code>,{" "}
          <code>GAME_FINAL</code>.
        </p>
        <p>Each delivery is an HTTP POST with these headers:</p>
        <Code>{`${FEED_HEADERS.contentType === "application/json" ? "content-type: application/json" : ""}
${FEED_HEADERS.signature}: t=1760804531,v1=<hex hmac>
${FEED_HEADERS.event}: SCORE_CHANGED
${FEED_HEADERS.delivery}: <delivery id>
${FEED_HEADERS.attempt}: 1`}</Code>
        <p>Body:</p>
        <Code>{`{
  "id": "<delivery id>",              // stable across retries - dedupe on this
  "type": "SCORE_CHANGED",
  "sentAt": "2026-10-18T18:02:11.000Z",
  "game": { "gameId": "...", "fixtureId": "...", "status": "LIVE",
            "homeScore": 40, "awayScore": 41, "period": 3,
            "periodLabel": null, "clockSeconds": 392 },
  "event": { "eventId": "...", "sequenceNumber": 43, "period": 3,
             "clockSeconds": 392, "points": 2, "eventType": "SCORE" }
}`}</Code>
        <p>
          <strong className="text-text-1">Verifying the signature.</strong> The signed string is{" "}
          <code>&lt;t&gt;.&lt;raw body&gt;</code>, HMAC-SHA256 with the shared secret, hex-encoded. Compare with a constant-time
          compare, and reject a timestamp more than 5 minutes old (that tolerance is what stops a replay of a captured body).
        </p>
        <Code>{`// Node.js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret, rawBody, header, nowMs = Date.now()) {
  const parts = new Map(header.split(",").map((c) => c.split("=")));
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > 300) return false;      // 5 minute tolerance
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}`}</Code>
        <p className="text-xs text-text-3">
          Sign the bytes you received, before JSON parsing - re-serialising a parsed object changes key order and whitespace and will
          never match.
        </p>
        <p>
          <strong className="text-text-1">Retries.</strong> A 2xx means delivered. 408, 429 and 5xx are retried with exponential
          backoff (30 s, 1 m, 2 m, 4 m, 8 m, 16 m, 32 m, then hourly), up to 8 attempts; any other 4xx is treated as permanent and not
          retried. Answer quickly (a few hundred milliseconds) - the sender times out at 10 seconds and treats it as a retry. Because
          a retry can follow a response the sender never saw, the same <code>id</code> may arrive twice: dedupe on it.
        </p>
      </Section>

      <Section id="errors" title="Errors">
        <Code>{`{ "error": { "code": "GAME_NOT_FOUND", "message": "No game found for this id." } }`}</Code>
        <p className="text-xs text-text-3">
          Codes in use: <code>GAME_NOT_FOUND</code>, <code>RATE_LIMITED</code>, <code>INVALID_REQUEST</code>. A 404 is also returned for
          an id that exists in another league&apos;s data - the API never reveals whether an invisible id exists.
        </p>
      </Section>

      <p className="mt-10 text-xs text-text-3">
        Operational detail, the full response schemas and the change history live in{" "}
        <code>documentation/api/ULTRA_LIVE_API_V1.md</code> and <code>openapi-v1.yaml</code> in the repository. This page is the
        partner-facing summary; if the two ever disagree, the OpenAPI file wins.
      </p>
    </main>
  );
}
