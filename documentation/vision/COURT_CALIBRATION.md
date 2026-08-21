# Court Calibration

G.21, Part XVI-XVIII, XLII. `CourtCalibration` model + `src/lib/vision/court-homography.ts` +
`src/lib/vision/court-zones.ts`.

## What is and isn't defined in this codebase (audited, not assumed)

Before writing any of this, the codebase was audited for existing court/rule geometry:

- `game-rules.ts`'s `ULTRA_RULES` has zero spatial fields (halves, clock, shot-clock, Ultra Time
  threshold/multiplier only).
- `RuleSet`/`GameRuleSnapshot` has `fourPointDefinitionType: FourPointDefinitionType`
  (`OPPOSITE_HALF_ORIGIN | DESIGNATED_ZONE | DISABLED`) - Season Zero's active value is
  `OPPOSITE_HALF_ORIGIN`. This names a RULE CONCEPT (a 4PT shot is one released from the opposite
  half of the court from the shooter's own basket) but stores **no geometric parameters**: no
  half-court coordinate, no court length/width, no per-period basket-side assignment logic
  anywhere in application code (confirmed - `fourPointDefinitionType` is read nowhere outside
  Prisma's own generated client code).
- `Venue` has no court dimensions at all (only spectator capacity/seating).

**Conclusion**: `FOUR_POINT_SPATIAL_VALIDATION_BLOCKED_BY_RULE_GEOMETRY`. The rule *type* exists;
the numbers needed to validate it spatially do not. Per Part XVIII's explicit instruction, this
was not guessed at. `court-zones.ts`'s `FOUR_POINT_AREA` zone exists in the `CourtZone` type for
architectural completeness but its status is always `BLOCKED_MISSING_RULE_GEOMETRY`, and
`classifyCourtZone()` returns `UNAVAILABLE` for every zone (not just the four-point one) - real
court dimensions (length, width) also don't exist anywhere, so even "generic" zones (paint,
wings, corners) cannot be honestly classified today. The zone enum is the extension point; the
classifier is not a working implementation yet.

## Image → court coordinates: a real homography, not a placeholder

`court-homography.ts` implements direct linear transform (DLT) via least-squares normal
equations - a genuine 8-degrees-of-freedom projective transform fit from ≥4 operator-supplied
reference points (`CourtCalibration.referencePoints`). `meanReprojectionError()` reports how well
the fitted transform actually explains its own reference points, so a bad calibration is
detectable rather than silently producing confident-looking garbage coordinates (Part VIII: "if
calibration/tracking confidence is weak, record uncertainty").

## Coordinate system: honestly scoped

`CourtCalibration.units` defaults to `"meters"` but `courtWidthUnits`/`courtLengthUnits` are left
null for Season Zero - there is no confirmed real-world court length/width to fill in. The origin
and axis directions are whatever the calibrating operator's own reference points implicitly
define (typically one baseline corner as origin) - this guarantees internal consistency for one
calibration, but **not** comparability across two different videos calibrated independently. No
shared Ultra court coordinate standard exists yet; this document says so explicitly rather than
implying one.

## One calibration per video, not reused across games

Part XVI notes a fixed camera's calibration could in principle be reused. Not attempted this
track - safely reusing a calibration requires verifying the camera genuinely didn't move between
recordings, which nothing in this system can currently confirm. Every `GameVideo` gets its own
explicit `CourtCalibration` (1:1 relation) instead.

## G.22 update: quality banding + the physical-truth layer this was blocked on

`CourtCalibration` gained `reprojectionErrorUnits`/`qualityBand`, populated by
`classifyCalibrationQuality()` (`calibration-quality.ts`, `HIGH`/`MEDIUM`/`LOW`/`FAILED`, documented
thresholds) - a real function, never run against a real calibration since zero exist. Separately,
G.22 built the physical-truth layer this document's "blocked by rule geometry" conclusion was
waiting on: `CourtSpecification` (Venue-scoped, DRAFT/OFFICIAL gated - see
`ULTRA_COURT_SPECIFICATION.md`). This does not retroactively unblock anything here - zero
`CourtSpecification` rows are `OFFICIAL` today, so `classifyCourtZone()`'s `UNAVAILABLE` result and
this document's core conclusion both stand unchanged. What changed is that there is now a real,
working place to enter official geometry once it's known, rather than no schema at all.
