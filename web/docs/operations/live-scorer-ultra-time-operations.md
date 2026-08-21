# Live scorer: 4PT and Ultra Time, operationally

For whoever is running the scorer console at `/games/[fixtureId]/live` during a real game.

## Scoring a shot

Each team's panel has four score buttons: **+1 +2 +3 4PT**. The 4PT button is visually
distinct (violet, glowing border) - it's Ultra's own custom shot type, not "one more number"
next to a standard 1/2/3.

- Tap the button for the shot that was actually made. You never enter the multiplied total -
  the server always computes that.
- When Ultra Time is active, each button shows the doubled value it will actually award (e.g.
  "+2 → 4", "4PT → 8") so there's no mental math mid-game.
- If 4PT is disabled for this specific game's rules, the server will reject a 4PT entry
  outright (`FOUR_POINT_DISABLED`) - this can only happen for a game with a `GameRuleSnapshot`
  that explicitly disables it; every current game uses the legacy default, which has 4PT
  enabled.

## Ultra Time

A banner ("⚡ ULTRA TIME — 2× POINTS") appears automatically once the game enters the final
period with 60 seconds or less on the clock, per the persisted rule snapshot (or the legacy
default if this game has none). You don't need to do anything to turn it on or off - it's
derived from the clock, and the server independently re-derives it on every score/stat entry,
never trusting anything the client displayed.

The boundary is also recorded as an explicit event in the game's event feed
(`ULTRA_TIME_STARTED`/`ULTRA_TIME_ENDED`) the next time any action touches the game (a score,
a stat, a pause, advancing the period) - there's no background ticker, so if nothing happens
for a few seconds right at the boundary, the transition event appears retroactively-timestamped
the next time something does. This is an accepted limitation, not a bug - see
[season-one-livestats-roadmap.md](season-one-livestats-roadmap.md).

**Pausing during Ultra Time ends it.** If you pause the game while Ultra Time is active and
resume a few seconds later with the clock still in range, it will correctly restart (you'll see
two transition events in the feed - that's expected).

## Fixing a mistake

Two different tools exist, for two different situations:

- **Undo last event** (top of the panel) - reverses whatever the *very last* thing entered was,
  whether that was a score or a stat. Use this immediately after a clear misclick.
- **Void or correct** (inside each event feed row, click "Void or correct this entry") - works
  on *any* still-active score event, not just the most recent one:
  - **Void** - "this never happened." Fully reverses the shot's points and stat effects.
    Requires a reason.
  - **Correct** - "this happened, but differently." Pick the right shot value (1/2/3/4PT),
    give a reason, submit. Handles 2PT→3PT, 3PT→4PT, a made shot that should have been a miss
    (void it instead - see below), and a shot credited to the wrong player (not yet exposed in
    this UI - see the "known gaps" note below).
  - A **made shot that should have been a miss** has no points to "correct to zero" - void it.
  - Every void/correction is permanently recorded (who, when, why) in the event feed and the
    audit log. The original entry is never deleted, only marked `VOIDED`/`CORRECTED`.
  - Manual scoreboard corrections (the collapsed "Manual correction" section under each team's
    score buttons, `-1/-2/-3/-4`) remain for the rare case of an unexplained board discrepancy
    that doesn't map to a specific shot event - prefer Undo or Void/Correct when the mistake is
    tied to a real entry.

## Known UI gap

The "Correct" form lets you fix the shot *value* but doesn't currently offer a player picker to
fix a **wrong-player** attribution (the server action, `correctScoreEventAction`, already
supports it - only the UI doesn't expose it yet). For a wrong-player mistake right now: void the
original entry, then re-enter the correct shot for the correct player as a fresh score. This
produces two ledger entries instead of one corrected one, but the final score and stat lines end
up correct either way.
