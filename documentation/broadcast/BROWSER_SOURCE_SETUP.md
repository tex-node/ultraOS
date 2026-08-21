# Browser Source Setup (OBS / vMix)

G.19, Part XXX, XL. How to actually put a graphic on stream. For per-graphic size/FPS
recommendations and step-by-step OBS/vMix instructions, see
[`OBS_VMIX_BROWSER_SOURCE_SETUP.md`](./OBS_VMIX_BROWSER_SOURCE_SETUP.md) (G.20) — this page
covers the underlying mechanism (polling, transparency, recovery); that one covers the practical
per-source checklist.

## Adding a source

1. In OBS: Sources → + → Browser. In vMix: Add Input → Web Browser.
2. URL: copy the "Open browser source →" link from `/broadcast/control`'s Preview or Program
   card — it's already the exact `/broadcast/game/[gameId]/<type>` URL, with `?playerId=`
   appended when the graphic needs a subject.
3. Width/height: each graphic sizes to its content (`inline-flex`); pick a canvas region large
   enough for the card and position it per `LIVE_GRAPHICS_SYSTEM.md`'s suggested placement — score
   bug top-left, a spotlight/story card as a lower-third, Ultra Time centered/upper.
4. Check "Shutdown source when not visible" OFF if you want it to keep polling in the background;
   ON is fine too since a fresh page load always shows current state (Part XLI).

## Refresh strategy: polling, not WebSockets

Every graphic route includes `GraphicRefresher`, which calls `router.refresh()` every 3-5 seconds
(the score bug and Ultra Time overlay poll every 3s; everything else every 5s). This re-runs the
server component, which re-reads Snapshot V2/Presentation Model/Presentation State fresh from
Postgres — the same "measure actual need before reaching for WebSockets" call G.18's public
`/live` page already made (Part XL). A 3-5 second lag on a score bug is imperceptible to a
spectator; it is not imperceptible for the scorer/statistician consoles, which correctly remain
their own separate, faster-updating surfaces this system never touches.

## Recovery is automatic

Because every graphic re-derives its content fresh from Postgres/SystemSetting on each poll (or
page reload), there is no client-side state to lose. Reload the browser source, restart the
`ultraos-web` service, or lose network for a few seconds — the next successful poll shows the
correct current state with zero manual re-selection. Proven directly in the G.19 rehearsal (see
`runbooks/LIVE_PRESENTATION_REHEARSAL.md`).
