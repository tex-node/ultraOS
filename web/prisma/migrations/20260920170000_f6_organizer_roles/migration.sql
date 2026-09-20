-- F6 organizer roles: TOURNAMENT_DIRECTOR, SCOREKEEPER, VENDOR_MANAGER.
--
-- Additive: uses the same type-rename dance as earlier role additions (ALTER TYPE ADD VALUE
-- cannot run inside Prisma's migration transaction). Existing rows keep their values.
-- Scoped per-tournament assignment reuses the existing GameControlGrant SCOREKEEPER /
-- STATISTICIAN grant roles — these UserRole values are the organization-level grants.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'LEAGUE_OPERATOR', 'TOURNAMENT_DIRECTOR', 'TEAM_MANAGER', 'PLAYER', 'COACH', 'SCOUT', 'OFFICIAL', 'SCOREKEEPER', 'VENDOR', 'VENDOR_MANAGER', 'MEDIA', 'VOLUNTEER', 'GATE_MANAGER', 'FAN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING "role"::text::"UserRole_new";
ALTER TABLE "UserRoleAssignment" ALTER COLUMN "role" TYPE "UserRole_new" USING "role"::text::"UserRole_new";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'FAN';
