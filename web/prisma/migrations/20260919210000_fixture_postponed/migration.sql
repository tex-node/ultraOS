-- Fixture postponement: a fixture can be POSTPONED (taken out of scheduling and standings
-- consideration without cancelling it) and later returned to SCHEDULED via the fixture form.
--
-- Implemented as a type rename (not ALTER TYPE ADD VALUE, which cannot run inside Prisma's
-- migration transaction). Additive: existing rows keep their values.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

CREATE TYPE "FixtureStatus_new" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL', 'CANCELLED', 'POSTPONED');

ALTER TABLE "Fixture" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Fixture" ALTER COLUMN "status" TYPE "FixtureStatus_new" USING "status"::text::"FixtureStatus_new";
ALTER TYPE "FixtureStatus" RENAME TO "FixtureStatus_old";
ALTER TYPE "FixtureStatus_new" RENAME TO "FixtureStatus";
DROP TYPE "FixtureStatus_old";
ALTER TABLE "Fixture" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';