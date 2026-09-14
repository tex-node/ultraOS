---
title: Stage 10 Legacy Decommission Plan
status: BLOCKED — planning only, NOT executed
version: stage10-plan-1.0
last_updated: 2026-09-13
---

# Stage 10 — Legacy Basketball Decommission Plan

Status: **BLOCKED and NOT EXECUTED.** Stage 10 is the only destructive multi-sport stage. Its entry
gate requires G3 (stat parity), G4 (volleyball pilot accepted), G5 (a second additional sport
accepted), **and Season Zero sign-off** — none of which are met. No migration in this plan exists,
and no column or enum is dropped by this document.

This document exists so that when the gates are met, decommissioning is a reviewed procedure rather
than an improvisation.

## 1. Guardrails

1. Never drop a column or enum that a production read path still touches. Establish zero reads
   first.
2. Prefer **compatibility views/shims → stop writes → freeze with no reads → drop** over any
   single-step removal.
3. Every drop is irreversible without a backup restore. Backup + verified restore precedes it.
4. Season Zero basketball behaviour must be provably unchanged before, during, and after.
5. Historical games must remain explicable: a played game's rules and event vocabulary are frozen
   in `GameRuleSnapshot` and `GameEvent.typeKey`/`data` before any legacy source is removed.

## 2. Hard preconditions

- [ ] Multi-sport migrations (Stages 1.3–7) applied and the backfills run per
      `MULTI_SPORT_STAGING_MIGRATION_BACKFILL_RUNBOOK.md`.
- [ ] `entrant:parity-check`, `metrics:parity-check`, `rules:parity-check`,
      `standings:parity-check`, `events:parity-check`, `registration-sport:parity-check` all report
      `PARITY OK`.
- [ ] **G3**, **G4**, and **G5** closed.
- [ ] Season Zero sign-off recorded by the league owner.
- [ ] A full season (or an agreed observation window) run with generic reads only and no rollback.
- [ ] Fresh verified backup; restore rehearsal completed.

## 3. Legacy inventory

| Object | Legacy | Generic replacement | Notes |
| --- | --- | --- | --- |
| `PlayerStat` | basketball box-score columns (`points`, `rebounds`, `assists`, `steals`, `blocks`, `turnovers`, `fouls`, `minutesPlayed`, `fieldGoals*`, `twoPoints*`, `threePoints*`, `freeThrows*`, `offensive/defensiveRebounds`, `foulsDrawn`, `plusMinus`, `efficiency`, `didNotPlay`, `fourPoints*`, `assisted/unassistedFourPointMakes`, `ultraTime*`, `statSource`) | `GameMetricValue` rows keyed by `SportMetricDefinition` | Retain a compatibility view until all readers migrate. |
| `TeamStat` | basketball team columns (`points`, `rebounds`, `assists`, `turnovers`, `fouls`, `pointsFromTurnovers`, `pointsInPaint*`, `secondChancePoints`, `fastBreak*`, `benchPoints`, `biggestLead`, `biggestScoringRun`, `pointsPerPossession`, `leadChanges`, `timesTied`, `timeWithLeadSeconds`, `fourPoints*`, `ultraTime*`, `statSource`) | `GameMetricValue` (ENTRANT subject) | — |
| `GameEvent` | `eventType` (`GameEventType`) and basketball-only fields (`basePointValue`, `multiplier`, `made`, `isFourPointAttempt`, `isUltraTime`, `fourPointQualificationMethod`) | `GameEvent.typeKey` + `GameEvent.data` | Keep universal columns (`sequenceNumber`, `period`, `clockSeconds`, `entrantId`, `playerId`, `points`, status/corrections, provenance). |
| `GameEventType` enum | all values | `SportEventDefinition.key` | Drop last; nothing may reference it. |
| `RuleSet` | legacy basketball rule columns | `RuleSet.config` + the sport definition | Snapshot freezes resolved values. |
| `GameRuleSnapshot` | legacy rule fields | `ruleValues` + `definitionVersion` | Historical games read the frozen generic values. |
| Enums | `FourPointDefinitionType`, `MandatorySubstitutionPolicy`, `FourPointQualificationMethod` | rule values / event `data` | Drop only after `RuleSet`/`GameRuleSnapshot` legacy columns are gone. |
| `RegistrationSport` enum | `VOLLEYBALL`, `FLAG_RACE` | `RegistrationParticipantSport.sportId` / `RegistrationForm.sportIds` | Drop only after config reads use `Sport`. |
| `Fixture` sides | `homeSeasonClubId`, `awaySeasonClubId`, `winnerSeasonClubId` | `homeEntrantId`, `awayEntrantId`, `winnerEntrantId` | **Keep `SeasonClub`** — it remains the team-sport participation record; only the fixture side references migrate. |
| `Standing` | — | — | **Keep `seasonClubId`** (team-sport key); `entrantId` complements it for individual sports. Not a drop target. |

## 4. Retirement sequence

**Phase A — compatibility shims (additive).** Introduce read shims so every consumer can read the
generic model: stat compatibility view(s) reproducing the legacy box-score shape from
`GameMetricValue`, and a rule/definition resolver used by scorer, results, standings, PDF, and
broadcast. No writes change.

**Phase B — stop writes to legacy.** New games write only generic rows (`GameEvent.typeKey`/`data`,
`GameMetricValue`, `RuleSet.config`, `GameRuleSnapshot.ruleValues`). Legacy columns become
read-only mirrors (or stop being written) while Phase A shims keep readers working.

**Phase C — freeze and observe.** Run an agreed window (a season) with no legacy writes and no
shims failing. Export/archive legacy tables to cold storage for historical reference. Confirm zero
code references via the Section 5 audit.

**Phase D — drop, in separate reviewed migrations.**
1. Drop `PlayerStat`/`TeamStat` legacy columns (and the tables if fully superseded).
2. Drop `GameEvent` legacy basketball columns.
3. Drop `RuleSet`/`GameRuleSnapshot` legacy columns.
4. Drop the legacy enums (`GameEventType`, `FourPointDefinitionType`,
   `MandatorySubstitutionPolicy`, `FourPointQualificationMethod`, `RegistrationSport`).
5. Drop `Fixture` legacy side columns.

Each step is its own migration, backed up, and gated on the previous step being stable for an agreed
period.

## 5. Read-only audit (run before any Phase D step)

Confirm no remaining references in application and tooling code:

```bash
cd web
rg -n "eventType|basePointValue|fourPointQualificationMethod|isUltraTime" src scripts
rg -n "fourPointsMade|ultraTimePoints|fieldGoalsAttempted|pointsInPaint|benchPoints" src scripts
rg -n "GameEventType|FourPointDefinitionType|MandatorySubstitutionPolicy|RegistrationSport" src scripts
rg -n "homeSeasonClubId|awaySeasonClubId|winnerSeasonClubId" src
rg -n "\\.playerStat|\\.teamStat" src
```

And confirm data has been projected and reconciled (per organization):

```sql
-- Every native/statted game has generic values and a frozen event key.
SELECT count(*) FROM "GameEvent" WHERE "typeKey" IS NULL;                       -- expect 0
SELECT count(*) FROM "Game" g WHERE EXISTS (SELECT 1 FROM "PlayerStat" p WHERE p."gameId" = g.id)
  AND NOT EXISTS (SELECT 1 FROM "GameMetricValue" v WHERE v."gameId" = g.id);    -- expect 0
SELECT count(*) FROM "GameRuleSnapshot" WHERE "ruleValues" IS NULL;             -- expect 0
```

Any non-zero result blocks Phase D.

## 6. Rollback

- Phases A–B are additive and reversible by code change; no schema rollback needed.
- Phase C freeze is reversible by restoring the previous release.
- Phase D drops are **irreversible without a restore**. Recovery is a point-in-time restore of the
  pre-drop backup; historical exports must be retained alongside it.

## 7. Approval checklist

- [ ] All Section 2 preconditions satisfied and evidenced.
- [ ] Audit (Section 5) clean; all parity checks `PARITY OK`.
- [ ] Backup verified; restore rehearsal completed.
- [ ] Phase plan and per-migration rollback approved by the league owner and engineering.
- [ ] Observation window completed with no legacy reads.

Until every box is ticked, Stage 10 remains `Deferred` and **no drop migration may be created**.
