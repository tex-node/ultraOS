# Statistician Console Operator Guide

How to run the statistician console at `/games/[fixtureId]/stats` during a live game. This is a
**separate** role and a **separate** console from the scorer (`/games/[fixtureId]/live`) — see
[`SEASON_ZERO_OPERATOR_ROLE_MATRIX.md`](../runbooks/SEASON_ZERO_OPERATOR_ROLE_MATRIX.md) for how
this fits alongside the scorer, Event Director, and check-in roles.

## Access

Requires the `game:record-stats` permission, held by `SUPER_ADMIN`, `LEAGUE_OPERATOR`, and
`OFFICIAL` accounts — the same roles that already hold `game:operate` (the scorer permission).
In practice, use two different logged-in devices/accounts for the scorer and statistician roles
during a real game, even though one account technically has both permissions — the value of this
system comes from two people working independently, not from a single person clicking two
screens.

## Before the game

The statistician console only becomes available once the scorer has started the game
(`Start game` on `/games/[fixtureId]/live`). Open `/games/[fixtureId]/stats` — it shows both
rosters, a reconciliation panel, and an empty event feed until you start recording.

**G.16: confirm both starting fives first.** Before any shot/stat buttons unlock, each team's
panel shows a checkbox grid of its full roster — select exactly 5 and tap **Confirm starting
five**. This is never auto-selected or guessed; both teams must be confirmed before the console
opens up the rest of its controls. See
[`STARTING_FIVE_AND_SUBSTITUTIONS.md`](./STARTING_FIVE_AND_SUBSTITUTIONS.md).

## Recording a stat

1. **Tap a player's name** in either team's roster grid. The page reloads with that player
   selected (highlighted in green) and stays selected across every stat you record next — you
   only re-tap the roster when the ball changes hands to a different player.
2. **Tap the stat**: `FT+`/`FT miss`, `2PT+`/`2PT miss`, `3PT+`/`3PT miss`, `4PT+`/`4PT miss`,
   `OFFENSIVE REBOUND`, `DEFENSIVE REBOUND`, `ASSIST`, `STEAL`, `BLOCK`, `TURNOVER`, `FOUL`,
   `SUB IN`, `SUB OUT`. Each tap submits immediately — no confirmation dialog, no dropdown.
3. For a foul with a known fouled player or foul type, open **Foul detail** first — it's
   optional and separate from the quick `FOUL` button, since most fouls in the flow of a real
   game don't need that detail captured in the moment.

Ultra Time's 2× multiplier is applied automatically by the server the same way it is for the
scorer — you never enter a multiplier yourself, and the button labels show the doubled value
(e.g. `4PT+ →8`) whenever Ultra Time is active.

## If you make a mistake

**Undo last statistician entry** reverses only your own most recent entry — it never touches
the scorer's events, and the scorer's own "Undo last event" never touches yours. The two
ledgers are independent all the way down, including undo.

## Score reconciliation

The panel at the top of the console shows, per team: the **official** score (from the scorer)
and the **statistical** score (derived purely from your own recorded made shots). Three states:

- **UNAVAILABLE** — you haven't recorded anything yet. Normal at kickoff.
- **MATCHED** — your derived score agrees with the official scoreboard. Good.
- **MISMATCH** (red banner) — the two disagree. This does not stop the game and does not
  auto-correct either side. Check the event feed against what actually happened; if you find
  your own missed/extra entry, use Undo or record the missing one. The scorer console also shows
  a red "SCORE RECONCILIATION REQUIRED" banner linking back here whenever this happens and
  statistics haven't been verified.

## Verifying statistics

Once you're confident the ledger is accurate — normally at the final buzzer — an authorized
user (same permission tier as finalizing the game result) taps **Verify statistics**. If the
reconciliation is `MATCHED`, verification is immediate. If it's `MISMATCH`, verification
requires a written reason — it does not force the two scores to agree first, since a real
discrepancy sometimes has a legitimate explanation (e.g. a scorer's team-only correction with no
statistician-side event to match it) that shouldn't block the record from being marked reviewed.

**Verification is not the same as finalizing the game.** The Event Director can finalize the
official result on the scorer console at any time, with or without statistics verified — verifying
statistics only marks the box score as reviewed, it never blocks the competitive result.

If you record any new stat after verification, the verified badge is automatically cleared (and
the clearing is logged) — a stale "VERIFIED" label is worse than an honest "needs re-verification."

**G.16: verification now materializes the canonical box score.** Tapping Verify statistics
doesn't just stamp a badge — it runs `rebuildGameStatsFromEvents()`, which derives player and
team totals from your ledger and writes them into `PlayerStat`/`TeamStat` (tagged
`statSource: EVENT_DERIVED`). Before this, verification was cosmetic; now it's the actual gate
that promotes your ledger into the game's real box score. Running verification again (e.g. after
fixing a mismatch) safely re-derives and overwrites those same rows — idempotent by design.

## Live derived box score

Below the reconciliation panel, a **Live derived box score** section shows player and team
totals computed live from your own ledger — before verification, before finalization. This is a
read model only (nothing is written to it), so you can sanity-check your own work as you go
rather than waiting until the end to discover a mistake.

## G.17: minutes, post-final corrections, and native-vs-official reconciliation

The live derived box score now shows each player's minutes next to their line, with a
confidence label (`VERIFIED`/`INCOMPLETE`/`UNAVAILABLE` — see
[`PLAYER_MINUTES_AND_LINEUPS.md`](../analytics/PLAYER_MINUTES_AND_LINEUPS.md)).

Once a game is `FINAL`, the event feed grows a **Correct or remove this entry (post-final)**
control per event — see [`POST_FINAL_STAT_CORRECTIONS.md`](../analytics/POST_FINAL_STAT_CORRECTIONS.md).
Any correction clears verification automatically; re-verify the same way as always afterward.

A **Native vs. official reconciliation** link now sits next to the scorer-console link at the top
of the page, opening `/games/[fixtureId]/stats/reconciliation` — compare this game's native
totals against an official/PDF report field by field. See
[`NATIVE_VS_OFFICIAL_RECONCILIATION.md`](../analytics/NATIVE_VS_OFFICIAL_RECONCILIATION.md).

## Known limitations

- **No dedicated PNG/export for statistician-only cards** — the statistician console is an
  input tool, not a presentation surface. Use `/broadcast/graphics` after the game for shareable
  cards built from the final box score.
- **Plus/minus is not derived.** See `PLAYER_MINUTES_AND_LINEUPS.md`.
- **Shot/stat entry isn't blocked for a player who's technically on the bench** — only
  substitutions themselves are validated against the current lineup. A deliberate scope choice,
  not an oversight.
- **Statistician events don't feed the official box score.** They exist for reconciliation and
  the event feed. See [`ULTRA_LIVE_DATA_ARCHITECTURE.md`](../analytics/ULTRA_LIVE_DATA_ARCHITECTURE.md#what-this-track-did-not-do).
