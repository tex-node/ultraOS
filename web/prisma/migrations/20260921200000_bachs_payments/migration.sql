-- Bachs payment gateway (F5.3): hosted-checkout references for tickets and orders, and a
-- per-vendor Connect sub-account for reconciliation.
--
-- Additive: new nullable columns only. Payments are confirmed server-side via the
-- `collection.succeeded` webhook (source of truth), never client redirects.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

ALTER TABLE "SeatReservation" ADD COLUMN "checkoutId" TEXT;
ALTER TABLE "SeatReservation" ADD COLUMN "checkoutUrl" TEXT;

ALTER TABLE "Order" ADD COLUMN "checkoutId" TEXT;
ALTER TABLE "Order" ADD COLUMN "checkoutUrl" TEXT;

ALTER TABLE "Vendor" ADD COLUMN "bachsAccountId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "bachsOnboardingUrl" TEXT;