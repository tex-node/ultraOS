# Broadcast Presentation State

G.19, Part XXIII, XXXVIII-XLI. `src/lib/broadcast-presentation-state.ts` +
`src/lib/broadcast-graphics.ts` (shared types).

## Storage: the existing SystemSetting model, no migration

One row, `key = "broadcast:presentation-state"`, `value` a JSON blob:

```
{ preview: PresentationSlot, program: PresentationSlot, updatedAt, updatedById }
PresentationSlot = { graphicType, gameId, subjectId } | null
```

Chosen specifically because the track brief asked to "prefer no migration if SystemSetting can
safely hold this" — it can, cleanly, since this state is a singleton with no relational shape.

## Why Postgres, not memory: restart recovery is free

Because the state lives in the same database every other read already hits, a service restart
loses nothing — the very next request re-reads the same row. The G.19 rehearsal proved this
directly: a `getBroadcastPresentationState()` call immediately after a `takeToProgram()` call
returns byte-identical `updatedAt`/`program` fields, simulating exactly what a post-restart first
request would see.

## Operations

- `getBroadcastPresentationState()` — read, defaults to an empty state if the row doesn't exist yet.
- `setPreview(slot, actorId)` — writes Preview only. Not audited (a purely visual, frequent,
  harmless selection — Part XXV's own call).
- `takeToProgram(actorId)` — atomically copies Preview into Program. **Audited**
  (`BROADCAST_GRAPHIC_TAKE`) — this is the one action that changes what's actually on air.
- `clearProgram(actorId)` — clears Program only, leaves Preview untouched. **Audited**
  (`BROADCAST_GRAPHIC_CLEAR`).

## Public read: `/api/broadcast/program`

Read-only, unauthenticated (matching `/api/games/[id]/snapshot-v2`'s existing public exposure —
Program state is exactly what a spectator's screen shows anyway). Exposes **Program only, never
Preview** (operator-only awareness) and never `updatedById` (an internal user id). Re-validates
production scope on every read: if Program somehow points at a non-PRODUCTION game, the endpoint
reports `null` rather than leaking it — proven directly by the G.19 rehearsal (Program pointed at
a REHEARSAL game; the API reported `program: null`).
