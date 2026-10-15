# Coaching Assistant

Status: Accepted (2026-10-15)

## Context

`web/src/lib/analytics/` is deliberately descriptive. Its rule, stated in
`player-development-context.ts`, is "describe the number, not what to do about it": no
prescriptive advice, no "weaknesses" language, because those modules feed public, broadcast and
athlete-facing surfaces.

Coaches need the opposite: what each player should develop next, and how to beat a known
opponent. Building that inside `lib/analytics` would break its contract and leak advice onto
public pages.

## Decision

A separate layer, `web/src/lib/coaching/`, consumes `lib/analytics` outputs and **may prescribe**,
under these rules:

1. **Coach-private only.** Coaching output is never rendered on public, broadcast, fan, share or
   athlete-public surfaces. Pages return `notFound()` to anyone without access, so they do not
   reveal that they exist (same pattern as `/[vanitySlug]/insights`).
2. **Evidence on every recommendation.** Each Focus Area or Key to the Game carries an `Evidence`
   object: metric, player value, baseline (position peers or league, with peer count and
   median), percentile, sample size, the gate it cleared, and a Confidence level.
3. **Sample-size gates.** Every metric has a minimum sample (games, attempts) in
   `lib/coaching/config.ts`. Below the gate the dimension reports `INSUFFICIENT_DATA` with the
   actual sample. It never produces a recommendation.
4. **Deterministic first.** Recommendations come from a typed rules engine with thresholds in
   config, never magic numbers. Any LLM text (Phase C4) only rephrases the structured output, and
   a validator rejects any number that is not in that output.
5. **Typed signal sources.** `BOX_SCORE`, `EVENT_LEDGER`, `TRAINING` and `VISION_REVIEWED`. Vision
   signals enter only after human review (P14 B4) and are always labelled as such in the UI.
6. **No canonical writes.** The coaching layer reads `GameEvent`, `PlayerStat` and `TeamStat`; it
   never writes them. Coaching-owned data (adopted plans, targets) lives in its own tables.
7. **Feature flag.** `COACHING_ASSISTANT_ENABLED` (server-side env) defaults to off.

### Access

`canViewCoaching(viewer, scope)` in `lib/coaching/access.ts`:

- `SUPER_ADMIN`: any organization.
- `LEAGUE_OPERATOR` / `TOURNAMENT_DIRECTOR` in the scope's organization: any club in it.
- Staff linked to the user and assigned as head or assistant coach of the SeasonClub: that club only.
- The legacy LBCL Insights override email keeps working (`lib/insights-access.ts`).
- Everyone else, including the `COACH` role without a club assignment: no access.

A Game Plan is built *for* a focus club, so access is checked against the focus club; the
opponent can be any club in the same competition.

## Alternatives Considered

- **Prescriptive text inside `lib/analytics`.** Rejected: breaks that layer's public-safe contract.
- **LLM-generated advice from raw stats.** Rejected: unverifiable numbers, so coaches can't trust it.
- **Keep the single-email gate.** Rejected: doesn't scale to the clubs' own coaches.

## Consequences

- Two vocabularies on purpose: public pages say "developing area", coach pages say "focus area".
- Every new coaching metric needs a gate and a baseline before it can recommend anything.
- Small samples (short Ultra format, early season) show more `INSUFFICIENT_DATA`, which is
  intended.

## Out of Scope

Injury or medical advice, load management prescriptions, selection, contract or discipline
decisions.

## Future Evolution

C2 Game Plans, C3 Coach Hub UI, C4 grounded AI briefing, C5 reviewed vision signals
(speed, distance, shot locations). See `docs/agents/prompts/2026-10-15-coaching-assistant-and-vision.md`.
