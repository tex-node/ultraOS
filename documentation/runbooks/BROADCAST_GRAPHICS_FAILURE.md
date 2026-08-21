# Runbook: Broadcast Graphics Failure

G.19. Fast triage for "a graphic isn't showing what it should" during a live broadcast.

## Triage order

1. **Is the game actually PRODUCTION-origin and LIVE/PAUSED?** Every graphic route 404s for a
   non-PRODUCTION fixture, and most return an empty/near-empty card for a game with no relevant
   data yet (e.g. `record-watch` 404s if there's nothing to watch). This is intentional, not a
   failure — see `LIVE_GRAPHICS_SYSTEM.md`'s per-route table for what triggers each one.
2. **Does the browser source show a solid dark box instead of your scene behind it?** The page's
   `<body>` should be transparent (`TransparentBody`) on every `/broadcast/game/[gameId]/*`
   route. If it isn't, check the deployed release actually includes the G.19 transparency fix
   (`release-20260820203320-g19-transparency-fix` or later) — a stale cached OBS browser source
   can also hold an old, pre-fix render; right-click → Refresh in OBS.
3. **Is the number itself wrong?** Every graphic sources its data from
   `buildLivePresentationModelForGame()` — the same call `/live` and `/broadcast/stats` make. If
   the public `/live` page shows the same wrong number, the problem is upstream (scorer/
   statistician console, or the underlying `GameEvent` ledger), not the graphic. If `/live` shows
   the *correct* number and only the graphic is wrong, that's a genuine graphic-layer bug worth
   filing — it should never be possible given every graphic reads the identical model, but if it
   happens, it means a graphic accidentally recomputed something itself rather than reading the
   model (a violation of Part XI worth fixing immediately).
4. **Is Program empty when it should show something?** Check `/broadcast/control` — Program is
   only ever set by an explicit TAKE. A graphic route hit directly by URL still renders on its
   own regardless of Program state (Program only matters for the `/api/broadcast/program`
   endpoint and for the control panel's own "what's on air" display).

## Full outage (nothing under `/broadcast/game/*` responds)

This means `ultraos-web` itself is down, not a graphics-specific failure — check
`systemctl status ultraos-web.service` and the standard deploy runbook, not this one.
