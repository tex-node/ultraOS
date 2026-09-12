-- Phase 1, Stage 5.2B-3: tenant-aware composite foreign keys for DraftAllocation's
-- draftEvent/division/seasonClub relations and DraftSquadMember's draftSquad/player relations -
-- the same relational-integrity pattern Stage 5.4B established for SeasonClub, applied here
-- because this stage's rehearsal proved these are live, relation-writing paths (the confirm
-- step is what actually writes permanent Player.seasonClubId / SeasonClub coach assignments).
--
-- Hand-authored, mirroring Stage 5.4B's SeasonClub migration exactly - no data transformation
-- is needed (only new unique indexes and FK redefinitions on existing NOT NULL columns), so a
-- live diff against a real database added nothing a direct read of that precedent didn't already
-- give.
--
-- Five parent tables gain the same `UNIQUE (organizationId, id)` index Stage 5.4B added to
-- Club/Division/Season, so DraftAllocation/DraftSquadMember's children can reference them
-- compositely: SeasonClub, Player, Staff, DraftEvent, DraftSquad.
--
-- Only the REQUIRED relations are converted to composite FKs this stage:
--   DraftAllocation: draftEventId, divisionId, seasonClubId
--   DraftSquadMember: draftSquadId, playerId
-- DraftAllocation.draftSquadId and .staffId are deliberately left as simple (non-composite) FKs
-- - both are nullable, and Prisma/Postgres reject a composite FK with `ON DELETE SET NULL` when
-- any column in that FK (here, organizationId) is itself NOT NULL: Postgres would have to null
-- out organizationId too on a referenced-row delete, violating this table's own NOT NULL
-- constraint (`prisma validate` surfaced this directly). This is the same reason SeasonClub's
-- own nullable Staff references (headCoachId/assistantCoachId/teamManagerId/scoutId/
-- fanCaptainId) were never made composite either. The application-level guard remains the
-- operative protection for these two relations - both ids are always resolved inside
-- reserveNextAllocation()'s own scoped transaction, never client-supplied.
--
-- The other 16 tenant-to-tenant relations this stage's domain establishes (Draft's own
-- season/division/draftEvent, DraftEvent's own season/event, DraftSquad's own
-- season/division/draftEvent, DraftCoachPoolEntry's division/draftEvent/staff, DraftPick's
-- draft/player/seasonClub) are inventoried and classified in
-- PHASE1_STAGE5_2B3_DRAFT_TRYOUT_COACH_TENANCY.md but deliberately not converted here - same
-- incremental-adoption reasoning as Stage 5.4B's own remaining 164.
--
-- Preceded by a production-safe, read-only mismatch audit of exactly the 7 relations converted
-- here: zero existing cross-org mismatches in any of them - this migration cannot fail against
-- current data.
--
-- ON DELETE/ON UPDATE behavior is unchanged from the original single-column FKs: draftEvent on
-- DraftAllocation stays CASCADE, division stays RESTRICT, seasonClub stays RESTRICT;
-- draftSquad on DraftSquadMember stays CASCADE, player stays RESTRICT.
--
-- Rehearsed on ultraos_staging as the actual restricted role, then separately inside a
-- rolled-back transaction as the privileged migrate role (bypasses RLS entirely) to prove this
-- is a true database constraint, not something that only holds because of RLS.

ALTER TABLE "DraftAllocation" DROP CONSTRAINT "DraftAllocation_draftEventId_fkey";
ALTER TABLE "DraftAllocation" DROP CONSTRAINT "DraftAllocation_divisionId_fkey";
ALTER TABLE "DraftAllocation" DROP CONSTRAINT "DraftAllocation_seasonClubId_fkey";
ALTER TABLE "DraftSquadMember" DROP CONSTRAINT "DraftSquadMember_draftSquadId_fkey";
ALTER TABLE "DraftSquadMember" DROP CONSTRAINT "DraftSquadMember_playerId_fkey";

CREATE UNIQUE INDEX "SeasonClub_organizationId_id_key" ON "SeasonClub"("organizationId", "id");
CREATE UNIQUE INDEX "Player_organizationId_id_key" ON "Player"("organizationId", "id");
CREATE UNIQUE INDEX "Staff_organizationId_id_key" ON "Staff"("organizationId", "id");
CREATE UNIQUE INDEX "DraftEvent_organizationId_id_key" ON "DraftEvent"("organizationId", "id");
CREATE UNIQUE INDEX "DraftSquad_organizationId_id_key" ON "DraftSquad"("organizationId", "id");

ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_organizationId_draftEventId_fkey" FOREIGN KEY ("organizationId", "draftEventId") REFERENCES "DraftEvent"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_organizationId_divisionId_fkey" FOREIGN KEY ("organizationId", "divisionId") REFERENCES "Division"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_organizationId_seasonClubId_fkey" FOREIGN KEY ("organizationId", "seasonClubId") REFERENCES "SeasonClub"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftSquadMember" ADD CONSTRAINT "DraftSquadMember_organizationId_draftSquadId_fkey" FOREIGN KEY ("organizationId", "draftSquadId") REFERENCES "DraftSquad"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftSquadMember" ADD CONSTRAINT "DraftSquadMember_organizationId_playerId_fkey" FOREIGN KEY ("organizationId", "playerId") REFERENCES "Player"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
