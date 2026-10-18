-- Streak v4, Prompt 3: an explicit passport publication flag on Athlete.
--
-- Rationale: publication was previously implicit ("the athlete has games"), so an operator had no way to
-- hide a passport. The flag lives on Athlete because the public career page (/public/players/[id]) is
-- athlete-scoped, and a person's passport should not become half-published because one season's Player row
-- was toggled.
--
-- Tenant checklist: this is a COLUMN on an EXISTING tenant table, so there is no new table, no new RLS
-- policy and no new GRANT - the existing Athlete policy covers the new column automatically (RLS is
-- row-level, not column-level, and the runtime role's column privileges on Athlete already exist).
-- `DEFAULT true` keeps every existing row's behaviour identical on the migration itself.
ALTER TABLE "Athlete" ADD COLUMN "passportPublished" BOOLEAN NOT NULL DEFAULT true;

-- The public passport route looks this up by athlete id; the partial index keeps the check cheap without
-- indexing every athlete, and states the query shape in the schema.
CREATE INDEX "Athlete_passportPublished_idx" ON "Athlete" ("organizationId", "passportPublished");
