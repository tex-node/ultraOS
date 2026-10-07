-- A4 (offline scoring tap, Commit 1 of 4): provenance for wall-clock-derived GameEvent fields
-- (multiplier, isUltraTime, points). Ultra Time is a function of wall-clock time, not of the event
-- sequence, so the server cannot correctly re-resolve it for a record that arrived via offline
-- sync - the offline scorer console observes and asserts it at tap time instead. resolvedBy
-- distinguishes a client-asserted event from a server-resolved one for post-game audit; it does
-- not change trust for anything else on the row (idempotency/authorization/entity references stay
-- server-authoritative regardless). See docs/canonical-write-audit.md's "wall-clock-derived event
-- fields" note.
--
-- Purely additive: a new enum type, a NOT NULL column with a constant default (no table rewrite
-- for existing rows in modern Postgres), and a nullable column. No backfill needed - every existing
-- row is correctly SERVER-resolved by definition (the offline scoring-tap path did not exist before
-- this migration).
CREATE TYPE "GameEventResolution" AS ENUM ('SERVER', 'CLIENT');

ALTER TABLE "GameEvent"
  ADD COLUMN "resolvedBy" "GameEventResolution" NOT NULL DEFAULT 'SERVER',
  ADD COLUMN "clientObservedAt" TIMESTAMP(3);
