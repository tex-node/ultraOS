-- F5 vendor marketplace: menu approvals and commission configuration.
--
-- Additive: new columns carry defaults, and existing products are backfilled to APPROVED
-- so current menus keep selling without interruption. New products created through the app
-- start PENDING and sell only after approval.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- 1. Product approval state.
CREATE TYPE "ProductApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "VendorProduct" ADD COLUMN "approvalStatus" "ProductApproval" NOT NULL DEFAULT 'PENDING';
UPDATE "VendorProduct" SET "approvalStatus" = 'APPROVED';

-- 2. League commission on vendor gross, in basis points (0 = no commission).
ALTER TABLE "Vendor" ADD COLUMN "commissionBps" INTEGER NOT NULL DEFAULT 0;
