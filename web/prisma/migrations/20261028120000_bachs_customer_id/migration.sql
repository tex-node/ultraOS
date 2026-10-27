-- Streak v18, Prompt 1: Stripe -> Bachs.
--
-- A RENAME, not a drop-and-add: the column may hold live customer ids in an environment where Stripe was used, and a
-- rename preserves whatever is there (nothing in production today, but the habit of writing destructive migrations for
-- a "rename" is exactly how data disappears on the environment nobody tested).
--
-- Organization is the tenant table itself, so the usual 5-step checklist does not apply - there is no cross-tenant read
-- to isolate because the table IS the tenant boundary.
ALTER TABLE "Organization" RENAME COLUMN "stripeCustomerId" TO "bachsCustomerId";
COMMENT ON COLUMN "Organization"."bachsCustomerId" IS 'The Bachs customer id (cust_...), set by checkout or by an admin.';
