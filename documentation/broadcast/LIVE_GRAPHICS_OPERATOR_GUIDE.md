# Live Graphics Operator Guide

G.19. For the person running **live** browser-source graphics (score bug, Ultra Time overlay,
Player Spotlight, etc.) during a game in progress. Requires the `broadcast:operate` permission
(SUPER_ADMIN or LEAGUE_OPERATOR).

Not to be confused with the G.14 **`BROADCAST_GRAPHICS_OPERATOR_GUIDE.md`** (`/broadcast/graphics`,
the historical social/PNG "Graphics Gallery" for FINAL games) — a different system with a
similarly-named guide. This one is for `/broadcast/control` and live OBS/vMix sources.

## Workflow: Preview → TAKE → Program

1. Open `/broadcast/control`. Every currently live PRODUCTION game is listed with a button per
   graphic type.
2. Click a graphic button — it goes to **Preview**. Nothing on air changes yet.
3. Click **TAKE →** — Preview is copied to **Program**, which is what a browser-source graphic
   pointed at that game/type actually shows. This is deliberate: clicking a graphic button never
   puts it on air by itself (Part XXIV).
4. Click **CLEAR PROGRAM** to go blank on air without losing your Preview selection — TAKE it
   right back without reselecting.
5. A **Player Spotlight** needs a subject: the player buttons below the graphic-type row set
   Preview to that specific player.

## Suggestions

Each live game shows a "Suggested" panel — Ultra Time starting, a 4PT make, a provisional
record, a milestone, or a Game Story tag, each with a one-click button that sets it as Preview
(never Program directly). Suggestions are recalculated fresh every page load from the same live
data everything else uses — nothing is stored, so there's no suggestion queue to clear or an old
suggestion to go stale.

## Rehearsal mode

Visit `/broadcast/control?rehearsal=<fixtureId>` to target a specific REHEARSAL-origin fixture
instead of real production games. The page shows a solid fuchsia "⚠ Rehearsal mode — not a real
broadcast" banner the entire time this mode is active — check for that banner before assuming
anything you TAKE is actually going out.

## What this panel cannot do

Score, clock, player stats, records, and lineups are controlled by the scorer/statistician
consoles (`/games/[fixtureId]/live` and `/stats`), never here. If a number looks wrong, fix it
there — the control panel has no path to touch it even if you wanted to.

## Getting a browser-source URL

Each **Preview**/**Program** card has an "Open browser source →" link — copy that URL into
OBS/vMix as a Browser Source. See `BROWSER_SOURCE_SETUP.md`.
