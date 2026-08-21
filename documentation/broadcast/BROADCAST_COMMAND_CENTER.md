# Broadcast Command Center

G.18, Parts XVIII-XX. `/broadcast/stats` now leads with a **Commentator Command Center** section
for any currently live game(s), above the existing Season Zero season-wide dashboard (unchanged).

## What it shows

Score, period, clock, shot clock, Ultra Time state (`⚡ ULTRA TIME ×2` banner, or a countdown when
approaching), game leaders, team comparison, an "Ultra Intelligence" panel (4PT makes per team —
only rendered for `FULL_ULTRA` games, absent entirely for `BOX_SCORE_ONLY`), deterministic
**talking points**, and a **Record Watch** panel when any player is tied with or approaching a
real Season Zero single-game record.

Every field comes from the same `buildLivePresentationModelForGame()` call the public Game
Center uses — see [`LIVE_PRESENTATION_MODEL.md`](../analytics/LIVE_PRESENTATION_MODEL.md). The
commentator never sees a different version of the game than a spectator does.

## Talking points are templates, not generated text

Per Part XIX's explicit instruction ("Do not use an LLM for the first implementation.
Deterministic templates are safer and faster."), `buildTalkingPoints()` produces plain
conditional strings from already-validated facts — a rebounding-margin sentence, a 4PT tally, an
Ultra Time state note, and one line per active record watch. No generative model is involved
anywhere in this pipeline.

## Verified in the G.18 rehearsal

The Command Center's underlying data (not the authenticated HTML render — see the limitation
below) was verified directly: Ultra Time correctly reported `ACTIVE`, the 4PT block matched the
real ledger, leaders correctly ranked the top scorer, team comparison excluded fabricated
PAINT/BENCH rows, and record watch correctly reported a `TIED` Season Zero points record for a
rehearsal player pushed to the exact record value.

## G.19 update: Story, Pulse, and Suggestions added; extracted into a shared component

`CommentatorCommandCenter` moved to its own file
(`src/app/broadcast/commentator-command-center.tsx`) so `/broadcast/stats` and the new
authenticated rehearsal counterpart, `/rehearsal/broadcast/[fixtureId]`, render the literal same
component — never two implementations that could drift. It now also shows the Live Game Story
(with its own "Provisional" label), a Game Pulse summary line (lead changes/ties/largest
lead/current run), and a Graphics Suggestions panel (`buildGraphicSuggestions()`) with a link
into `/broadcast/control` — informational only, per G.19 Part XLIV: this dashboard still never
becomes a broadcast-control surface itself; TAKE/CLEAR only exist on the control panel.

## Known limitation

`/broadcast/stats` requires an authenticated session. Verifying its actual rendered HTML has not
been possible for the same reason that has applied to every authenticated surface all track —
entering a password to obtain a session is prohibited regardless of authorization. Its
correctness is instead established by: (1) it calls the exact same
`buildLivePresentationModelForGame()` the rehearsal scripts verify directly, and (2) the
component rendering it was typechecked and built successfully. A logged-in operator visually
confirming the page is the one verification step this project could not perform itself.
