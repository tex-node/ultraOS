-- Phase 1, Stage 5.2B-4: tenant-aware composite foreign keys for the Vendor/Event/Reservation
-- write paths this stage converted - the same relational-integrity pattern Stage 5.4B
-- established and Stage 5.2B-3 extended, applied here to the highest-consequence relations this
-- domain's live write paths actually establish.
--
-- Hand-authored, mirroring the 5.4B/5.2B-3 migrations exactly - no data transformation is
-- needed (only new unique indexes and FK redefinitions on existing NOT NULL columns), so a live
-- diff against a real database added nothing a direct read of that precedent didn't already give.
--
-- Six parent tables gain the same `UNIQUE (organizationId, id)` index prior stages added to
-- Club/Division/Season/SeasonClub/Player/Staff/DraftEvent/DraftSquad, so this stage's children
-- can reference them compositely: Venue, Event, Vendor, VendorProduct, SeatZone, SeatReservation.
--
-- Eight relations become composite tenant-aware FKs this stage - all eight are REQUIRED
-- (non-nullable) columns with CASCADE/RESTRICT delete behavior, so none of them hit the
-- Prisma/Postgres "composite FK + ON DELETE SET NULL on a column whose composite key includes a
-- NOT NULL organizationId" incompatibility Stage 5.2B-3 discovered and worked around:
--
--   Event.venueId                 -> Venue(organizationId, id)            ON DELETE RESTRICT
--   VendorProduct.vendorId        -> Vendor(organizationId, id)           ON DELETE CASCADE
--   VendorInventory.eventId       -> Event(organizationId, id)            ON DELETE CASCADE
--   VendorInventory.productId     -> VendorProduct(organizationId, id)    ON DELETE CASCADE
--   SeatReservation.eventId       -> Event(organizationId, id)            ON DELETE CASCADE
--   SeatReservation.seatZoneId    -> SeatZone(organizationId, id)         ON DELETE RESTRICT
--   Ticket.reservationId          -> SeatReservation(organizationId, id)  ON DELETE CASCADE
--   OrderItem.productId           -> VendorProduct(organizationId, id)    ON DELETE RESTRICT
--
-- Ticket.reservationId is a 1:1 relation (bare `@unique`) - Prisma requires the defining side of
-- a composite 1:1 relation to expose the FK pair as its own unique constraint, so Ticket also
-- gains `UNIQUE (organizationId, reservationId)` - purely a mechanical requirement, reservationId
-- alone already guarantees the real 1:1 cardinality.
--
-- The other ~12 tenant-to-tenant relations this domain establishes (VenueSection.venueId,
-- Accreditation.eventId, EventDebrief.eventId, EventVendorReview.eventId/.vendorId,
-- EventVolunteerReview.eventId, and every nullable ON DELETE SET NULL relation - Order.
-- reservationId/.promoCodeId/.fanClubId, SponsorCampaign.eventId/.productId, PromoCode.eventId/
-- .sponsorCampaignId, SeatZone.fanClubId) are inventoried and classified in
-- PHASE1_STAGE5_2B4_VENDOR_EVENT_RESERVATION_TENANCY.md but deliberately not converted here -
-- same incremental-adoption reasoning as every prior stage's own remaining backlog. The nullable
-- ones specifically hit the same SetNull incompatibility 5.2B-3 already documented.
--
-- Preceded by a production-safe, read-only mismatch audit of exactly these 8 relations: zero
-- existing cross-org mismatches in any of them - this migration cannot fail against current data
-- (expected, since only one organization has ever existed).
--
-- Rehearsed on ultraos_staging as the actual restricted role, then separately inside a
-- rolled-back transaction as the privileged migrate role (bypasses RLS entirely) to prove this
-- is a true database constraint, not something that only holds because of RLS.

ALTER TABLE "Event" DROP CONSTRAINT "Event_venueId_fkey";
ALTER TABLE "VendorProduct" DROP CONSTRAINT "VendorProduct_vendorId_fkey";
ALTER TABLE "VendorInventory" DROP CONSTRAINT "VendorInventory_eventId_fkey";
ALTER TABLE "VendorInventory" DROP CONSTRAINT "VendorInventory_productId_fkey";
ALTER TABLE "SeatReservation" DROP CONSTRAINT "SeatReservation_eventId_fkey";
ALTER TABLE "SeatReservation" DROP CONSTRAINT "SeatReservation_seatZoneId_fkey";
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_reservationId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

CREATE UNIQUE INDEX "Venue_organizationId_id_key" ON "Venue"("organizationId", "id");
CREATE UNIQUE INDEX "Event_organizationId_id_key" ON "Event"("organizationId", "id");
CREATE UNIQUE INDEX "Vendor_organizationId_id_key" ON "Vendor"("organizationId", "id");
CREATE UNIQUE INDEX "VendorProduct_organizationId_id_key" ON "VendorProduct"("organizationId", "id");
CREATE UNIQUE INDEX "SeatZone_organizationId_id_key" ON "SeatZone"("organizationId", "id");
CREATE UNIQUE INDEX "SeatReservation_organizationId_id_key" ON "SeatReservation"("organizationId", "id");
CREATE UNIQUE INDEX "Ticket_organizationId_reservationId_key" ON "Ticket"("organizationId", "reservationId");

ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_venueId_fkey" FOREIGN KEY ("organizationId", "venueId") REFERENCES "Venue"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorProduct" ADD CONSTRAINT "VendorProduct_organizationId_vendorId_fkey" FOREIGN KEY ("organizationId", "vendorId") REFERENCES "Vendor"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorInventory" ADD CONSTRAINT "VendorInventory_organizationId_eventId_fkey" FOREIGN KEY ("organizationId", "eventId") REFERENCES "Event"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorInventory" ADD CONSTRAINT "VendorInventory_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "VendorProduct"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_organizationId_eventId_fkey" FOREIGN KEY ("organizationId", "eventId") REFERENCES "Event"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_organizationId_seatZoneId_fkey" FOREIGN KEY ("organizationId", "seatZoneId") REFERENCES "SeatZone"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_reservationId_fkey" FOREIGN KEY ("organizationId", "reservationId") REFERENCES "SeatReservation"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "VendorProduct"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
