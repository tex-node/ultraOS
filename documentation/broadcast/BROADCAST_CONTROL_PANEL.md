# Broadcast Control Panel

G.19, Part XXII-XXVI, XLII-XLIII. `/broadcast/control`
(`src/app/broadcast/control/page.tsx` + `actions.ts`).

## Scope boundary (the core principle this track keeps enforcing)

> The broadcast operator controls WHAT THE AUDIENCE SEES. The scoring/statistics system
> controls WHAT IS TRUE.

This panel's server actions (`setPreviewAction`, `takeAction`, `clearProgramAction`,
`clearPreviewAction`) only ever call into `broadcast-presentation-state.ts`, which only ever
writes the `broadcast:presentation-state` `SystemSetting` row. There is no code path from this
file into `Fixture.homeScore`/`Game.status`/`PlayerStat`/`TeamStat`/`Standing`/lineups — not "the
UI doesn't expose it," the module genuinely has no dependency capable of it.

## G.20 update: Program health is monitored, never auto-repaired

`/broadcast/diagnostics` (G.20) watches Program state for structural validity (a Program
referencing a deleted fixture, or a REHEARSAL fixture in normal operation) and reports it
`CRITICAL` — but has no write path back into this panel's state. An operator still has to fix an
invalid Program by hand via CLEAR/TAKE here; diagnostics only ever tells you something is wrong,
consistent with the "surface it, do not silently correct it" rule that governs every monitoring
feature this track added. See [`BROADCAST_DIAGNOSTICS.md`](./BROADCAST_DIAGNOSTICS.md).

## Authorization

A new, narrow permission: `broadcast:operate` (`src/lib/permissions.ts`), granted to
`SUPER_ADMIN` and `LEAGUE_OPERATOR` only — not `OFFICIAL` (which has `game:operate`/
`game:record-stats` instead, the correct separation: running the broadcast is a different job
from officiating the game). `requirePermissionOrRedirect` gives an anonymous visitor a clean
login redirect rather than a 500, matching the established G.16 pattern.

## Discovery: PRODUCTION by default, REHEARSAL only when explicitly asked

`/broadcast/control` with no query string only ever discovers `LIVE`/`PAUSED` fixtures with
`recordOrigin: PRODUCTION` (`productionPresentationFixtureWhere()`). `?rehearsal=<fixtureId>`
switches to looking up exactly that one `REHEARSAL`-origin fixture instead — never a rehearsal
fixture appearing unprompted in the normal list. See `LIVE_GRAPHICS_OPERATOR_GUIDE.md` for the visual
"rehearsal mode" indicator this triggers.

## Persistence: SystemSetting, no migration

See `BROADCAST_PRESENTATION_STATE.md` for the storage design.
