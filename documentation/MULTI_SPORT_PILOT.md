# Multi-sport pilot: tennis (best-of-3, individual entrants)

Status: **engine and data verified; the capture console for tennis is not built.** Written 2026-10-18
(streak v5, Prompt 3). The point of this pilot is to prove the multi-sport architecture outside basketball
and to name exactly where it stops.

## What was run

`scripts/tennis-pilot.ts` (`--organization <org> --actor <user> [--keep]`):

1. **Onboard** — a `Competition` on the tennis `Sport`, a `Division` ("Singles"), a `Season`, and a
   `RuleSet` carrying `{ SETS_TO_WIN: 2, GAMES_PER_SET: 6, TIEBREAK_ENABLED: true }` (best-of-3).
   Four **`Entrant`** rows of type `INDIVIDUAL`, each linked to a real `Athlete` through `EntrantMember`.
   **No `SeasonClub`, no `Club`, no roster** — that is the architectural claim being tested.
2. **Score** — six round-robin matches. Each point goes through `awardPoint()` (deuce/advantage, first to 4
   with a 2-point lead), each game through `isSetComplete()`/`setWinner()`, each set through the same
   `TennisConfig` a console would use.
3. **Persist** — entrant-vs-entrant `Fixture` rows (`homeEntrantId`/`awayEntrantId`, season clubs `null`),
   a `Game` per match, and one `GamePeriodScore` per **set** (the generic period model: for tennis the
   period IS the set).
4. **Stand** — `computeSeasonStandings(TENNIS, entrants, fixtures)`.

## Results (staging, 2026-10-18)

```
entrants: Tobi Adebayo, Chidi Okafor, Femi Lawal, Seyi Balogun
best-of-3 rule set (SETS_TO_WIN=2)
  Tobi Adebayo  4-6 7-5 6-0  Chidi Okafor   -> 2-1 (HOME)
  Tobi Adebayo  6-4 5-7 0-6  Femi Lawal     -> 1-2 (AWAY)
  Tobi Adebayo  4-6 7-5 6-0  Seyi Balogun   -> 2-1 (HOME)
  Chidi Okafor  6-4 5-7 0-6  Femi Lawal     -> 1-2 (AWAY)
  Chidi Okafor  4-6 7-5 6-0  Seyi Balogun   -> 2-1 (HOME)
  Femi Lawal    6-4 5-7 0-6  Seyi Balogun   -> 1-2 (AWAY)

standings (wins, then set ratio, then game ratio):
  Femi Lawal      W2 L1 · sets 5-4 · set ratio 1.250
  ...
PASS: 4 entrants, 6 matches, standings consistent (wins sum to 6, ordered)
```

- Set scores persist as `GamePeriodScore` rows: `1:4-6 2:7-5 3:6-0` per match.
- Standings rank by **wins, then set ratio, then game ratio**, and the head-to-head tiebreak decided the
  two players level on both wins and ratio (the winner of their match was placed first).
- Six matches, six decisive results, no draws (tennis forbids them and `matchOutcome` honours that).

## The public pages render it

The public tournament sub-site resolves the **default public organization**, so the pilot was also run in
the public org (neon-ultra on staging):

| route | result |
| --- | --- |
| `/t/<slug>` | **200** — "Tennis", "Singles", the season, and **three INDIVIDUAL entrant rows** |
| `/t/<slug>/fixtures` | **200** |

A competition created in another organization (LBCL) returns **404** from `/t/<slug>` — not a tennis bug:
the route is scoped to `resolveDefaultPublicOrganization()`. Worth knowing when a league expects its own
sub-site; a per-organization public route is future work.

## What does NOT work yet (stated plainly)

1. **The capture console has no tennis mode.** `src/lib/sports/tennis-scoring.ts` has said so since it was
   written: *"wiring it into the shared capture dispatch additionally needs (a) tennis live-state
   (points/games) plumbed through the capture action and (b) individual-entrant fixtures … tested and
   ready, not yet registered in the console."* This pilot drives the same functions the console would, but
   an operator cannot click through a tennis match today.
2. **No tennis standings page that reads `Entrant` rows via the standings engine.** The public sub-site
   lists entrants and fixtures; the *computed* table (with set ratio) exists in the engine and in this
   script, not as a page. Basketball standings still read `SeasonClub`.
3. **The sport definition's default is best-of-5** (`structure.periodsToWin: 3`). A best-of-3 event needs
   the `SETS_TO_WIN` override, which the pilot writes as a `RuleSet.config` and uses explicitly — the
   console would have to read it back.
4. **No knockout bracket for tennis.** The format is round-robin; `knockout-bracket.ts` exists but is not
   exercised here.

## What the pilot did NOT break

No basketball assumption broke during the pilot: entrant fixtures, entrant members, per-set
`GamePeriodScore`, and the standings engine all accepted the tennis data without modification. The gaps
above are **missing wiring**, not conflicts in the model — which is the distinction the architecture doc
promised, and the reason no additive fix was needed in this slice.

## How to re-run

```bash
cd /opt/ultraos-staging/current/web
set -a; . /opt/ultraos-staging/shared/web.env; set +a
DATABASE_URL=... node --conditions=react-server --import tsx scripts/tennis-pilot.ts \
  --organization <orgId> --actor <userId> [--keep]
```

Without `--keep` it deletes the competition, division, season, rule set, entrants and fixtures it created.
Use the public org (neon-ultra on staging) if you also want to see the `/t/<slug>` pages.
