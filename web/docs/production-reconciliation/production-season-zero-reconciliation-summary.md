# Production Season Zero Reconciliation — Summary

Generated against live production (`ultraleagueos`) vs staging (`ultraos_staging`) by email-based matching.

## Players (58 selected)

| Category | Count | Meaning |
|---|---|---|
| Clean (needs Ultra ID or registration only) | 36 | Single, unambiguous production identity already APPROVED (or already provisioned as a Player) — safe to reconcile automatically once schema supports it. |
| Needs application approval (SUBMITTED → APPROVED) | 15 | Single, unambiguous production identity, but the production Application was never approved — approving it is a real administrative decision, not inferred here. |
| **Needs rejection-reversal decision** | 3 | Single, unambiguous production identity, but production explicitly REJECTED this application. Approving it now reverses a past administrative decision — requires explicit human sign-off. |
| **True identity ambiguity (duplicate Applications)** | 4 | Multiple distinct Application rows share this email — a human must decide which submission is authoritative before any write. |
| Missing from production entirely | 0 | No Application, no existing Player record, found by this email in production. |

**Gate result: FAILED.** 22 of 58 selected players require a human decision before any Season Zero metadata can be written to production. No player metadata was written this session.

## Coaches (9 selected)

| Category | Count |
|---|---|
| Clean (existing Staff, needs Ultra Staff ID once schema supports it) | 8 |
| Missing from production (expected — offline intake) | 1 |
| Ambiguous | 0 |

**Gate result: PASSED** (0 ambiguous) — structurally blocked anyway until the pending migrations (Ultra Staff ID, Season Zero selection columns, DraftCoachPoolEntry) are deployed to production.

## Why so many players show "not approved" in production

Season Zero player selection was performed entirely on staging — applications were approved and curated there without the same approvals ever being made in production. Production's approval status is therefore not a reliable proxy for "was this person selected"; it only tells you whether production's own admin flow ever reviewed them.
