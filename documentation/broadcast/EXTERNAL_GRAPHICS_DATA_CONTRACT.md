# External Graphics Data Contract

G.20, Part XXIX. How a third-party graphics engine (not OBS/vMix hitting our own
`/broadcast/game/[gameId]/*` browser sources — a genuinely separate rendering system someone else
builds) could consume Ultra Basketball data to present its own graphics.

## The one hard rule

A third-party consumer may **PRESENT** data. It must never **WRITE** competitive truth. Nothing
in the public API v1 (`/api/v1/*`) offers any mutation — every route in
[`ULTRA_LIVE_API_V1.md`](../api/ULTRA_LIVE_API_V1.md) is `GET`-only. There is no public write
path to a score, a stat, a record, or anything else this platform considers basketball truth.

## Recommended workflow

1. **Discover the live game.** `GET /api/v1/live` → `{ games: [...] }`. Empty when nothing is
   live — poll this on a slow cadence (every 30-60s) when idle.
2. **Poll the game.** Once you have a `fixtureId`, poll
   `GET /api/v1/games/{fixtureId}/snapshot` every 5-10 seconds for score/clock/leaders/team
   comparison. This mirrors the same cadence our own public `/live` page and browser sources use
   — no reason for a third party to poll faster than the data can actually change.
3. **Read events, if you need them.** `GET /api/v1/games/{fixtureId}/events` for a play-by-play
   feed — only available (`available: true`) for `EVENT_LEVEL`/`FULL_ULTRA` games; check
   `capability` first and don't assume events exist.
4. **Render independently.** Nothing about how you draw the data is our concern — text, a full
   broadcast overlay, a mobile widget. `generatedAt`/`dataUpdatedAt` let you show your own
   staleness indicator if your consumer polls less often than we update.

## Respect the rate limit

120 requests/minute per IP (`X-RateLimit-Remaining` in every response). A single consumer
polling one live game every 5s uses 12 requests/minute — comfortably inside the limit. If you're
building something that needs a higher rate (a real broadcast partner, not a hobby integration),
that's exactly the future PARTNER tier described in `ULTRA_LIVE_API_V1.md` — talk to us rather
than working around the limit.

## What you will never get from this API

Any private field (Part I/LVII: no emails, phones, application/admin notes, medical info, audit
detail). Any way to distinguish a REHEARSAL game from "doesn't exist" — both return
`GAME_NOT_FOUND`. Fabricated data for a `BOX_SCORE_ONLY` historical game — there is no 4PT/Ultra
Time/event data for any of Season Zero's 11 real historical games, and this API will never
invent any.
