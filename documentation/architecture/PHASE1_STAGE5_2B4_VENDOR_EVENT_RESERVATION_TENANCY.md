# Phase 1, Stage 5.2B-4 — Vendor / Event / Reservation Operations Multi-Tenant Hardening

Tenant-hardens the real, existing Vendor/Event/Reservation write surface: `Vendor`/`VendorProduct`/
`VendorInventory`, `Event`/`VenueSection`/`SeatZone`/`SeatReservation`/`Ticket`, `Order`/`OrderItem`,
`PromoCode`, `SponsorCampaign`, `Accreditation`, `EventDebrief`/`EventVendorReview`/
`EventVolunteerReview` — following the same conversion pattern as every prior Stage 5.2B substage,
reusing Stage 5.4B's 167-relation FK inventory as an input rather than rebuilding it, and extending
the composite tenant-aware FK pattern to the highest-consequence relations this domain's live write
paths establish.

## Baseline confirmed before editing

Read `schema.prisma`, `tenant-context.ts`, `authorization.ts`, `audit.ts`, and the Stage 5.4B/
5.2B-3 docs. Confirmed the five 5.2B-3 composite FKs exist in the schema and migration history,
confirmed `git branch` (`main`) and working-tree state (many prior stages' work still
uncommitted, unrelated to this stage, not touched), confirmed local `tsc`/`build` pass from the
pre-5.2B-4 baseline, and recorded the pre-existing test count (455) before starting.

## Whole-repository inventory

Grepped the whole repository (not just `src/`) for every reference to the real Prisma models this
domain's conceptual objective maps to. The exact model names, read from `schema.prisma` directly
rather than assumed: `Vendor`, `VendorProduct`, `VendorInventory`, `Event`, `Venue`, `VenueSection`,
`SeatZone` (the actual reservable-zone model — there is a separate, unrelated `VenueZone` model,
see below), `SeatReservation`, `Ticket`, `Order`, `OrderItem`, `PromoCode`, `SponsorCampaign`
(there is no dedicated `Sponsor` model — sponsor data lives on `SponsorCampaign`), `CheckIn`,
`Accreditation`, `EventDebrief`, `EventVendorReview`, `EventVolunteerReview`.

**CONVERT_5.2B4** (fully unscoped before this stage — `requirePermission`/bare `auth()`, bare
`prisma` client, no `organizationId` stamps):
- `src/app/vendors/actions.ts` (`createVendor`, `createVendorProduct`, `setVendorInventory`,
  `createSponsorCampaign`, `createPromoCode`)
- `src/app/events/actions.ts` (`createEvent`, `setEventStatus`, `createVenueSection`,
  `createSeatZone`, `createAccreditation`, `setAccreditationStatus`, `confirmReservationPayment`)
- `src/app/orders/actions.ts` (`confirmOrderPayment`, `setOrderStatus`)
- `src/app/events/[id]/debrief/actions.ts` (`saveEventDebrief`, `saveVendorReview`,
  `saveVolunteerReview`)
- `src/app/public/tickets/actions.ts` (`createWalletOrder` — public/token flow, see below)
- `src/app/public/events/actions.ts` (`reserveZone` — public/token flow, see below)
- Pages/reads: `vendors/page.tsx`, `vendors/[id]/page.tsx`, `events/page.tsx`,
  `events/new/page.tsx`, `events/[id]/page.tsx`, `events/[id]/debrief/page.tsx`, `orders/page.tsx`,
  `qr-operations/page.tsx` (dashboard counts), `venue-map/page.tsx` (see `VenueZone` note below)
- `check-in/[code]/page.tsx` — a **real gap found by inspection, not by the write-path scan**: see
  below.
- `fixtures/actions.ts` — a **real gap found by inspection**: see below.

**ALREADY_TENANT_SAFE**:
- `src/app/check-in/actions.ts` (Stage 5.2A) — `checkInTicket`/`checkInAccreditation`/
  `collectOrder` already use `requirePermissionWithOrganization` + `withOrganizationContext`,
  stamp `organizationId` on every `CheckIn` create, pass it to `writeAuditLog`. Not reworked -
  no gap found in its actual mutations (the read gap found nearby was in a different file, the
  page, not this one - see below).
- `src/app/draft-events/new/page.tsx` (Stage 5.2B-3) — its `tx.event.findMany` dropdown read was
  already inside that page's own `withOrganizationContext`.

**READ_DEPENDENCY_5.2B4** (out-of-scope domain reading this stage's models as dropdown data,
named, not converted — matches the precedent set for `draft-cohort.ts` in 5.2B-3):
- `fixtures/new/page.tsx`, `fixtures/[id]/edit/page.tsx` — Venue/Event dropdowns for Fixture
  (Stage 5.2A's own domain)
- `novelty-matches/page.tsx` — Venue/Event dropdown for NoveltyMatch (a separate exhibition-match
  domain, out of this stage's boundary)
- `vision/videos/page.tsx` — Venue dropdown (Vision domain, out of this stage's boundary)
- `gameday/page.tsx`, `gameday/checkin/page.tsx` — a single unscoped `Event.findFirst` banner
  read each, inside otherwise-5.2A-owned pages that DO resolve `organizationId` for their own
  Season/Fixture queries but never applied it to this one Event read either. A real, named,
  pre-existing gap in a different stage's file — not expanded into a rewrite of those pages here.

**DEFER_5.2D** (genuine public discovery reads, no mutation dependency, per section 40):
- `public/events/page.tsx` — public event listing across all events (would mix organizations once
  a second one exists; deferred to the public-read migration stage, same treatment `public/clubs`
  got in 5.2B-2)
- `public/events/[id]/page.tsx`'s own read (its mutation, `reserveZone`, is separately converted
  and independently re-validates capacity inside its own transaction, so the display read being
  unscoped does not create an unsafe reservation decision — matches the `public/clubs/[id]`
  precedent from 5.2B-2)

**Opaque-token-safe, not "deferred," genuinely not requiring org scoping**:
- `public/orders/[code]/page.tsx`, `public/tickets/[code]/page.tsx` — both resolve their record by
  a server-generated, globally-unique opaque token (`Order.collectionCode`, `Ticket.code`), never
  by a client-asserted organization. The token itself is the capability; report exactly that, per
  section 56 — this is an opaque database token, not a cryptographically signed one.

**Named cross-cutting exceptions, continuing precedent already established in prior stages, not
re-litigated here**:
- `src/lib/season-zero-readiness.ts` — vendor/event/order/reservation counts added to the same
  pre-existing, hardcoded-to-`"Season Zero 2026"` readiness dashboard 5.2B-3 already named.
- `src/lib/operations.ts`'s `operationsSnapshot()` — the same general multi-domain ops dashboard
  Stage 5.4B already named (its `Event.findFirst`/`seatReservation.count`/`order.count` reads are
  additional instances of the same already-flagged function, not a new file).
- `src/lib/data-hygiene.ts` — the same read-only demo/rehearsal-data diagnostic Stage 5.2B-2
  already named.
- `src/app/content/page.tsx` + `src/lib/content-engine.ts` — a separate Content Studio domain
  (draft picks, fixtures, fan clubs, content generation) that happens to read `SponsorCampaign` as
  one of many unrelated dropdown sources; not a vendor/event/reservation operational surface.
- `src/app/api/sponsor-impressions/[id]/route.ts` — a public, unauthenticated impression-counter
  increment (`sponsorCampaign.updateMany({ where: { id, isActive: true } })`). Writes this stage's
  own model, but the write is entirely self-contained to the one row named by its own id with no
  cross-record read and no data returned — there is no cross-tenant leak or corruption channel
  here beyond what is already possible today within a single organization (anyone who can view a
  campaign's public page can already inflate its own impression count; that is a pre-existing,
  unrelated abuse-vector question, not a multi-tenancy one). Not converted.
- `scripts/repair-rehearsal-origin.ts` — writes `Event.recordOrigin` by id from a manifest; not
  organizationId-related at all (a `RecordOrigin` classification tool, orthogonal to tenancy).

**HISTORICAL_ONE_OFF**: `scripts/g51-fix-venue.ts`, `g55-fix-event-details.ts`,
`g56-shift-schedule-to-10am.ts`, `g57-make-event-free.ts` — genuine one-time corrections against
specific hardcoded Season Zero record ids. Not mechanically patched (they don't call any function
whose signature changed this stage).

**NOT_PRESENT**: no live admin CRUD exists for `VenueZone` at all (a separate, unrelated model
from `SeatZone` — see below) — only `venue-map/page.tsx` reads it, nothing ever writes it.

**`UNCLASSIFIED_LIVE_CALL_SITES`: 0. `BLOCKING_UNKNOWN`: 0.**

### A naming collision worth stating precisely

The schema has **two unrelated "zone" concepts**: `VenueZone` (an operations-dashboard occupancy
model — `eventId` optional, `occupancy`/`capacity`/`OpsHealthStatus`, no live write path at all,
read only by `venue-map/page.tsx`) and `SeatZone` (the real reservable, price-bearing, capacity-
tracked zone tied to `Event`/`VenueSection`/`SeatReservation` — the one with a live write path,
`createSeatZone`). This stage's "EVENT_ZONE_ACTIONS" gate item refers to `SeatZone`;
`venue-map/page.tsx`'s `VenueZone` read was tenant-scoped as an authenticated operational read
(section 39) even though it has no corresponding write action to convert.

## Two real gaps found by inspection, not by grepping for the write-path scan, and fixed in place

- **`check-in/[code]/page.tsx`** read `Ticket`/`Accreditation`/`Order` by their opaque codes on
  the **bare, unscoped** Prisma client — an operator authenticated under Org B could scan any code
  and see Org A's fan name, event, price, and payment status in full, even though the actual
  check-in mutations (`check-in/actions.ts`, already tenant-safe from 5.2A) would have correctly
  denied the write. Fixed by wrapping the three reads in the admin's own `withOrganizationContext`
  — a foreign-org code now returns null (RLS), matching the "not found" behavior the mutation
  already had. This closes exactly the read-side information-disclosure gap section 44 warns
  about.
- **`fixtures/actions.ts`'s `validScope()`** (Stage 5.2A, `Fixture` domain) validated `division`
  and `event` via scoped lookups but never validated `venueId` at all — `Fixture.venueId` is a
  simple, non-composite FK, so a cross-org venue id would have silently succeeded. Fixed with the
  same one-line `tx.venue.findFirst({ where: { id: d.venueId } })` pattern already used for the
  other two checks, since `Venue` is squarely this stage's own domain model even though the file
  itself belongs to a different stage's write path.

## Public/token-based flow provenance (section 13)

Two genuinely public, unauthenticated actions were previously on the bare Prisma client with no
tenant concept at all:

- **`createWalletOrder(ticketCode, formData)`**: the trusted provenance is `Ticket.code` (a
  server-generated, globally-unique opaque token) → resolve the `Ticket` row → its own
  `organizationId` → every subsequent read/write runs inside that resolved organization's scoped
  transaction. `withOrganizationContext()` doesn't expose an isolation-level option and this write
  path's optimistic-concurrency inventory claim needs `Serializable` (pre-existing, unchanged
  behavior) — so its exact two-line mechanism (open the transaction, `set_config` the org before
  anything else runs) is inlined here rather than changing that shared helper's signature for one
  caller.
- **`reserveZone(eventId, formData)`**: the trusted provenance is the `Event` row resolved by the
  route-param `eventId` → its own `organizationId` → same inlined-transaction treatment as above,
  same reason (Serializable isolation for the capacity claim).

`PUBLIC_MUTATION_ORG_PROVENANCE`: **Ticket.organizationId** (via `Ticket.code`) and
**Event.organizationId** (via the route-param `eventId`) — both resolved server-side from a
persisted record, never from client-supplied form/JSON/query data.

## Vendor/event/reservation invariants preserved, tenant-scoped

- `createVendorProduct`/`setVendorInventory`/`createSponsorCampaign`/`createPromoCode`: every
  client-submitted `vendorId`/`eventId`/`productId`/`campaignId` is now resolved through a scoped
  `tx` lookup first — a foreign-org id is invisible to RLS and throws not-found before any create.
- `createEvent`/`createVenueSection`/`createSeatZone`: `seasonId`/`venueId`/`fanClubId` resolved
  the same way.
- `confirmOrderPayment`'s inventory-decrement/sponsor-campaign/promo-redemption chain and
  `confirmReservationPayment` now run inside the acting admin's own scoped transaction throughout
  (previously entirely unscoped).
- `saveEventDebrief`/`saveVendorReview`/`saveVolunteerReview`: `eventId`/`vendorId` resolved
  through scoped lookups. `volunteerId` identifies a `User` row, which is **not**
  organizationId-scoped (a person's account, not a tenant-owned record) — the lookup only
  confirms the id exists, it cannot and does not confirm the user actually volunteered for this
  organization. That is a pre-existing characteristic of how volunteers are selected on this page
  (the dropdown itself queries `User` by `VOLUNTEER` role with no organization filter either) —
  named here, not expanded into a `UserRoleAssignment`-scoped rewrite this stage.

## Schema: composite tenant-aware foreign keys

Six parent tables gained `@@unique([organizationId, id])`: `Venue`, `Event`, `Vendor`,
`VendorProduct`, `SeatZone`, `SeatReservation`. Eight relations became composite — chosen as the
highest-consequence subset this stage's converted write paths actually establish (not all ~20
`TENANT_TO_TENANT` relations in this domain), all eight required/non-nullable with
CASCADE/RESTRICT delete behavior, so none hit the Prisma/Postgres `SetNull`-on-a-`NOT NULL`-
composite-key incompatibility Stage 5.2B-3 discovered:

```
Event.venueId                 -> Venue(organizationId, id)            ON DELETE RESTRICT
VendorProduct.vendorId        -> Vendor(organizationId, id)           ON DELETE CASCADE
VendorInventory.eventId       -> Event(organizationId, id)            ON DELETE CASCADE
VendorInventory.productId     -> VendorProduct(organizationId, id)    ON DELETE CASCADE
SeatReservation.eventId       -> Event(organizationId, id)            ON DELETE CASCADE
SeatReservation.seatZoneId    -> SeatZone(organizationId, id)         ON DELETE RESTRICT
Ticket.reservationId          -> SeatReservation(organizationId, id)  ON DELETE CASCADE
OrderItem.productId           -> VendorProduct(organizationId, id)    ON DELETE RESTRICT
```

`Ticket.reservationId` is a 1:1 relation (bare `@unique`) — Prisma requires the defining side of a
composite 1:1 relation to also expose the FK pair as its own unique constraint, so `Ticket` gained
`@@unique([organizationId, reservationId])` too (a mechanical requirement; `reservationId` alone
already guarantees the real 1:1 cardinality).

**`HARDEN_NOW` (the 8 above).**

**`APPLICATION_GUARD_ONLY`** (real, scoped lookups added this stage, but no composite FK):
- `DraftCoachPoolEntry`-equivalent for this domain: `Order.reservationId`/`.promoCodeId`/
  `.fanClubId`, `SponsorCampaign.eventId`/`.productId`, `PromoCode.eventId`/`.sponsorCampaignId`,
  `SeatZone.fanClubId` — all nullable with `ON DELETE SET NULL`, hitting the exact same
  incompatibility Stage 5.2B-3 documented for `DraftAllocation.draftSquadId`/`.staffId` (a
  composite FK cannot use `SET NULL` when any column in the key, here `organizationId`, is itself
  `NOT NULL`).
- `EventVendorReview.vendorId`/`.eventId`, `EventVolunteerReview.eventId`, `EventDebrief.eventId`,
  `Accreditation.eventId`, `VenueSection.venueId` — required/Cascade relations that would be
  eligible for the composite pattern, but were left as scoped-lookup-only this stage in the same
  "extend incrementally, not a platform-wide rewrite" spirit 5.4B/5.2B-3 established; a future
  stage touching this domain again is the natural place to extend to them.

**`ALREADY_HARDENED`**: none in this specific domain prior to this stage (the 5 relations
Stage 5.2B-3 hardened belong to the Draft domain, not this one).

**`DEFER_WITH_REASON`**: the nullable/`SetNull` set above (reason: Prisma/Postgres
incompatibility, not a scoping oversight).

Migration `20260905060000_phase1_stage5_2b4_vendor_event_reservation_tenant_fk` (hand-authored,
mirroring the 5.4B/5.2B-3 migrations exactly).

## Mismatch audits — zero throughout

Read-only, against production, for all 8 hardened relations: zero mismatches before any schema
change, re-confirmed immediately before applying the migration, and re-confirmed immediately
after.

## Two-tenant staging rehearsal

Against `ultraos_staging`, connected as the actual restricted role. Script:
`scripts/vendor-event-reservation-tenancy-isolation-integration-test.ts`.

`reserveZone`/`createWalletOrder` call NextAuth's `auth()` internally, which requires an active
Next.js request context and cannot run from a bare script — so the rehearsal replicates their
exact tenant-resolution and write logic inline (identical Prisma operations, same
`set_config`/`organizationId`-derivation mechanism used by the real functions) rather than
importing and calling those two functions directly. `NOT_TESTED` for "through the literal
exported function" specifically for those two; the underlying mechanism being proven is
identical code, and the composite-FK/RLS behavior these two functions depend on was independently
proven both at the restricted-role level (below) and the privileged level (next section).

**PASS proofs**: Org B Vendor → Org B Product → Org B Inventory; Org B Event → Org B Venue; Org B
Reservation → Org B Zone/Event with a nested Ticket → Org B Reservation; Org B Order/OrderItem →
Org B SeatReservation/VendorProduct; Org A and Org B each created an identically-named Vendor
("Arena Snacks Rehearsal") with no collision.

**DENIED proofs (composite FK), zero partial writes after each**: Org B Product → Org A Vendor;
Org B Event → Org A Venue; Org B Reservation → Org A Event; Org B Reservation → Org A SeatZone;
Org B OrderItem → Org A VendorProduct; Org B VendorInventory → Org A VendorProduct. (`Ticket` →
Org A `SeatReservation` could not be application-rehearsal-tested against real data — Neon Ultra
currently has **zero** real `SeatReservation` rows on staging — but is independently proven at the
privileged level below, using a fully self-contained fixture.)

**Capacity isolation (sections 20/36)**: incrementing Org B's `SeatZone.reservedQuantity` left Org
A's own zone's `reservedQuantity` unchanged.

**Inventory isolation (sections 16/37)**: incrementing Org B's `VendorInventory.sold` left Org A's
own inventory row unchanged.

**PromoCode global uniqueness — the anticipated stop condition, confirmed empirically (section
24)**: Org A created a `PromoCode` with a given code text; Org B's attempt to create a
`PromoCode` with the **identical** code text failed with a `P2002` unique-constraint violation.
`PromoCode.code` is a bare `@unique` (platform-wide), not `organizationId`-composite. **STOPPED,
not fixed** — altering this to per-org uniqueness is a real schema change with its own migration/
rehearsal/backward-compatibility considerations (existing codes, any external systems that assume
global uniqueness) that the plan explicitly reserves for architectural review, not a mid-stage
fix. Reported here as the confirmed, empirical stop condition, matching section 45 item 2.

All rehearsal data (Organization B and its full hierarchy, the duplicate-name fixtures under both
organizations) deleted afterward.

## Database-level proof: privileged role, inside rolled-back transactions

Script: `scripts/verify-5-2b4-privileged-fk.ts`. Connected as the `ultraos` role on
`ultraos_staging` — confirmed `rolsuper = true, rolbypassrls = true` before proceeding.

Each of the 8 hardened relations was tested independently, in its own **entirely self-contained**
fixture (two full Organization A/B hierarchies built inside the same rolled-back transaction,
rather than depending on any existing row — necessary here since Neon Ultra has zero real
`SeatReservation` rows, so `Ticket.reservationId` could not otherwise have been tested against
real data even at the privileged level):

```
Event.venueId                 -> rejected by Event_organizationId_venueId_fkey
VendorProduct.vendorId        -> rejected by VendorProduct_organizationId_vendorId_fkey
VendorInventory.eventId       -> rejected by VendorInventory_organizationId_eventId_fkey
VendorInventory.productId     -> rejected by VendorInventory_organizationId_productId_fkey
SeatReservation.eventId       -> rejected by SeatReservation_organizationId_eventId_fkey
SeatReservation.seatZoneId    -> rejected by SeatReservation_organizationId_seatZoneId_fkey
Ticket.reservationId          -> rejected by Ticket_organizationId_reservationId_fkey
OrderItem.productId           -> rejected by OrderItem_organizationId_productId_fkey
```

All 8: PASS — rejected by the named constraint itself, under a role that bypasses RLS entirely.
Zero residue (every transaction rolled back; a follow-up count of leftover "Privileged FK Proof
Org" rows returned 0).

## Atomic failure testing (section 43)

Every DENIED proof above (both the restricted-role application rehearsal and the privileged-role
proof) attempted its cross-org write as the **final** step of an otherwise-complete, realistic
write attempt (a full `SeatReservation`/`Order`/`VendorInventory` create with every other field
correctly filled in) — the rejection is a genuine mid-transaction constraint violation, not a
pre-flight check, and Postgres's transactional guarantee (the whole `$transaction` rolls back on
any thrown error, including a constraint violation) is what section 43 requires. The rehearsal's
explicit zero-partial-write check (`orderItem.count` after the failed attempts) and the privileged
proof's explicit residue check both confirmed this held.

## Verification

```
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS (0 errors; 6 pre-existing warnings unrelated to this stage's files, unchanged)
TESTS: 455/455 PASS (unchanged count — no new tests added this stage)
LOCAL_BUILD: PASS
```

Deployed to production: fresh verified backup
(`ultraleagueos-pre-phase1-stage5-2b4-20260905003827.dump`, 831,704 bytes, 1336 TOC entries,
verified via `pg_restore --list`), migration applied inside an explicit transaction, all 8
composite FKs verified from `pg_constraint` to match the design exactly, migration registered via
`prisma migrate resolve --applied`, code synced, `prisma generate` run on the server, `npm run
build` run with `NODE_OPTIONS=--max-old-space-size=4096` from the first request (the safe value
Stage 5.2B-3 established for this host, applied proactively rather than waiting for a repeat OOM).

## Known remaining gaps

- `PromoCode.code` remains a bare global `@unique` — a genuine, confirmed structural blocker to
  two organizations legitimately using the identical promo code text. Named, not fixed (see the
  rehearsal section above).
- `Order.reservationId`/`.promoCodeId`/`.fanClubId`, `SponsorCampaign.eventId`/`.productId`,
  `PromoCode.eventId`/`.sponsorCampaignId`, `SeatZone.fanClubId` remain application-guard-only (no
  composite FK) — the nullable/`SetNull` incompatibility, same class as 5.2B-3's own two.
- `EventVendorReview`, `EventVolunteerReview`, `EventDebrief`, `Accreditation`, `VenueSection`'s
  relations remain application-guard-only (no composite FK) — eligible for hardening, deferred to
  incremental adoption by a future stage touching this domain again.
- `gameday/page.tsx`/`gameday/checkin/page.tsx`'s single unscoped `Event.findFirst` banner reads —
  named, not fixed (Stage 5.2A's own domain).
- `season-zero-readiness.ts`, `operations.ts`'s `operationsSnapshot()`, `data-hygiene.ts` remain
  on the bare Prisma client — continuing precedent already established and named in prior stages.
- Public discovery reads (`public/events/page.tsx`, `public/events/[id]/page.tsx`'s own read)
  remain deliberately deferred to Stage 5.2D.

## Final gate

```
STAGE_5_2B4

VENDOR_ACTIONS: PASS
VENDOR_PRODUCT_ACTIONS: PASS
INVENTORY_ACTIONS: PASS
EVENT_ACTIONS: PASS
EVENT_ZONE_ACTIONS: PASS (SeatZone - the real reservable zone; VenueZone, a separate unrelated
  operations-dashboard model, has NOT_PRESENT write actions - see the naming-collision note above)
RESERVATION_ACTIONS: PASS
TICKET_QR_ACTIONS: PASS (Ticket issuance/redemption; QR payload itself carries no organizationId
  to trust or distrust - see QR_ORG_ID_TRUSTED below)
ORDER_ACTIONS: PASS
PROMO_ACTIONS: PASS (creation/application converted; PromoCode.code global uniqueness itself is a
  named, confirmed, NOT-fixed structural limitation - see below)
SPONSOR_OPERATIONAL_ACTIONS: PASS (SponsorCampaign creation via vendors/actions.ts; the public
  impression-counter route is named separately, not converted - see the doc body)

AUTHENTICATED_ORG_SOURCE: SERVER_DERIVED
PUBLIC_MUTATION_ORG_PROVENANCE: Ticket.organizationId (via the opaque Ticket.code token, for
  createWalletOrder) and Event.organizationId (via the route-param eventId, for reserveZone) -
  both resolved server-side from a persisted record, never client-supplied
CLIENT_ORG_ID_TRUSTED: NO
QR_ORG_ID_TRUSTED: NO (no QR payload in this codebase carries an organizationId at all; accreditation
  QR codes and ticket QR codes both encode only the same opaque, server-generated, globally-unique
  code already used for the plain-URL lookup - not a cryptographically signed token, an opaque
  database token; reported exactly that, per section 56)

TENANT_READS_SCOPED: PASS
TENANT_CREATES_EXPLICIT_ORG: PASS
TENANT_RELATION_VALIDATION: PASS (composite FK for the 8 relations listed below; application-level
  scoped lookup for every other relation this stage's write paths touch)
AUDIT_ORG_CONTEXT: EXPLICIT

----------------------------------------------------------------------
RELATIONAL INTEGRITY
----------------------------------------------------------------------

WRITE_PATH_TENANT_FKS_INVENTORIED: PASS
WRITE_PATH_RELATION_COUNT: 20 (approximate TENANT_TO_TENANT relations this domain's converted
  write paths establish; 8 hardened, 12 application-guard-only with reasons - see below)
WRITE_PATH_EXISTING_MISMATCHES: 0 (all 8 hardened relations, pre- and post-migration)

ALREADY_HARDENED_RELATIONS:
  - none in this domain prior to this stage

NEW_COMPOSITE_FKS:
  - Event.venueId -> Venue
  - VendorProduct.vendorId -> Vendor
  - VendorInventory.eventId -> Event
  - VendorInventory.productId -> VendorProduct
  - SeatReservation.eventId -> Event
  - SeatReservation.seatZoneId -> SeatZone
  - Ticket.reservationId -> SeatReservation
  - OrderItem.productId -> VendorProduct

APPLICATION_GUARD_ONLY_RELATIONS:
  - Order.reservationId / .promoCodeId / .fanClubId (nullable, ON DELETE SET NULL - Prisma/
    Postgres composite+SetNull incompatibility)
  - SponsorCampaign.eventId / .productId (same reason)
  - PromoCode.eventId / .sponsorCampaignId (same reason)
  - SeatZone.fanClubId (same reason)
  - EventVendorReview.eventId / .vendorId, EventVolunteerReview.eventId, EventDebrief.eventId,
    Accreditation.eventId, VenueSection.venueId (required/Cascade, eligible but deferred to
    incremental adoption - not a compatibility blocker, a scoping-priority choice)

DEFERRED_RELATIONS:
  - PromoCode.code global uniqueness (not a FK - see the stop-condition section above)

PRIVILEGED_CROSS_ORG_RELATION_WRITES: DENIED_FOR_ALL_NEW_COMPOSITE_FKS

----------------------------------------------------------------------
TWO-TENANT FUNCTIONAL PROOF
----------------------------------------------------------------------

ORG_B_VENDOR_WORKFLOW: PASS
ORG_B_PRODUCT_VENDOR_RELATION: PASS
ORG_A_VENDOR_FROM_ORG_B: DENIED

ORG_B_EVENT_WORKFLOW: PASS
ORG_B_EVENT_TO_ORG_B_VENUE: PASS
ORG_B_EVENT_TO_ORG_A_VENUE: DENIED

ORG_B_RESERVATION: PASS (application-level logic replicated inline, not via the literal
  reserveZone() call - see "Two-tenant staging rehearsal" above for why)
ORG_B_RESERVATION_TO_ORG_A_ZONE: DENIED
ORG_B_RESERVATION_TO_ORG_A_EVENT: DENIED

ORG_B_ORDER: PASS (application-level logic replicated inline, not via the literal
  createWalletOrder() call - same reason)
ORG_B_ORDER_TO_ORG_A_PRODUCT: DENIED

ORG_B_PROMO: PASS (creation)
ORG_B_USE_OF_ORG_A_PROMO: NOT_APPLICABLE (PromoCode.code is global, not tenant-scoped - Org B
  cannot even create a promo code identical to Org A's, let alone "use" one across tenants; this
  is the confirmed stop condition, not a tested-and-passing isolation boundary)

----------------------------------------------------------------------
ISOLATION / ATOMICITY
----------------------------------------------------------------------

CAPACITY_COUNTS_ISOLATED: PASS
INVENTORY_COUNTS_ISOLATED: PASS
ORDER_COUNTS_ISOLATED: PASS (via tenant-scoped reads in orders/page.tsx; not independently
  rehearsed with real order volume beyond the single rehearsal Order created and cleaned up)
RESERVATION_COUNTS_ISOLATED: PASS (same basis)
TICKET_COUNTS_ISOLATED: PASS (via tenant-scoped reads in qr-operations/page.tsx)
QR_CROSS_TENANT_REDEMPTION: NOT_TESTED (Neon Ultra has zero real Ticket/Accreditation rows to
  attempt a real cross-org redemption against on staging; the underlying protection -
  check-in/actions.ts's existing org-scoped tx.ticket.findUniqueOrThrow - was already proven
  ALREADY_TENANT_SAFE in this stage's inventory, and is architecturally identical to the
  Ticket.reservationId composite-FK/RLS proof already run above)
CROSS_TENANT_FAILURE_PARTIAL_WRITES: 0
TRANSACTIONAL_ATOMICITY: PASS
SAME_NAME_OBJECTS_ACROSS_ORGS: PASS (Vendor; PromoCode is the confirmed exception - see above)

----------------------------------------------------------------------
CLASSIFICATION
----------------------------------------------------------------------

PUBLIC_EVENT_READS: CLASSIFIED (DEFER_5.2D)
PUBLIC_VENDOR_READS: CLASSIFIED (NOT_PRESENT - no public vendor listing/detail page exists)
PUBLIC_RESERVATION_READS: CLASSIFIED (opaque-token-safe - public/tickets/[code], not deferred,
  see the doc body)
PUBLIC_TICKET_READS: CLASSIFIED (same basis)
HISTORICAL_SCRIPTS: NAMED (4 one-off scripts; 1 new rehearsal utility added this stage)

WHOLE_REPOSITORY_SCAN: PASS_WITH_NAMED_DEFERRED_EXCEPTIONS
UNCLASSIFIED_LIVE_CALL_SITES: 0
BLOCKING_UNKNOWN: 0

----------------------------------------------------------------------
REHEARSAL
----------------------------------------------------------------------

STAGING_BACKUP: VERIFIED
ORG_B_REHEARSAL: PASS
REHEARSAL_CLEANUP: PASS
STAGING_RESIDUE: 0

----------------------------------------------------------------------
LOCAL VERIFICATION
----------------------------------------------------------------------

PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS
TESTS: 455 PASS
LOCAL_BUILD: PASS

----------------------------------------------------------------------
PRODUCTION DEPLOYMENT
----------------------------------------------------------------------

PRODUCTION_BACKUP: VERIFIED (ultraleagueos-pre-phase1-stage5-2b4-20260905003827.dump, 831,704
  bytes, 1336 TOC entries, verified via pg_restore --list)
PRODUCTION_PRE_MIGRATION_MISMATCHES: 0
PRODUCTION_MIGRATION: PASS
PRODUCTION_COMPOSITE_FKS_VERIFIED: PASS (all 8, exact pg_constraint definitions match the design)
PRODUCTION_POST_MIGRATION_MISMATCHES: 0
PRODUCTION_BUILD: PASS (NODE_OPTIONS applied proactively from the first attempt - passed clean,
  no OOM, unlike Stage 5.2B-3's first-attempt failure on this same host)
PRODUCTION_BUILD_NODE_HEAP: 4096MB
PRODUCTION_SERVICE: ultraos-web.service ACTIVE
PRODUCTION_SMOKE_TESTS: PASS (/events, /qr-operations, /venue-map correctly 307-redirect
  unauthenticated; /public/events, /login, /public/clubs 200; /vendors, /orders, /events/new
  500 on an anonymous request - confirmed PRE-EXISTING behavior, not a regression: these three
  pages already called requirePermission()/requirePermissionWithOrganization() directly with no
  auth()-redirect guard before this stage, and journalctl shows the resulting error is the
  expected AuthenticationError, nothing else)
PRODUCTION_JOURNAL: CLEAN (only the 4 expected AuthenticationError lines from the smoke-test
  calls above; no Prisma/RLS/FK errors, no other unexpected 500s, in the 3 minutes following
  restart)
PRODUCTION_INVARIANTS: UNCHANGED (all 15 model row counts identical before/after deployment)

FINAL_STAGE_STATUS: CLOSED
```
