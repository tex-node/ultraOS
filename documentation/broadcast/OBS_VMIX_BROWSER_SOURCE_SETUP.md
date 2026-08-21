# OBS / vMix Browser Source Setup

G.20, Part XLVI. Per-graphic practical setup, verified against the actual deployed behavior
(not guessed) — see `LIVE_GRAPHICS_SYSTEM.md` for what each graphic shows.

All routes are unauthenticated (an OBS/vMix Browser Source can't log in), production-scope-gated
(a REHEARSAL game 404s), transparent-background (`TransparentBody`, G.19), and self-polling
(`GraphicRefresher` — no manual refresh needed once added as a source).

| Graphic | URL | Recommended size | FPS | Refresh | Auth |
|---|---|---|---|---|---|
| Score Bug | `/broadcast/game/{gameId}/scorebug` | 420×100 (content-sized; give it room) | 30 | Polls every 3s | None |
| Player Spotlight | `/broadcast/game/{gameId}/player-spotlight?playerId={id}` | 420×220 | 30 | Polls every 5s | None |
| Leader | `/broadcast/game/{gameId}/leader` | 400×260 | 30 | Polls every 5s | None |
| Team Comparison | `/broadcast/game/{gameId}/team-comparison` | 380×300 | 30 | Polls every 5s | None |
| Record Watch | `/broadcast/game/{gameId}/record-watch` | 400×160 | 30 | Polls every 5s | None |
| Milestone | `/broadcast/game/{gameId}/milestone` | 380×140 | 30 | Polls every 5s | None |
| Game Story | `/broadcast/game/{gameId}/game-story` | 440×180 | 30 | Polls every 5s | None |
| Ultra Time | `/broadcast/game/{gameId}/ultra-time` | 500×260 | 30 | Polls every 3s | None |
| 4PT Moment | `/broadcast/game/{gameId}/four-point-moment?eventId={id}` | 400×180 | 30 | Polls every 5s | None |
| Final Score | `/broadcast/game/{gameId}/final` | 500×220 | 30 | Polls every 5s | None |

`{gameId}` is the internal `Game.id` (not the fixture id) — copy it from `/broadcast/control`'s
"Open browser source →" link rather than constructing it by hand; that link is always correct and
already includes any `?playerId=`/`?eventId=` the graphic needs.

## OBS setup steps

1. Sources panel → **+** → **Browser**.
2. Paste the URL from `/broadcast/control` (don't type it by hand).
3. Width/Height per the table above — these are generous defaults; the card is `inline-flex`
   (sized to its own content), so a too-small region only clips, it never distorts.
30 FPS is plenty; none of these graphics animate beyond the `⚡ ULTRA TIME` pulse and text
changes on refresh.
4. Leave **"Shutdown source when not visible"** unchecked if you want it to keep polling in the
   background scene; checking it is also fine since a fresh page load always shows current state.
5. No login prompt should ever appear. If one does, something is wrong — check
   `EXTERNAL_GRAPHICS_DATA_CONTRACT.md`/`BROADCAST_GRAPHICS_FAILURE.md`.

## vMix setup steps

1. Add Input → **Web Browser**.
2. Same URL/size guidance as above.
3. vMix's Browser Source composites transparency correctly against the `TransparentBody`
   override — verified via `getComputedStyle(document.body).backgroundColor` reading
   `rgba(0,0,0,0)` on every graphics route (G.19's transparency fix).

## Recovery

See `BROADCAST_CONSUMER_RECOVERY.md` — every graphic recovers from a reload, a service restart,
or a brief network interruption automatically, with no manual re-selection needed.
