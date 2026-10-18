# Tenant database migrations (the rules a new table must satisfy)

Every new table in this project is a tenant table unless it is deliberately platform-global
(`Sport`, `SportMetricDefinition`, `TrainingMetricDefinition`). A tenant table that misses any of the
steps below does not fail at migration time - it fails at **runtime**, on the first page that touches
it, in production, after the deploy looks green. Both of this project's occurrences so far were found
only by rendering a real page against a real deployment.

## The checklist

A tenant-table migration file must contain, in the same file:

1. **`CREATE TABLE`** with `organizationId TEXT NOT NULL` and its `Organization` FK.
2. **Indexes** for the access paths the code actually uses.
3. **Composite tenant-aware FKs** where the relation is required and non-null
   (`(organizationId, parentId) -> parent(organizationId, id)`), per
   `documentation/architecture/PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md`. This needs the parent to have
   `@@unique([organizationId, id])` - `Player`, `SeasonClub`, `Club`, `Season` and `Division` already do.
4. **RLS, enabled AND forced**, plus the `tenant_isolation` policy:

   ```sql
   ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "X" FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "X" FOR ALL
     USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), '<default org>'))
     WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), '<default org>'));
   ```

5. **`GRANT` for the runtime roles** - and this is the one that gets forgotten:

   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "X" TO ultraos_app;      -- production runtime
   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "X" TO ultraos_staging;  -- staging runtime
   ```

## Why the GRANT is not optional (and RLS is not a substitute)

- Migrations run as the **privileged** role (`migrate.env`: superuser, `BYPASSRLS`). The app runs as
  `ultraos_app` / `ultraos_staging`. A table created by the migration role is **not readable by the
  app role at all** until it is granted.
- This database has **no `ALTER DEFAULT PRIVILEGES`**, so nothing grants automatically. Every new table
  needs its own statement.
- The symptom is a hard 500, not a permission-shaped empty result:

  ```
  DriverAdapterError: permission denied for table "X"   (SQLSTATE 42501)
  ```

- **RLS and grants are different layers and both are required.** The grant says "this role may touch
  this table"; the `tenant_isolation` policy says "…but only this organization's rows". Adding the
  grant does not weaken RLS, and adding RLS does not grant access. Once the table is granted, an
  unscoped read still returns nothing for a tenant role.

## When the DB tests cannot catch this

`createTestDbContext` creates an isolated schema and runs `prisma db push` as the **same role** that
then queries it, so grants never come into play. Migration-only concerns (grants, RLS policies,
partial indexes, triggers, check constraints) are invisible to `test:db` by construction. They must be
verified by applying the migration to a real environment and **rendering the page** - not only by
querying as the migration role.

## Recorded occurrences

| Date | Table | Fix |
| --- | --- | --- |
| 2026-09-21 | `GameControlGrant` | `20260921100000_fix_game_control_grant_grants` (retrofit migration) |
| 2026-10-18 | `CoachingPlan` | `20261018130000_coaching_plan_grants` (retrofit migration; found by rendering `/coaching/<club>/players/<player>` on staging) |
| 2026-10-18 | `DataFeedSubscription`, `DataFeedDelivery` | `20261018202000_data_feed_grants` (retrofit migration; found by an **RLS probe run as the app role**, not by a page) |

The second one shipped without the grant because the checklist above did not exist as a single page.
It does now. Write the GRANT in the same migration that creates the table, even when the table is
"obviously" temporary, and even when a follow-up migration would be cheap - a failed page in
production is not cheap.

**The third one is a new failure mode: granting to the WRONG ROLE NAME.** That database has three roles whose
names share a stem - `ultraos`, `ultraos_app` (production runtime) and `ultraos_staging` (staging runtime) -
and the feed migration granted only to `ultraos`, which the app does not use. Nothing failed in the
verification scripts because they connect with the **privileged** URL; the RLS probe, which deliberately
switched to the app role, hit `permission denied for table "DataFeedSubscription"` immediately.

Lesson, now part of the checklist below: **a GRANT is only verified when a query runs as the app role.**
`information_schema.role_table_grants WHERE grantee='ultraos'` proves nothing about `ultraos_staging`.
Compare against an existing tenant table (`CoachingPlan`) and grant to every runtime role it lists, then run
one `SELECT` and one cross-tenant `INSERT` as that role.

## Related

- `documentation/architecture/PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md` - composite FKs and the proof
  that they hold under `BYPASSRLS`.
- `docs/patterns/component-testing.md` - the other half of "the tests cannot see this": what a jsdom
  test can and cannot prove.
