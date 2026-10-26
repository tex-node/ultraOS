-- Streak v16, Prompt 3: organization plans.
--
-- The column is NOT a tenant-table addition: Organization is the tenant table itself (no organizationId column, no RLS
-- policy - it is the row every other tenant row points at). The 5-step checklist therefore does not apply in its usual
-- form, and the reasoning is recorded here rather than left implicit: there is no cross-tenant read to isolate because
-- the table IS the tenant boundary, and access to a row is already decided by the role assignments that point at it.
--
-- Backfill: existing organizations become ENTERPRISE. They are already using API keys, multiple competitions and
-- webhooks; defaulting them to FREE would have switched off features they are paying nothing for today, which is a
-- worse failure than grandfathering them. New organizations created afterwards start on FREE (the column default).
CREATE TYPE "OrganizationPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "plan" "OrganizationPlan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

UPDATE "Organization" SET "plan" = 'ENTERPRISE' WHERE "plan" = 'FREE';

-- The billing page reads one organization's plan and counts its usage; the unique slug already indexes lookups.
CREATE INDEX IF NOT EXISTS "Organization_plan_idx" ON "Organization"("plan");
