---
title: Entrant Fixture Sides Plan
status: In progress (B1, B2 and B3 complete)
version: entrant-sides-1.1
last_updated: 2026-09-16
---

# Entrant-Authoritative Fixture Sides (Staged Plan)

Individual and pair/relay sports (tennis, athletics, boxing, esports 1v1) do not compete as Clubs.
Today a fixture side is a required `SeasonClub`, which blocks them. This plan moves a fixture side to
**either a SeasonClub or an Entrant**, in stages that keep the application green and Season Zero
untouched. See `MULTI_SPORT_ARCHITECTURE.md` decision D1.

## Why Entrant-authoritative (not clubs-for-people)

Rules and organizer-specific configuration already live in the rule layers (sport definitions,
`SportDefinitionOverride`, `RuleSet`/`GameRuleSnapshot`, validators, capability modules) and are
orthogonal to this choice. What changes here is the **participation model**, which determines how
well the platform absorbs future sports and formats: one athlete in many events, tennis draws and
seeds, boxing weight classes, doubles pairs, entry limits, multi-event registration. Entrant supports
all of these; a club-per-person bridge does not, and it leaks synthetic "clubs" into the club
directory, fan clubs, branding, and sponsorship.

Stage 2 already created one TEAM Entrant per SeasonClub and backfilled the fixture entrant sides, so
the entrant side already resolves for existing fixtures.

## Stages

### B1 — Resolver + parity check (done)

- `web/src/lib/sports/fixture-sides.ts`: the single seam read paths use —
  `sideSeasonClubId`, `sideEntrantId`, `oppositeSide`, `requireSeasonClubId` (throws for team-only
  paths), `sideLabel`, `isIndividualSport`.
- `web/scripts/fixture-sides-parity-check.ts` (`npm run fixture-sides:parity-check`): verifies each
  entrant side maps back to its SeasonClub side, that no dangling entrant references exist, and
  reports entrant-side coverage. Read-only.
- No schema or behaviour change.

### B2 — Schema flip (done)

- `Fixture.homeSeasonClubId` / `awaySeasonClubId` are **nullable**; a CHECK constraint requires each
  side to reference a SeasonClub **or** an Entrant (`20260915160000_fixture_side_entrant`). Applied
  to staging and production via `prisma migrate deploy` (additive; all existing rows pass).
- Measured blast radius was ~370 TypeScript errors across ~74 files.

### B3 — Read migration (done)

All compiler-surfaced read sites were migrated so the application builds with nullable sides:
- Team-sport paths (live console, stats/reconciliation, broadcast, public API, content, analytics,
  dashboard, vision, rehearsals) use non-null assertions where a SeasonClub is guaranteed by the
  CHECK.
- `fixture-sides.ts` remains the resolver seam; individual-sport paths (B4) will use it rather than
  the raw columns.

Follow-up: replace the team-path assertions with the resolver opportunistically as those files are
touched, so the entrant side becomes first-class everywhere.

### B4 — Individual standings and onboarding (done)

- `Standing.seasonClubId` is **nullable** with a unique `entrantId` and a CHECK that a standing
  references a SeasonClub or an Entrant (`20260916100000_standing_entrant`). Applied to staging and
  production.
- `recalculateStandings` now computes **Entrant-keyed** standings for fixtures whose sides are
  entrants (individual sports) and SeasonClub-keyed standings for team sports, through the same
  engine. Validated on staging: a tennis pilot (4 individual entrants, 6 round-robin fixtures, set
  scores) produced entrant standings with set-ratio tiebreaks.
- Individual onboarding data path: `scripts/individual-pilot-setup.ts` creates INDIVIDUAL entrants
  with no Club and entrant-sided fixtures.

Remaining tennis wiring: register a tennis scoring module (points -> games -> sets -> match,
`tennis-scoring.ts`) in the capture dispatch and surface a capture panel, so individual matches can
be scored live rather than seeded by script.

- `Standing`: make `seasonClubId` nullable and add `entrantId` (org/season-scoped) so individual
  sports get their own standings rows.
- Onboarding: register individual/pair Entrants (and their members) without a Club.
- Wire the tennis scoring engine (`tennis-scoring.ts`) into the capture dispatch once fixtures exist.

## Guardrails

- Season Zero basketball parity is unaffected at every stage (all stage-B changes are additive).
- No stage lands without `fixture-sides:parity-check` = `PARITY OK` and a clean build.
- Production changes are applied with a verified backup and the git-based deploy.
