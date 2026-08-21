# Ultra Court Specification

G.22, Part IV-V, VII. `CourtSpecification` model + `/vision/videos`.

## What was audited before writing this (again)

Before adding any schema, the codebase was re-audited for official court geometry, exactly as
G.21 did: `game-rules.ts`'s `ULTRA_RULES` (no spatial fields), `RuleSet`/`GameRuleSnapshot` (has
`fourPointDefinitionType` as a rule *label*, zero geometric parameters), `Venue` (spectator
capacity/seating only, no court dimensions). **Conclusion unchanged from G.21**: no official Ultra
court geometry exists anywhere in this system. This document describes the configuration
architecture built to eventually hold it - not the values themselves, because they aren't known.

## Where court truth lives, and why it's Venue-scoped

`CourtSpecification` is tied to `Venue`, not `RuleSet`. Physical court dimensions are a property
of a physical place; the 4PT *rule* (which zone qualifies) stays owned by
`RuleSet.fourPointDefinitionType`, unchanged. This split avoids duplicating court truth (Part V's
own warning) - a rule variant and a physical court are genuinely different things that happen to
both matter for one calculation.

## DRAFT vs. OFFICIAL - the safety mechanism

Every `CourtSpecification` starts `DRAFT`. Every geometry field is nullable and starts null - no
default ever gets filled in with a guess. `markCourtSpecificationOfficial()` is a separate,
explicit, audited action (`AuditLog: COURT_SPECIFICATION_MARKED_OFFICIAL`) - only an `OFFICIAL`
specification is ever used by `four-point-spatial-rule.ts` or any future zone classifier. A
`DRAFT` specification with values filled in is not close-enough to official; it's simply not used
for evaluation at all until someone deliberately promotes it.

## Fields

`courtLengthUnits`/`courtWidthUnits`/`units` (defaults `"meters"`, never assumed accurate until
filled), `originDescription` (free text - no single Ultra-wide origin convention exists, see
below), `basketACourtX/Y`/`basketBCourtX/Y`, `halfCourtX`, `paintGeometry`/`threePointGeometry`/
`fourPointGeometry` (all `Json?`, structure intentionally left open since no format has ever been
validated against a real geometry), `effectiveSeasonId` (optional - a court specification can
outlive or predate a specific season).

## Coordinate system (Part VII)

No shared coordinate convention is enforced across specifications - each one's origin/axes are
whatever the entering operator's `originDescription` says they are. This is the same honest
limitation G.21's `COURT_CALIBRATION.md` already disclosed for per-video calibrations; a
`CourtSpecification` doesn't retroactively create a standard the codebase never had. When a real
official specification is eventually entered, its `originDescription` should be written precisely
enough that every future calibration and vision-derived coordinate can be interpreted against it
unambiguously - that discipline is a process requirement, not something the schema can enforce by
itself.

## Attacking direction (Part VIII)

`Game.homeAttacksBasketFirstHalf` (`CourtBasketSide?` - `A`/`B`) is the one new, explicit,
nullable field this track adds to actually interpret a court coordinate spatially.
`attackingBasketForPeriod()` (`attacking-direction.ts`) derives every other period's direction
from this single value via the standard basketball assumption that teams switch baskets at
halftime - a genuine, documented assumption, not a silent default. Set via `/vision/videos`, per
game, never guessed.
