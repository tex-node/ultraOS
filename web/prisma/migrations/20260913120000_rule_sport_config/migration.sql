-- Multi-sport Stage 4 (S4.1/S4.2): generalized rules.
--
-- Adds nullable/additive columns to RuleSet (sportId, config) and GameRuleSnapshot (sportId,
-- definitionVersion, ruleValues), plus two FKs to the global Sport catalog. No existing column,
-- constraint, index, policy, or default is altered or dropped; the legacy basketball rule columns
-- remain authoritative until read paths are migrated. RuleSet/GameRuleSnapshot already carry RLS
-- policies (Stage 4a), so no new policy is required for these columns.
--
-- Method: taken verbatim from a read-only
--   prisma migrate diff --from-schema <committed Stage 3 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback: the added columns are nullable and safe to leave; dropping them would lose any
-- multi-sport config. Recover only via backup restore (if approved) or a forward corrective
-- migration.

-- AlterTable
ALTER TABLE "RuleSet" ADD COLUMN     "config" JSONB,
ADD COLUMN     "sportId" TEXT;

-- AlterTable
ALTER TABLE "GameRuleSnapshot" ADD COLUMN     "definitionVersion" INTEGER,
ADD COLUMN     "ruleValues" JSONB,
ADD COLUMN     "sportId" TEXT;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRuleSnapshot" ADD CONSTRAINT "GameRuleSnapshot_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
