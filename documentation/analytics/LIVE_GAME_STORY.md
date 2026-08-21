# Live Game Story

G.19, Part VI-VII. `src/lib/live-game-story.ts` (`buildLiveGameStory()`). Deferred by G.18 with
the reasoning "a materially different, partial version risked exactly the fabricated/approximate
data this project has consistently avoided" — G.19 resolves that by reusing the real engine
instead of building a second one.

## Reuse, not reinvention

`classifyGameStory()` (`analytics/game-story.ts`, historical, unchanged) now accepts
`GameStoryInput = Pick<GameCore, "home" | "away" | "periods">` instead of the full `GameCore` —
a narrowing, not a behavior change, done specifically so `buildLiveGameCore()` can build an
honest live view (score, live box score rebounds/4PT, period-boundary checkpoints) without
fabricating `divisionName`/`scheduledAt`/`players` fields the classifier never reads.

```
Snapshot V2 + Game Pulse's scoring chronology
  -> buildLiveGameCore()   (live-derived GameStoryInput)
  -> classifyGameStory()   (the SAME historical engine, unchanged)
  -> buildLiveFacts()      (deterministic templates)
  -> LiveGameStory { tags, facts, provisional }
```

## What's honestly available live, and what isn't

The live event-derived engine (`event-derived-stats.ts`) never populates `benchPoints`,
`pointsInPaint`, or `pointsFromTurnovers` — those are official-PDF-import-only fields.
`classifyGameStory()` already null-guards every tag that needs them, so BENCH_IMPACT,
PAINT_DOMINANCE, and TURNOVER_PRESSURE simply never fire live. No live-game-story.ts code needed
to re-implement "only emit tags with sufficient provenance" — it falls out of the existing
null-guards for free.

CLOSE_GAME, DOMINANT, OVERTIME, WIRE_TO_WIRE, SHOOTOUT, DEFENSIVE_BATTLE, COMEBACK,
SECOND_HALF_TAKEOVER, and REBOUNDING_EDGE are all real, live-computable tags.

## Period checkpoints only count once a period has actually ended

`buildLivePeriods()` only includes a period in the checkpoint list once a later period has
scoring (or the game is FINAL) — the in-progress period's running score is never treated as a
completed checkpoint. Without this, COMEBACK/SECOND_HALF_TAKEOVER could fire on a number that's
still changing possession by possession.

## PROVISIONAL until FINAL + VERIFIED

`provisional: !(isFinal && verified)` — the exact same gate `canPromoteToOfficialRecord()`
already uses for records, applied here too rather than a second promotion rule.

## Facts are templates, not generated text

`buildLiveFacts()` — plain conditional strings over already-validated numbers ("Flux has erased
an 8-point deficit", "Vortex leads the rebounding battle 18–11"). No LLM, no prediction language
("will win"), no emotional claims ("dominated mentally") — those aren't objectively defined by
this data and were explicitly out of scope per the track brief.
