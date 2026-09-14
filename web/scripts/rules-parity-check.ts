// Multi-sport Stage 4 verification: read-only parity check for generalized rules.
//
// Verifies that every RuleSet config and GameRuleSnapshot ruleValues resolves to the same values
// the legacy basketball columns imply (the "snapshot round-trips existing games" exit criterion).
// Read-only; exits non-zero on any mismatch.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { parseRuleConfig, resolveRuleValues, ruleConfigFromLegacy } from "../src/lib/sports/rule-values";

function valuesEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let mismatches = 0;
  let checked = 0;

  for (const organization of organizations) {
    const result = await withOrganizationContext(organization.id, async (tx) => {
      let orgChecked = 0;
      let orgMismatches = 0;

      const ruleSets = await tx.ruleSet.findMany({
        select: {
          id: true,
          config: true,
          ultraTimeStartRemainingSeconds: true,
          ultraTimeMultiplier: true,
          fourPointBaseValue: true,
          mandatorySubstitutionPolicy: true,
          season: { select: { competition: { select: { sport: { select: { slug: true } } } } } },
        },
      });
      for (const ruleSet of ruleSets) {
        const slug = ruleSet.season?.competition.sport.slug;
        const definition = slug ? getSportDefinition(slug) : null;
        if (!definition) continue;
        orgChecked += 1;
        const stored = resolveRuleValues(definition, parseRuleConfig(ruleSet.config));
        const legacy = ruleConfigFromLegacy(definition, ruleSet);
        const expected = resolveRuleValues(definition, legacy);
        if (!valuesEqual(stored, expected)) {
          orgMismatches += 1;
          console.error(`  MISMATCH RuleSet ${ruleSet.id}: stored=${JSON.stringify(stored)} legacy=${JSON.stringify(expected)}`);
        }
      }

      const snapshots = await tx.gameRuleSnapshot.findMany({
        select: {
          id: true,
          ruleValues: true,
          ultraTimeStartRemainingSeconds: true,
          ultraTimeMultiplier: true,
          fourPointBaseValue: true,
          mandatorySubstitutionPolicy: true,
          game: {
            select: {
              fixture: {
                select: { division: { select: { competition: { select: { sport: { select: { slug: true } } } } } } },
              },
            },
          },
        },
      });
      for (const snapshot of snapshots) {
        const slug = snapshot.game.fixture.division.competition.sport.slug;
        const definition = getSportDefinition(slug);
        if (!definition) continue;
        orgChecked += 1;
        const stored = parseRuleConfig(snapshot.ruleValues);
        const expected = resolveRuleValues(definition, ruleConfigFromLegacy(definition, snapshot));
        if (!valuesEqual(stored, expected)) {
          orgMismatches += 1;
          console.error(`  MISMATCH GameRuleSnapshot ${snapshot.id}: stored=${JSON.stringify(stored)} legacy=${JSON.stringify(expected)}`);
        }
      }

      return { orgChecked, orgMismatches };
    });

    checked += result.orgChecked;
    mismatches += result.orgMismatches;
    console.log(`[${result.orgMismatches === 0 ? "OK" : "FAIL"}] ${organization.name}: checked=${result.orgChecked} mismatches=${result.orgMismatches}`);
  }

  console.log(mismatches === 0 ? `PARITY OK (${checked} rows checked)` : `PARITY FAILED (${mismatches} mismatches of ${checked})`);
  if (mismatches > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
