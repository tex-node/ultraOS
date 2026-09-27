-- P13/A3: adds OFFLINE_SYNC to the StatDataSource enum so a sync-replayed GameEvent is
-- distinguishable from a live-console write. Additive only; existing values are unaffected.
--
-- Kept in its own migration (like 20260922100000_external_stats_locator_type) because PostgreSQL
-- cannot USE a newly added enum value in the same transaction that adds it. The GameEvent
-- provenance columns and the sync tables follow in the next migration.
ALTER TYPE "StatDataSource" ADD VALUE 'OFFLINE_SYNC';
