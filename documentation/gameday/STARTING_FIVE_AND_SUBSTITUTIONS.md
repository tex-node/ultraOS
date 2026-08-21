# Starting Five & Substitutions

G.16's structured lineup model, replacing G.15's text-encoded substitution direction.

## Starting five (`GameStarter`)

Before any statistician entry unlocks on `/games/[fixtureId]/stats`, both teams must confirm
exactly five rostered players each. Never auto-selected, never inferred from the first
statistical event — the console shows a checkbox grid per team and requires exactly 5 selections
before the **Confirm starting five** button will submit anything meaningful (`confirmStartingFive()`
in `src/app/games/stats-actions.ts` also validates server-side: exactly 5, all rostered, no
duplicates). Re-confirming a team replaces its prior selection — still fully audited both ways
(`STARTING_FIVE_CONFIRMED` in `AuditLog`) — rather than erroring, so a pre-tip-off correction
doesn't need a workaround.

## Structured substitutions (`GameEvent.substitutedOutPlayerId`)

One `SUBSTITUTION` event now records a whole swap: `playerId` is who came IN,
`substitutedOutPlayerId` is who went OUT — replacing G.15's two separate directional events with
the direction only readable from free text. `recordSubstitution()` validates the swap against
the *actual current lineup*, derived fresh inside the same locked transaction as the write
(`src/lib/lineup.ts`'s `deriveLineup()` + `validateSubstitution()`):

- the player coming IN must currently be on the bench,
- the player going OUT must currently be on court,
- the same player can't be both,
- a duplicate submission of an already-completed swap is rejected for free (the "OUT" player is
  no longer on court, so it fails the same check without a special-case duplicate rule).

## Current lineup (`getGameLineup`)

`deriveLineup(startingFive, substitutions)` is a pure function: the starting five plus every
ACTIVE substitution, applied in `sequenceNumber` order, deterministically reconstructs who is on
court at any point — including after a service restart, since nothing here lives only in memory.
The statistician console shows **On court** / **Bench** groupings per team, live.

## What this does not yet do

- **Minutes are not derived.** The building blocks (starting five + structured substitution
  events with clock snapshots) now exist, but stint-based minutes math is deliberately deferred
  until it can be validated against a real game's full clock history — see
  [`CANONICAL_LIVE_STATISTICS.md`](../analytics/CANONICAL_LIVE_STATISTICS.md#what-g16-explicitly-did-not-build).
- **Shot/stat entry is not gated by on-court status.** `recordStatisticianShot`/`recordStatisticianStat`
  don't check whether the selected player is currently on court before accepting a stat for them
  — only substitutions themselves are lineup-validated. A deliberate scope boundary, not an
  oversight: cross-validating every stat against lineup state adds real complexity for a benefit
  (catching a rare data-entry timing slip) that wasn't judged worth it this track.
- **Mandatory second-half substitution confirmation remains manual.** Now that real structured
  substitution events exist, the ledger *could* in principle report compliance automatically, but
  the existing rule policies (`MandatorySubstitutionPolicy`: `NONE` / `AT_LEAST_ONE_PER_HALF` /
  `FULL_ROTATION`) aren't specific enough to derive "satisfied" purely from event presence
  without risking a false positive (e.g. a substitution that technically occurred but doesn't
  meet the intended spirit of the rule). The existing manual confirmation checkbox
  (`confirmMandatorySubstitution`, unchanged) stays authoritative.
