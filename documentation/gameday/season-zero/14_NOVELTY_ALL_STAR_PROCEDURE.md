---
title: Season Zero Novelty / All-Star Procedure
status: Final
version: docs-2.0
last_updated: 2026-08-13
---

# Season Zero Novelty / All-Star Procedure

## Isolation (verified, not just asserted)

The Novelty Match is architecturally isolated from competitive league state:

- No relation exists from `Standing` to `NoveltyMatch`/`NoveltyTeam` — novelty results structurally cannot affect competitive standings.
- `NoveltyGameEvent`/`NoveltyPlayerStat` are separate tables from `GameEvent`/`PlayerStat`, enforced by an existing automated regression test (`novelty-isolation.test.ts`).
- Adding a participant to the All-Star roster writes only to a `SystemSetting` record and, once played, `NoveltyTeam`/`NoveltyGame`/`NoveltyGameEvent` — none of which have any write path to `SeasonClub`, `Fixture`, `Standing`, or `Player.seasonClubId`.

**NOVELTY_MATCH_ISOLATION: PASS.**

## Current Roster State (verified read-only, 2026-08-13)

- **Zenith**: 0 members, locked=false
- **Pulse**: 0 members, locked=false

Both rosters are currently empty — this is intentional; match-day selection has not happened yet.

## Reserve Coach

Mcspencer Akpan — selected Season Zero coach (MEN), reserve (not one of the 8 competitive head coaches), intended Novelty Match participant. **Not currently added to either roster.** Per instruction, he is not being auto-added — this requires an explicit administrator decision on match day.

## Operator Procedure

1. **Selecting participants** — an administrator with `draft-squad:manage`-equivalent access adds each player/coach to Zenith or Pulse via the All-Star roster tool, targeting 2 male + 2 female players and 2 male + 2 female coaches per team where the pool allows.
2. **Locking the roster** — once composition is confirmed, lock each team (`lockAllStarRoster`). Locking validates the 2M/2F player and coach quotas before allowing it.
3. **Verifying team assignment** — confirm each participant shows against the correct team before proceeding; this is a `SystemSetting` record, not a competitive assignment.
4. **Starting the match** — create the `NoveltyMatch`/`NoveltyGame` for Zenith vs Pulse.
5. **Scoring the match** — use the novelty scoring flow, entirely separate from competitive `GameEvent`s.
6. **Ending the match** — finalize the `NoveltyGame`; result has no effect on competitive standings.

No participants are invented or pre-selected by this document.

## Related Topics

- [Event Director Guide](07_EVENT_DIRECTOR_GUIDE.md)
