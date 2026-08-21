# Graphics Suggestions

G.19, Part XXVII-XXVIII. `src/lib/broadcast-suggestions.ts` (`buildGraphicSuggestions()`) — pure,
ephemeral, no database writes at all.

## Suggest only — never auto-TAKE

This module has no import of `broadcast-presentation-state.ts` and cannot write Program even if
it wanted to. Every suggestion is a `{ graphicType, subjectId, reason }` the operator sees and
may click to set as **Preview** — never Program directly (`LIVE_GRAPHICS_OPERATOR_GUIDE.md`'s workflow
still applies: Preview → TAKE is a separate, deliberate step).

## Triggers, in priority order

1. `isFinal` → suggest **Final Score** only (nothing else matters once the game has ended).
2. Ultra Time `ACTIVE` or `APPROACHING` → suggest **Ultra Time**.
3. A 4PT make in the Ultra scoring feed → suggest **4PT Moment**.
4. A `NEW_PROVISIONAL` or `TIED` record watch (not `APPROACHING`) → suggest **Record Watch**.
5. Any live milestone → suggest **Milestone**, scoped to that player.
6. A Game Story tag exists → suggest **Game Story**.

## Why ephemeral

Recomputed fresh from the current `LivePresentationModel` on every page load — there is no
suggestion table, no "dismissed" flag to persist, and nothing to clean up after a game ends or a
rehearsal is torn down. If the underlying data changes, the suggestion list changes on the next
render; there's no stale state to reconcile.
