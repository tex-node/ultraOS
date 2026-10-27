# Final launch proof — LBCL Season 2 readiness

**Date:** 2026-10-27 · **Environment:** staging (`/opt/ultraos-staging`, staging database) · **Script:**
`web/scripts/final-end-to-end-proof.ts` · **Receiver:** `web/scripts/proof-webhook-receiver.mjs`

The question this answers: *can someone stand up a league on this platform, play a match, have partners receive it, and
take the data away — without a developer touching the database?*

The answer is yes, with one caveat stated up front and explained in full below: **the browser flows are server actions**,
so the proof drives the services those actions call rather than the buttons themselves. Everything that can be verified
over HTTP — the partner webhook delivery — is verified over HTTP.

---

## The run

```
=== FINAL END-TO-END PROOF · Proof League mvqpxaeg ===

  PASS  organization created                       Proof League mvqpxaeg (proof-league-mvqpxaeg)
  PASS  football round robin created               2 clubs · 2 fixtures (home and away)
  PASS  10 players registered                      10 athletes · 10 PLAYER applications on season cmvqpxan…
  PASS  partner subscription created               subscribed to SCORE_CHANGED + WIN_PROBABILITY_UPDATED
  PASS  match played and finalised                 3-1 · fixture FINAL
  PASS  SCORE_CHANGED emitted                      4 deliveries · drain attempted 8, delivered 8, retried 0
  PASS  WIN_PROBABILITY_UPDATED emitted            4 deliveries
  PASS  standings updated                          Proof City P1 W1 D0 L0 pts3 · Proof Rovers P1 W0 D0 L1 pts0
  PASS  league exported                            Proof League mvqpxaeg Cup (football) · 2 fixtures serialised

PASS: 9 steps - a league from nothing to an exported result
```

What the webhook receiver actually received (from `/tmp/proof-webhooks.jsonl`):

```
deliveries: 8
by event type: {"SCORE_CHANGED":4,"WIN_PROBABILITY_UPDATED":4}
signature header present on every delivery: true
first payload keys: id, type, sentAt, game, event
```

## Step by step, and what each step really exercised

| # | Step | Mechanism | Evidence |
| --- | --- | --- | --- |
| 1 | Organization created | `organization.create` + **new** `allocateOrganizationPrefixes` | unique slug `proof-league-mvqpxaeg` |
| 2 | Football round robin | `createLeague` (the wizard's own service) | 2 clubs, 2 fixtures (home and away) |
| 3 | 10 players registered | the same Athlete + PLAYER Application writes the public form performs | 10 athletes, 10 applications linked to the season |
| 4 | Partner subscription | `createFeedSubscription` with a **real HTTP endpoint** | subscription id, two event types |
| 5 | Match played | `createGame` + `applyScoringDelivery` ×4 goals + `GAME_ENDED` | final score 3–1, fixture `FINAL` |
| 6 | `SCORE_CHANGED` | outbox row → `drainFeedDeliveries` → HTTP POST | 4 emitted, 8 delivered (two events per goal carried both types) |
| 7 | `WIN_PROBABILITY_UPDATED` | same path | 4 emitted, signature on every delivery |
| 8 | Standings | `recalculateStandings` on finalisation | Proof City P1 W1 pts3 · Proof Rovers P1 L1 pts0 |
| 9 | Export | the same query `scripts/export-league-data.ts` uses | competition + 2 fixtures serialised |

## Why the UI buttons are not clicked

The onboarding wizard, the public registration form and the capture console are **Next.js server actions**. Their action
ids are generated at build time and are not a stable HTTP contract, so a script cannot POST to them the way a browser
does. The proof therefore calls the services those actions call — `createLeague`, the athlete + application writes,
`applyScoringDelivery` — which is the documented API/DB equivalent of the click.

**This is a real limitation, not a shrug:** a change that breaks the *wiring* between a form and its action (a renamed
field, a missing hidden input) would not be caught here. That class of defect is covered by the component suite and by
the browser-level checks recorded in earlier streaks, and a headless browser pass over the three forms is the obvious next
investment.

The partner feed is the exception and that is deliberate: it is the part where "it worked in a script" would prove the
least, so a real subscriber receives real signed POSTs.

## Two defects this proof found before a customer could

**1. A second organization could never be created.** `Organization.idPrefixAthlete` / `.idPrefixStaff` are globally
`@unique` with defaults `"UBA"` / `"UBS"`, and the onboarding wizard created organizations without supplying them. The
first tenant on a database worked; **every one after it failed** with
`Unique constraint failed on the fields: ("idPrefixAthlete")`. Self-serve onboarding was broken for exactly the customers
it exists for. Fixed by `allocateOrganizationPrefixes()` — derived from the slug (a public id shows its prefix, which is
the point) and extended with a counter until free.

**2. Football did not finalise, so standings were empty.** The first run reported `3-1 · fixture LIVE`: the last goal
does not end a football match, and standings count `FINAL` fixtures only, so both clubs showed P0. The proof now sends
`GAME_ENDED` and closes the fixture with exactly one winner column — which is what the capture console does.

## What is still manual for LBCL Season 2

| Task | Why it is manual | Where it happens |
| --- | --- | --- |
| Issuing the partner API key and posting it to the sportsbook | a secret must not travel through a script in a repo | `/settings/api-keys`, then the Bachs/webhook console |
| Registering the production Bachs webhook URL | it is a dashboard action at Bachs | Bachs dashboard → `/api/webhooks/bachs` |
| Setting the season's fixtures and venues | the round robin generator produces the schedule; venues are chosen by the operator | `/admin/setup-wizard`, then the season's fixture list |
| Approving the ten registered players | registration creates `SUBMITTED` applications on purpose; approval is a human decision | `/applications` |
| A sandbox Bachs key on staging | needs a sandbox key from the Bachs dashboard | `shared/web.env` → `BACHS_KEY` |

## Reproducing

```bash
# on the host, from the deployed source tree
set -a; . /opt/ultraos-staging/shared/web.env; set +a
export DATABASE_URL=<staging>
node scripts/proof-webhook-receiver.mjs 4599 /tmp/proof-webhooks.jsonl &
node --conditions=react-server --import tsx scripts/final-end-to-end-proof.ts --webhook-url http://127.0.0.1:4599/proof
```

Without `--keep` the proof removes its league again (children before parents), so a repeated run does not leave
`proof-league-*` rows behind.
