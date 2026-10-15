# Glossary

Domain terms resolved in ADRs. Platform-wide terminology (Athlete, Player, Club, SeasonClub,
Fixture, Game, ...) is defined in `documentation/`; this file adds terms as they are settled.

## Coaching Assistant (ADR-011)

- **Development Plan**: a coach-private, ranked list of Focus Areas and Strengths for one Player,
  computed from season data. Not shown on public or athlete-facing surfaces.
- **Focus Area**: one skill dimension a player should develop, with Evidence, a Drill Block and a
  Target. Coach-facing term; public pages say "developing area" and never prescribe.
- **Strength**: a dimension where the player sits clearly above position peers; something to keep
  using.
- **Drill Block**: the drills attached to a Focus Area, taken from the drill registry
  (`lib/coaching/drills.ts`).
- **Target**: a measurable goal for a Focus Area (metric, current value, target value, review
  window in games).
- **Evidence**: the facts behind a recommendation: metric, player value, baseline, percentile,
  sample size, gate, Confidence.
- **Confidence**: `HIGH` or `MEDIUM`, from sample size relative to the metric's gate. Below the
  gate there is no recommendation, only `INSUFFICIENT_DATA`.
- **Position Group**: `GUARD`, `WING` or `BIG`, derived from `Player.position`; the peer group for
  baselines. Falls back to the whole league when there are too few peers.
- **Game Plan**: a coach-private plan for one focus club against one opponent: Keys to the Game,
  defensive assignments, Ultra Time plan.
- **Key to the Game**: one prescriptive point in a Game Plan, with Evidence and Confidence.
