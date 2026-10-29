# Project retrospective — 2026-10-29

Written at the point where the code is done and the remaining work is a human's: two dashboard actions for billing, one
game of footage, one season launched. This is the document a new maintainer should read third (after `HANDOVER.md` and
`LAUNCH_READY.md`) and the one I would hand to the owner before a two-week holiday.

---

## What was built

UltraLeagueOS is a multi-tenant sports platform that began as a volleyball tournament manager and now runs **eight sports**
(basketball, football, tennis, volleyball, table tennis, cricket, baseball, flag race) with sport-aware scoring engines,
fixture generation (round robin and knockout, byes skipped), standings, Elo ratings and win probabilities. Every tenant's
data is isolated by **PostgreSQL row-level security that is enabled and forced** — not by application filters — with a
canonical policy and a verification script (`deploy/ops/verify-tenant-table.sh`) that checks policy, grants and forced RLS
as the app role.

Around that engine: a **live scoring console** that works offline (local IndexedDB capture, an outbox, and a replay path
that applies the same effects a live tap does — proven by a parity test and a browser test), an **AI vision pipeline**
(YOLO inference in a containerised Celery stack, observation review, ten-second highlight clips uploaded to R2), a
**coaching assistant** (plans, selection advisor, athlete passports), a **sportsbook data feed** (HMAC-signed webhooks,
`/api-docs`, CSV/Excel/photo ingestion), and **Bachs billing** with plan enforcement, a webhook-driven plan ledger, and a
startup guard that refuses to serve a live payment key outside production.

It runs on one hardened VPS with nightly database backups plus a nightly archive of the vision configuration, bounded logs,
memory caps, a deploy that keeps transcripts and cannot be silently filtered, 1,040 unit tests, 26 component tests, 52
database tests, and 8 browser tests — one of which catches a cross-tenant privilege escalation in under 8 seconds.

---

## The three bugs that mattered most

**1. The `UserRoleAssignment` RLS fallback (v22) — a silent privilege escalation.**
`getSessionUser()` read the user's roles through an RLS-forced relation *before any tenant context existed*, so the policy
resolved to the platform default organization, `roles` came back empty, and the code fell back to the legacy `User.role`
column. A league operator whose account had ever been created as `SUPER_ADMIN` signed in **as a platform administrator** and
could open another league's dashboard by editing the URL. It was the only bug found in this project that was both silent and
privilege-escalating, and the Playwright suite found it in 7.9 seconds after thousands of unit tests had passed over it.

**2. The `idPrefixAthlete` collision (v20) — self-serve onboarding was broken for every organization after the first.**
The public-id prefixes defaulted to the same two values ("UBA"/"UBS") for every tenant, so the second league created through
the wizard failed on a uniqueness constraint the first league could never reveal. It turned "onboard a customer" into a
support ticket, and it was invisible to tests that all ran against one organization.

**3. The Chromium Background Sync no-op (v28) — offline scoring would have silently dropped points.**
`createSyncTrigger()` picks `BackgroundSyncAdapter` when the browser supports Background Sync, and its `register()` was
empty: the drain waited for a service-worker event that only fires after `registration.sync.register()`, and nothing called
it. A tablet that scored a quarter in airplane mode and reconnected would queue everything and sync **nothing** — no error,
no toast, no retry, just a queue that grows. Found by an end-to-end test that put a real browser into offline mode, because
the unit tests exercised the adapter's `supported` flag and never the wiring.

The common thread is worth stating: **all three lived in the seam between a component and the context it runs in** — session
context, tenant context, browser context. The bugs that survived the longest were the ones where the code was correct in
isolation and wrong in its environment.

---

## The three investments that paid

**1. Playwright end-to-end tests.** They found the escalation, they caught a route conflict that made every page 500 while
the build was green, they caught the wizard's organization-creation being refused by RLS on a first customer's first action,
and they are what turned "offline scoring" from a claim into a demonstration. Unit tests test what you thought of; a browser
tests what a scorer actually does.

**2. The RLS-bootstrap audit ratchet (v23).** Five static tests that assert the session path still resolves roles and
organization through `SECURITY DEFINER` functions, plus a database test proving a bare read is *narrower* than the function.
The same class of bug appeared three times (v21 organization, v22 roles, v24 vision worker) before the ratchet existed; it
has not appeared since.

**3. `verify-tenant-table.sh`.** A one-command check that a tenant table has forced RLS, the canonical policy, and grants —
run as the app role, because a superuser sees nothing wrong. It is the difference between "we believe isolation works" and
"isolation is verified for this table, now".

Honourable mention: the deploy wrapper that keeps the full transcript and propagates the deploy's own exit status. Before it,
a total failure looked like a blank screen because the exit code being read was `grep`'s.

---

## What I would do differently

**1. The shellcheck rule should have been added after the first near-miss, not after the leak.** In v25 a deploy's
`git clean -fdx` deleted the vision worker's `.env` — a container that kept running and a stack that could never have come
back after a reboot. The lesson there was "config must live outside the checkout", and it was learned. But the sibling
lesson — "a script must not be able to print secrets" — was not encoded, and in v27 a verification script turned
`export $(... | xargs)` with empty input into a bare `export` that dumped the environment into a transcript. Both were
tooling-shaped, both were preventable with a lint rule and a habit, and I fixed the second one only after it cost two keys.
`ROTATE_SECRETS.md` §5 is the note to my past self.

**2. Browser tests should have existed before the tenth feature, not the twentieth.** The escalation existed for many streaks
before v22 found it. Had the two-tenant spec been written when multi-tenancy was written, it would have failed the day the
bug was introduced, and the fix would have cost minutes instead of a security review.

**3. I trusted commit messages as evidence twice, and both times it was wrong.** In v26 I "verified" the vision backup was
committed when `.gitignore`'s blanket `*.log` had swallowed it; in v29 I found Steps 5-8 already implemented but with three
live bugs in the seams. The check that works is `git ls-files` and a running test, not a message.

---

## The top three risks for the next six months

**1. VPS disk pressure — currently 71% of 193 GB.** A deploy costs ~1.35 GB transiently and ~7 MB net, the release window
keeps steady state flat, and the cleanup block buys roughly 5,700 deploys at this rate. The unbounded thing is **video**:
`shared/media/originals` is 14 MB today and nothing prunes it. `LAUNCH_READY.md` §6 sets the 50 GB threshold and the decision
that follows it (source retention policy, clips stay on R2).

**2. Billing credentials that look live but are not fully migrated.** Production holds a live key that is not the leaked
one, but the **webhook secret has never been rotated** and **neither product id is set**, so no upgrade can succeed. The
failure is quiet — the button reports "No Bachs product configured for PRO", which reads like a bug rather than a missing
credential. `BACHS_LIVE_MIGRATION.md` closes it in ~30 minutes and must not be skipped on the assumption that "we're already
live".

**3. Vision has never seen a real game.** The pipeline is proven end to end (ingest → poller → real YOLO inference →
COMPLETED), but every clip so far contained no people, so the accuracy claim and the confirm → highlight → R2 → match-centre
leg rest on synthetic data. One phone video closes it. Until then, "AI-powered highlights" is an engineering claim, not a
customer claim.

Secondary but real: one host runs production, staging, two Supabase stacks, Kong and the vision worker; there is no pager,
and the off-host backup path has never been exercised end to end.

---

## What is ready to launch

- **LBCL Season 2** can be created through the wizard or by the organizer at `/signup?role=organizer` — the path that was
  broken in v20 and is now covered by a browser test that creates a real league with four teams.
- **A sportsbook can be pitched today** with `/api-docs` and the signed webhook feed; the PRO and ENTERPRISE tiers exist in
  Bachs and only need their product ids in the env.
- **A new league can be onboarded self-serve**, and the platform will show it its own name, its own public tournament page,
  and its own billing state.
- **Offline scoring is proven** for a basketball console on staging (flag on) and can be enabled in production with one env
  line once the owner decides to pilot it.

The remaining work is not code: one dashboard session for billing, one phone recording for vision, one season for the
product.
