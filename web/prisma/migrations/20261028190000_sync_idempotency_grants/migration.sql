-- A5 Step 8 fix: grant the app roles what the replay path actually needs (5-step tenant checklist).
--
-- WHAT WAS BROKEN. `20260927120001_p13_sync_idempotency_conflictlog` created "SyncIdempotency" and "SyncConflictLog" but
-- never granted them to any application role and never enabled RLS. The tables were owned by the migration role, so
-- `ultraos_staging` could not read or write them: a replayed offline record came back from /api/sync/outbox as
--   {"status":"FAILED","detail":{"code":"UNKNOWN","message":"permission denied for table SyncIdempotency"}}
-- with HTTP 200, which is why the client kept the record in the outbox and the score never moved. Found by the A5 offline
-- e2e, not by any unit test - the parity test uses an owner-level client.
--
-- WHAT THIS DOES. Grants the four DML privileges to the three application roles (owner `ultraos`, the RLS-subject
-- `ultraos_app`, and staging's `ultraos_staging`), then puts both tables under the canonical tenant policy. They carry
-- `organizationId`, so leaving them with RLS disabled would be the one un-isolated pair in the schema.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'SyncIdempotency') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SyncIdempotency" TO ultraos;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SyncIdempotency" TO ultraos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SyncIdempotency" TO ultraos_staging;
    ALTER TABLE "SyncIdempotency" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "SyncIdempotency" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "SyncIdempotency";
    CREATE POLICY tenant_isolation ON "SyncIdempotency"
      USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'))
      WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'SyncConflictLog') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SyncConflictLog" TO ultraos;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SyncConflictLog" TO ultraos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "SyncConflictLog" TO ultraos_staging;
    ALTER TABLE "SyncConflictLog" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "SyncConflictLog" FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON "SyncConflictLog";
    CREATE POLICY tenant_isolation ON "SyncConflictLog"
      USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'))
      WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));
  END IF;
END
$$;
