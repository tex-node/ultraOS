-- F4 ticketing depth: pass tiers on zone inventory, promo codes on reservations,
-- and the GATE_MANAGER role.
--
-- Implemented additively: all new columns are nullable, the new enum is only referenced
-- by nullable columns, and the role addition uses a type rename (not ALTER TYPE ADD VALUE,
-- which cannot run inside Prisma's migration transaction). Existing rows keep their values.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- 1. New PassTier enum for zone-level passes.
CREATE TYPE "PassTier" AS ENUM ('DAY_PASS', 'TOURNAMENT_PASS');

-- 2. Pass columns on SeatZone (null tier = regular single-event zone).
ALTER TABLE "SeatZone" ADD COLUMN "passTier" "PassTier";
ALTER TABLE "SeatZone" ADD COLUMN "passValidFrom" TIMESTAMP(3);
ALTER TABLE "SeatZone" ADD COLUMN "passValidTo" TIMESTAMP(3);

-- 3. Optional promo code on SeatReservation. Simple (non-composite) FK: PromoCode has no
-- composite org key, so reserveZone() asserts same-organization at the application layer.
ALTER TABLE "SeatReservation" ADD COLUMN "promoCodeId" TEXT;
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. GATE_MANAGER role via rename dance (see header).
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'LEAGUE_OPERATOR', 'TEAM_MANAGER', 'PLAYER', 'COACH', 'SCOUT', 'OFFICIAL', 'VENDOR', 'MEDIA', 'VOLUNTEER', 'GATE_MANAGER', 'FAN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING "role"::text::"UserRole_new";
ALTER TABLE "UserRoleAssignment" ALTER COLUMN "role" TYPE "UserRole_new" USING "role"::text::"UserRole_new";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'FAN';
