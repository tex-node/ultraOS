# Four-Point Spatial Rule

G.22, Part VI, XLVII-XLVIII. `src/lib/vision/four-point-spatial-rule.ts`
(`evaluateFourPointSpatialQualification()`), fully unit-tested.

## The translation this function performs

`RuleSet.fourPointDefinitionType` names a rule concept (Season Zero: `OPPOSITE_HALF_ORIGIN` - "a
4PT shot is one released from the opposite half of the court from the shooter's own basket").
This function translates that concept into a real geometric evaluation, given a shooter's court
coordinate, which basket they're attacking, and an `OFFICIAL` `CourtSpecification`.

## Four possible results - never a plain boolean

`QUALIFIES` / `DOES_NOT_QUALIFY` / `BOUNDARY_UNCERTAIN` / `GEOMETRY_UNAVAILABLE`. Part VI's own
instruction: "do not use a boolean only if uncertainty matters" - here it clearly does, both
because calibration always carries some positional error and because the geometry itself may not
exist yet.

## GEOMETRY_UNAVAILABLE - the honest default today

Returned whenever: the rule is `DESIGNATED_ZONE` (no polygon geometry has ever been entered
anywhere in this codebase for that variant), or the court specification is missing, still
`DRAFT`, or lacks `halfCourtX`. Since no `CourtSpecification` has ever been marked `OFFICIAL` in
this environment (0 rows exist with `status: OFFICIAL`), **every real call to this function today
returns `GEOMETRY_UNAVAILABLE`** - proven by the unit tests, not claimed.

## BOUNDARY_UNCERTAIN - positional error is never ignored

A `positionalUncertaintyUnits` parameter (typically a calibration's reprojection error) creates a
margin around the half-court line. A shot whose estimated position falls within that margin
returns `BOUNDARY_UNCERTAIN` rather than an arbitrary QUALIFIES/DOES_NOT_QUALIFY - Part XLVIII's
own instruction: "do not make a binary claim if positional error overlaps the line."

## What this function will never do

Change a canonical `GameEvent`'s `basePointValue`, `points`, `isFourPointAttempt`, or the
official score. Every call site is a read-only validation signal for human review - see
`CANONICAL_EVENT_ALIGNMENT.md`'s "AI vs. human disagreement" section. When canonical truth and a
vision spatial validation disagree, canonical truth wins, always, unconditionally.
