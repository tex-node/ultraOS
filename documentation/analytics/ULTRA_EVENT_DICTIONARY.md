# Ultra Event Dictionary

Every `GameEventType` value in `prisma/schema.prisma`, what it means, which console writes it,
and whether it's actually used in code today. This is the canonical vocabulary for the
`GameEvent` ledger — see [`ULTRA_LIVE_DATA_ARCHITECTURE.md`](./ULTRA_LIVE_DATA_ARCHITECTURE.md)
for how the ledger fits into the wider system.

## Scoring

| Event | Written by | Notes |
|---|---|---|
| `SCORE` | Scorer (`recordScore`) | The scorer's own made-shot entry. Carries `basePointValue`/`multiplier`/`points`, `homeScoreBefore/After`, `awayScoreBefore/After`. |
| `SCORE_CORRECTION` | Scorer (`correctScoreEventAction`) | Supersedes a `SCORE` event via `supersedesEventId`; original flips to `status: CORRECTED`, never deleted. |
| `SHOT_ATTEMPT` | *(unused)* | Reserved for a future "logged an attempt, outcome pending" flow. Not written anywhere yet. |
| `SHOT_MADE` | Statistician (`recordStatisticianShot`, `shotValue` 2-4, `made: true`) | Independent of `SCORE` — does not affect `Fixture.homeScore`/`awayScore`. |
| `SHOT_MISSED` | Statistician (`recordStatisticianShot`, `shotValue` 2-4, `made: false`) | `points: 0`. First event type in this system that actually records a miss — the scorer console never has. |
| `FREE_THROW_ATTEMPT` | *(unused)* | Same reservation pattern as `SHOT_ATTEMPT`. |
| `FREE_THROW_MADE` | Statistician (`shotValue: 1`, `made: true`) | |
| `FREE_THROW_MISSED` | Statistician (`shotValue: 1`, `made: false`) | |

## Rebounding

| Event | Written by | Notes |
|---|---|---|
| `REBOUND` | Scorer (`recordStatEvent`) | Coarse — doesn't distinguish offensive/defensive. Still valid; the scorer console wasn't changed to require the split. |
| `OFFENSIVE_REBOUND` | Statistician (`recordStatisticianStat`) | Added in G.15. Matches `PlayerStat.offensiveRebounds`. |
| `DEFENSIVE_REBOUND` | Statistician (`recordStatisticianStat`) | Added in G.15. Matches `PlayerStat.defensiveRebounds`. |

## Playmaking / defense / fouls

| Event | Written by | Notes |
|---|---|---|
| `ASSIST` | Scorer or Statistician | Same event type, either console. |
| `TURNOVER` | Scorer or Statistician | |
| `STEAL` | Scorer or Statistician | |
| `BLOCK` | Scorer or Statistician | |
| `FOUL` | Scorer or Statistician | Optional `fouledPlayerId`/`foulType` (`PERSONAL`/`TECHNICAL`/`FLAGRANT`/`OFFENSIVE`). |

## Player participation

| Event | Written by | Notes |
|---|---|---|
| `SUBSTITUTION` | Statistician (`recordSubstitution`) | **G.16:** structured, not text-encoded — `playerId` is who came IN, the new `substitutedOutPlayerId` field is who went OUT, both on the same event. Validated against the actual derived lineup before being written (`src/lib/lineup.ts`). Never written by the scorer console. |

## Game control

| Event | Written by | Notes |
|---|---|---|
| `GAME_STARTED` | *(unused)* | Game lifecycle is currently tracked via `Game.status`, not a ledger event. Reserved for a future explicit ledger-first lifecycle. |
| `PERIOD_STARTED` / `PERIOD_ENDED` | *(unused)* | Same — `advancePeriod()` mutates `Game.currentPeriod` directly today. |
| `GAME_ENDED` | *(unused)* | `finalizeGame()` mutates `Game.status`/`Fixture.status` directly. |
| `TIMEOUT` | *(unused)* | Defined for future use; no console currently exposes a timeout button. |

## Ultra-specific

| Event | Written by | Notes |
|---|---|---|
| `ULTRA_TIME_STARTED` / `ULTRA_TIME_ENDED` | System (`syncUltraTimeState`, scorer console only) | Fired automatically the moment the clock crosses the Ultra Time boundary — never entered manually. `seasonClubId` is `null` (game-level, not team-attributable). |

## Admin / correction

| Event | Written by | Notes |
|---|---|---|
| `EVENT_CORRECTION` | *(unused)* | `SCORE_CORRECTION` is used for score-specific corrections today; non-score corrections currently go through the void+re-enter pattern rather than a dedicated correction event. Reserved. |

## Mandatory substitution confirmation — not a `GameEvent`

The mandatory second-half substitution *confirmation* (Ultra Rules Engine, Track H) is a manual
attestation recorded entirely via `AuditLog` (`action: "MANDATORY_SUBSTITUTION_CONFIRMED"`), not
a `GameEvent`. It confirms a team *did* make its mandatory change, but is not linked to any
actual `SUBSTITUTION` event — see the honest gap noted in
[`ULTRA_LIVE_DATA_ARCHITECTURE.md`](./ULTRA_LIVE_DATA_ARCHITECTURE.md#what-this-track-did-not-do).
