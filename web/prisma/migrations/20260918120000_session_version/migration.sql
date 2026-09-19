-- Session version: lets a password change sign out every other device.
--
-- Each JWT carries the version that was current at sign-in. The session check accepts it only when
-- it still matches the user's row; changing the password bumps the row, so every other device's
-- token stops matching on its next page load.
--
-- Additive: existing users backfill to 0, and tokens minted before this column existed are treated
-- as version 0, so nobody is signed out by the migration itself.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
