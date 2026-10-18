-- Streak v5, Prompt 2 fix: the feed tables were granted to the WRONG ROLE.
--
-- 20261018200000_data_feed_subscriptions granted SELECT/INSERT/UPDATE/DELETE to `ultraos`. This database has
-- three roles whose names all contain that stem - `ultraos`, `ultraos_app` and `ultraos_staging` - and every
-- OTHER tenant table (CoachingPlan, ScoresheetImport, …) grants to all three. The app runs as
-- `ultraos_staging`, so on staging the new tables were invisible to it: any query would fail with
-- "permission denied for table DataFeedSubscription" (SQLSTATE 42501). The RLS probe caught it, not the
-- application, because the verification scripts connect with the privileged URL.
--
-- The original migration is NOT edited (Prisma records applied-migration checksums); this corrective
-- migration brings staging and production to the same grant set as every other tenant table.
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataFeedSubscription" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataFeedSubscription" TO ultraos_staging;

GRANT SELECT, INSERT, UPDATE, DELETE ON "DataFeedDelivery" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataFeedDelivery" TO ultraos_staging;
