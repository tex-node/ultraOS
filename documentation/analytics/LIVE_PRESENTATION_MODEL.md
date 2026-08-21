# Live Presentation Model

G.18, Part III. `src/lib/live-presentation-model.ts` (`buildLivePresentationModel()`) — the one
adapter every presentation surface (public Game Center, broadcast Commentator Command Center)
consumes. Pure function, no database access, per the track's own core rule:

```
CANONICAL EVENTS -> PlayerStat/TeamStat/Lineups/Minutes -> LIVE SNAPSHOT V2
                  -> PRESENTATION MODEL -> (public/broadcast/commentator/graphics)
                  -> SAME GAME TRUTH
```

No presentation surface calculates its own version of the game — every number a page shows
traces back through this one adapter to Snapshot V2 (G.17) to the canonical `GameEvent` ledger
(G.15/G.16).

## What it composes

| Field | Built from |
|---|---|
| `ultraTime` | `deriveUltraTimeState()` — see below |
| `ultraScoringFeed` | Filters `latestEvents` to made Ultra-Time shots, preserving `basePointValue`×`multiplier` provenance |
| `fourPoint` | Capability-gated (`null` unless `FULL_ULTRA`) from `liveBoxScore.teams` |
| `leaders` | Passed straight through from Snapshot V2 (already reuses the historical efficiency formula) |
| `teamComparison` | Only FG%/REB/AST/TOV/PF — the categories the live event-derived engine actually computes; never a fabricated PAINT/BENCH row |
| `momentFeed` | Spectator-friendly text per event, via `describeMoment()` — transformation only, never alters the underlying event |
| `recordWatches` | `watchPlayerRecords()` (`provisional-records.ts`) comparing live totals against the *existing* Season Zero Record Book |
| `liveMilestones` | `detectLiveMilestones()` (`live-milestones.ts`) — in-game thresholds only |
| `talkingPoints` | Deterministic templates over the above — no LLM, no generative text |

## Ultra Time: derived fresh, never trusted from a stored flag

**A real defect found and fixed during the G.18 rehearsal.** `Game.isUltraTimeActive` is only
synced by the scorer's `syncUltraTimeState()` when a *scoring* action happens near the boundary —
a game that crosses into Ultra Time with no shot attempt yet (a rebound, a pass, a few quiet
seconds) would read stale/`false` from that stored flag alone. `buildLiveGameSnapshotV2()` now
recomputes Ultra Time fresh from clock/period/status via the same `isUltraTimeUnderRules()`
primitive the scorer's own write path uses (`ultra-scoring-engine.ts`) — never a second,
independently-stored copy of the same truth.

```
UltraTimeState =
  | { phase: "INACTIVE" }
  | { phase: "APPROACHING"; secondsUntilStart: number }   // only surfaced within 30s of the boundary
  | { phase: "ACTIVE" }
```

## Record Watch: another defect found and fixed

A fixed ±3 "approaching" margin meant *every* player still at 0 in a category whose real record
value is itself only 1 or 2 (e.g. a single-game blocks record of 1) got flagged as "approaching"
it — the rehearsal surfaced eight duplicate "Most Blocks — Game: 1 away" entries for players who
simply hadn't recorded a block yet. Fixed: `checkRecordWatch()` now requires `liveValue > 0`
before considering a record "approaching" — a player must have actually recorded something in
the category first.

## G.19 update: Live Game Story and Live Game Pulse are now built

The items this section originally deferred were built in G.19 once Snapshot V2 gained the
per-event running score (`homeScoreAfter`/`awayScoreAfter`, already added by G.18) needed to
reconstruct period checkpoints and score chronology. `gameStory: LiveGameStory | null` and
`gamePulse: LiveGamePulse` are now fields on `LivePresentationModel` — see
[`LIVE_GAME_STORY.md`](./LIVE_GAME_STORY.md) and [`LIVE_GAME_PULSE.md`](./LIVE_GAME_PULSE.md).
`players: DerivedPlayerStats[]` was also added (passed straight through from Snapshot V2, same as
`leaders`) so the Player Spotlight graphic could show a full per-player line, not just the
per-category leader value.

## What was originally deferred here, and how G.19 resolved it

**Live Game Story** (Part XII) — reusing `classifyGameStory()` for a genuinely live game would
need per-period live score tracking Snapshot V2 didn't carry yet; building a materially
different, partial version risked exactly the "fabricated/approximate data" this whole project
has consistently avoided. Resolved by narrowing `classifyGameStory()`'s parameter type
(`GameStoryInput = Pick<GameCore, "home"|"away"|"periods">`) and reusing the unchanged function
against a live-derived view, rather than writing a second classifier. **Live Game Pulse** (lead
changes, largest lead, scoring runs) — no historical Game Pulse module exists in this codebase to
extend either, contrary to what earlier tracks assumed; G.19 built the live-only version as a
pure reducer over the new scoring chronology, since no historical counterpart was ever promised.
