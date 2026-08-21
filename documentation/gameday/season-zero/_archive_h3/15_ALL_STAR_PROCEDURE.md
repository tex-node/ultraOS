---
title: Season Zero All-Star Exhibition Procedure
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero All-Star Exhibition Procedure

## Purpose

Zenith vs Pulse, 17:00, closing the day before trophy presentation. This
procedure is deliberately separate from the competitive game procedures —
do not mix All-Star controls with an official competitive fixture's controls.

## Architecture (confirmed, do not regress)

- Runs entirely on `NoveltyTeam` / `NoveltyMatch` / `NoveltyGame` — completely
  isolated from the competitive `Club` / `Fixture` / `Standing` tables.
- Confirmed via an automated regression test (part of `npm test`, 38/38
  passing) that the exhibition scoring code path can never write to
  competitive Standing/Fixture/SeasonClub.
- Drafting a player onto Zenith or Pulse does **not** touch
  `Player.seasonClubId` — their real club assignment is untouched.

## Current roster state (verified at H.3)

Both teams have their **4 coaches locked in** (2 men's-division, 2
women's-division each — see
[Coach Verification Pack](11_COACH_PACK.md)). **Players are intentionally
still open** — `playersAssignedOnMatchDay: true` — to be picked live at the
event itself, the same reserve-drafting pattern used for late roster
additions this season.

## Match-day player selection

1. Operator with `staff:manage` opens `/participants/all-star-roster`.
2. For each team, select from the dropdown of currently-rostered players and
   currently-assigned coaches (grouped by gender) — never type a name by
   hand.
3. Required composition, enforced by the server, not just the form: **2 men's
   + 2 women's players** and **2 men's + 2 women's coaches** per team
   (coaches already complete).
4. The system rejects: the same player added twice, the same player on both
   teams, and a 3rd player of either gender once the quota of 2 is reached.

## Roster lock

1. Once a team's roster reaches the full quota (2+2 players, 2+2 coaches),
   the **Lock roster** button becomes available.
2. Lock it before the exhibition starts.
3. After locking, normal add/edit is blocked — confirmed by the H.2
   rehearsal (edit attempts after lock were correctly rejected).
4. If a genuine correction is needed after locking, **Unlock** requires a
   written reason and is fully audited. Re-lock once corrected.

## Running the exhibition

Scoring, stat entry, clock, and shot clock for the exhibition use the same
scorer console pattern as competitive games, at
`/novelty-matches/[matchId]/live` — but this writes to `NoveltyGame`, not
`Game`. Confirm you are on the correct screen for the exhibition, not
accidentally still on fixture 12's console.

## Verification after the exhibition

Compare competitive Standing before and after the exhibition match — they
must be identical. This was explicitly proven in the H.2 rehearsal (standings
isolation check passed) and should be spot-checked again on the day as a
final confidence check, not because there's reason to expect a problem.

## Related Topics

- [Coach Verification Pack](11_COACH_PACK.md)
- [Fixture List](09_FIXTURE_LIST.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
