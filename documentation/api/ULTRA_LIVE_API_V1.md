# Ultra Live API v1

G.20, Part XIV-XXVII. A stable, versioned, public-safe HTTP API for consuming Ultra Basketball
League OS data — the official website, a future mobile app, or a trusted third-party graphics
consumer. Distinct from the internal broadcast contracts (`/api/broadcast/program`,
`/api/v1/broadcast/games/[id]`, the browser-source graphics routes) — see
[`EXTERNAL_GRAPHICS_DATA_CONTRACT.md`](../broadcast/EXTERNAL_GRAPHICS_DATA_CONTRACT.md) for how
those two families differ.

## Base path

```
https://app.neonultra.ng/api/v1/
```

## Auth tier

**Public** — no authentication. Every route under `/api/v1/*` documented here is designed to be
safely readable by anyone; there is no partial-auth "logged in but not staff" tier in this API.
See Part XXII: PUBLIC / PARTNER / INTERNAL. Today only PUBLIC (this document) and INTERNAL
(`/api/v1/broadcast/games/[id]`, requires `broadcast:operate`) exist — a PARTNER tier (API keys,
higher rate limits, an enriched feed) is a real future need but not built this track; nothing in
the current architecture blocks adding it later as a new tier alongside these two.

## Rate limiting

120 requests per client IP per rolling 60-second window, in-memory (this app runs as a single
process — see `rate-limit.ts`). Every response carries `X-RateLimit-Limit` and
`X-RateLimit-Remaining`; a limited request returns `429` with `Retry-After` (seconds) and the
standard error envelope, `code: "RATE_LIMITED"`. This limit applies **only** to `/api/v1/*`
public routes — internal broadcast consumers (browser-source graphics, `/api/broadcast/program`,
the diagnostics page) never pass through this limiter and cannot be rate-limited by it.

## CORS

Origin-allowlisted, never `Access-Control-Allow-Origin: *`. Configure via the
`PUBLIC_API_ALLOWED_ORIGINS` environment variable (comma-separated origins); defaults to just
this app's own public origin if unset. A request from an origin not on the list simply receives
no CORS headers — same-origin and non-browser (server-to-server, curl, mobile app) callers are
unaffected either way, since CORS is a browser-enforced restriction, not a server-side gate.

## Public identifiers (Part XV)

| Entity | Public ID | Format | Notes |
|---|---|---|---|
| Player | Athlete's `ultraAthleteId` | `UBA-000066` | Stable across seasons; never the internal Player/Athlete database id |
| Club | `shortName`, lowercased | `vortex` | Unique per sport; effectively global with one sport in this league |
| Season | `active` alias, or the real Season id | `active` / `cmqfqpnkr...` | No dedicated slug exists yet; `active` avoids needing to look one up |
| Game / Fixture | `Fixture.id` | `cmsp9a74r...` | No dedicated slug exists; this is already the public routing id on `/public/fixtures/[id]` today, not a new leak |

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/live` | Every currently live PRODUCTION game — `{ games: LiveGameV1[], generatedAt }` |
| GET | `/api/v1/games/{fixtureId}` | One game's current state — `LiveGameV1` |
| GET | `/api/v1/games/{fixtureId}/snapshot` | Fuller public snapshot — `GameSnapshotV1` |
| GET | `/api/v1/games/{fixtureId}/box-score` | Player box score — `BoxScoreV1` |
| GET | `/api/v1/games/{fixtureId}/events` | Sequenced event ledger (capability-gated) |
| GET | `/api/v1/players/{ultraAthleteId}` | `PlayerSummaryV1` |
| GET | `/api/v1/clubs/{shortNameSlug}` | `ClubSummaryV1` |
| GET | `/api/v1/seasons/{active\|seasonId}/standings` | `SeasonStandingsV1` |
| GET | `/api/v1/seasons/{active\|seasonId}/leaders?category=PPG` | `SeasonLeadersV1` (categories: `PPG,RPG,APG,SPG,BPG,FG_PCT,THREE_PCT,FT_PCT,EFF`) |

Full response shapes: see [`openapi-v1.yaml`](./openapi-v1.yaml) or `src/lib/api-v1/contracts.ts`.

## Versioning policy (Part XVII)

- Fields documented here are **stable** once shipped in v1.
- New **optional** fields may be added to any response without notice.
- `points` always means effective awarded points (after any Ultra Time multiplier).
  `basePointValue` always retains the original shot value (2/3/4). `multiplier` always retains
  the rules multiplier actually applied (1 or 2). These three fields' meanings will never change
  within v1.
- Any breaking change (removing a field, changing an existing field's meaning or type) requires a
  new `/api/v2/` namespace — v1 is never silently changed underneath an existing consumer.

## Capability rules (Part XIX, XXIV)

Every game-scoped response includes `capability`: `BOX_SCORE_ONLY | EVENT_LEVEL | FULL_ULTRA`.

- **`BOX_SCORE_ONLY`** (all 11 real historical Season Zero games): `/events` returns
  `{ available: false, events: null }` — never a fake empty array. No 4PT/Ultra Time data exists
  or will ever be fabricated for these games.
- **`EVENT_LEVEL`** / **`FULL_ULTRA`**: `/events` returns the real sequenced ledger.
  `FULL_ULTRA` additionally supports genuine 4PT/Ultra Time semantics in `ultraTime`/event fields.

## Error contract (Part XXIII)

```json
{ "error": { "code": "GAME_NOT_FOUND", "message": "No game found for this id." } }
```

| Code | HTTP status | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Generic not-found |
| `GAME_NOT_FOUND` | 404 | No game/fixture for that id, OR the fixture is not a real PRODUCTION game (a REHEARSAL fixture id returns this too — it is never distinguished from "doesn't exist") |
| `GAME_NOT_LIVE` | 409 | Reserved for a future live-only endpoint |
| `PLAYER_NOT_FOUND` | 404 | No athlete with that `ultraAthleteId` |
| `CLUB_NOT_FOUND` | 404 | No club with that slug |
| `SEASON_NOT_FOUND` | 404 | No season with that id/alias |
| `RATE_LIMITED` | 429 | Too many requests — see `Retry-After` |
| `UNAUTHORIZED` | 401 | Missing/insufficient permission (internal routes only) |
| `INTERNAL_ERROR` | 500 | Unexpected server error — never includes a stack trace |

## Timestamps (Part XXV)

Every response includes `generatedAt` (when this specific response was built) and, on
game-scoped responses, `dataUpdatedAt` — both ISO 8601 UTC. Today `dataUpdatedAt` equals
`generatedAt` (every value is freshly computed on each request, force-dynamic, no caching) — the
field exists so a future caching layer can populate it independently without a breaking change.

## What this API will never expose (Part I, VII, LVII)

Emails, phone numbers, application notes, admin notes, medical information, internal audit
details (`AuditLog`, `correctedById`, operator identity on events), authentication information,
or internal secrets. Player responses expose only name, position, jersey number, and current
club — the same public-safe fields already shown on the existing `/public/players/[id]` page.

## Cache policy (Part XXXV)

No caching today (`export const dynamic = "force-dynamic"` on every route — always a fresh read).
A live official score must never be served stale; a completed, verified FINAL game's data changes
only on an audited correction, so a short safe cache (e.g. `s-maxage=30` at a CDN/reverse-proxy
layer) would be reasonable there — not implemented yet, documented as a real future option rather
than guessed at with a fabricated number.
