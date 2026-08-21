# Player Minutes and Lineups

The deterministic lineup stint reconstruction and verified minutes engine (G.17, Parts IV-VI),
built in `src/lib/lineup-stints.ts` on top of G.16's starting-five (`GameStarter`) and structured
substitution (`GameEvent.substitutedOutPlayerId`) capture.

## The clock model (audited first, per Part IV)

Every `GameEvent` — including `SUBSTITUTION` — already carries `period` and `clockSeconds` (the
game clock's **seconds remaining** in that period at the moment it happened, the same convention
every scoring/stat event already uses). This is the only temporal signal this engine trusts.
`createdAt` (a wall-clock timestamp) is never used — it reflects real-world data-entry timing,
not in-game elapsed time, and the two can diverge (a statistician entering a stat a few seconds
late doesn't mean the game clock moved).

`periodDurationFor(period, rules)` returns the regulation length (`600s`, matching
`RuleSet`/`GameRuleSnapshot.periodDurationSeconds`) for `period <= periodCount`, or the overtime
length (`300s`) beyond it. A `LEGACY_CLOCK_RULE_SNAPSHOT` fallback (2×600s, mirroring
`ultra-scoring-engine.ts`'s own legacy default) covers any game with no persisted
`GameRuleSnapshot`.

## Lineup stints (`reconstructLineupStints`)

Given one team's confirmed starting five and its own ACTIVE structured substitutions (ordered by
`sequenceNumber`), reconstructs the ordered sequence of 5-player lineups that team fielded, each
stint's duration computed purely from the clock points that bound it
(`elapsedSecondsBetween`).

**Never silently repairs malformed history.** Returns an explicit error instead of guessing when:
- the team's starting five is missing or not exactly 5 distinct rostered players,
- a substitution tries to sub out a player who isn't on court,
- a substitution tries to sub in a player already on court,
- clock ordering runs backward (an event's clock point earlier than the previous one).

## Minutes (`deriveMinutesFromStints`, `verifyTeamMinutes`)

Player minutes are summed directly from stint durations — never estimated, never rounded until
display (`formatMinutes()` renders `MM:SS`). A player who never enters simply never appears in
the derived map (0 minutes, not fabricated).

**Integrity check (Part VI):** for standard 5-player basketball, `5 × team elapsed seconds` must
equal the sum of every player's stint-seconds for that team — exactly 5 players are on court at
every moment, so this must hold exactly if the reconstructed history is genuinely consistent.

| Confidence | Meaning |
|---|---|
| `MINUTES_VERIFIED` | Stints reconstructed cleanly and the 5x-elapsed integrity check passed exactly. |
| `MINUTES_INCOMPLETE` | Stint reconstruction hit a validation error, or the integrity check failed — never trusted anyway, never fabricated. |
| `MINUTES_UNAVAILABLE` | No starting five was ever confirmed for this team in this game. |

Proven end-to-end in the G.17 rehearsal: both teams' minutes reconstructed as `MINUTES_VERIFIED`
with `actualTeamPlayerSeconds === expectedTeamPlayerSeconds` exactly, across multiple
substitutions and stints, including a real concurrent-substitution race (see
[`STARTING_FIVE_AND_SUBSTITUTIONS.md`](../gameday/STARTING_FIVE_AND_SUBSTITUTIONS.md)).

## Plus/minus

**Not built.** Reliable plus/minus requires mapping every scoring event's timestamp onto lineup
stints precisely — the same clock-point data this engine already uses makes this feasible in
principle, but it was not implemented or tested this track. Treat as `PLUS_MINUS_NOT_SUPPORTED`
rather than an approximation.
