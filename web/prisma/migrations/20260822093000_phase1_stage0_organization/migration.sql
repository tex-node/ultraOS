-- Phase 1, Stage 0: Multi-Tenancy Foundation
--
-- Generated via a live read-only `prisma migrate diff --from-config-datasource --to-schema
-- <candidate>` against production, per this project's established methodology. The raw diff
-- output also contained 5 cosmetic RenameIndex statements (Prisma-version identifier-truncation
-- artifacts on AthleteTrainingMetric/DraftAllocation indexes, unrelated to this change - the
-- underlying @@unique constraints are unchanged) - deliberately excluded here, same as every
-- prior migration in this project that hit the same pre-existing drift.
--
-- Purely additive except for one constraint replacement on UserRoleAssignment: its old 2-column
-- unique index (userId, role) is dropped and replaced by a 3-column one that includes the new
-- organizationId column. This is safe with no backfill required - every existing
-- UserRoleAssignment row gets organizationId = NULL when the column is added, and the old
-- constraint already guaranteed at most one (userId, role) pair, so at most one
-- (userId, role, NULL) row can exist per user+role either way. No existing row's data changes.
--
-- No Organization row exists yet after this migration runs - creating the first one (for Neon
-- Ultra Basketball League) is a deliberate follow-up step, not bundled into schema DDL.

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- DropIndex
DROP INDEX "UserRoleAssignment_userId_role_key";

-- AlterTable
ALTER TABLE "UserRoleAssignment" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "idPrefixAthlete" TEXT NOT NULL DEFAULT 'UBA',
    "idPrefixStaff" TEXT NOT NULL DEFAULT 'UBS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_organizationId_role_idx" ON "UserRoleAssignment"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleAssignment_userId_role_organizationId_key" ON "UserRoleAssignment"("userId", "role", "organizationId");

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
