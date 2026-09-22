// One-off: sets a per-organization standingsPoints override (WIN_DRAW_LOSS model only).
// Usage: npx tsx scripts/set-standings-points-override.ts <organizationId> <sportSlug> <win> <loss> [draw]
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { requireSportDefinition } from "../src/lib/sports/registry";
import { sportOverrideSchema, validateSportOverride } from "../src/lib/sports/overrides";

async function main() {
  const [organizationId, sportSlug, winRaw, lossRaw, drawRaw] = process.argv.slice(2);
  if (!organizationId || !sportSlug || !winRaw || !lossRaw) {
    console.error("Usage: npx tsx scripts/set-standings-points-override.ts <organizationId> <sportSlug> <win> <loss> [draw]");
    process.exitCode = 1;
    return;
  }
  const win = Number(winRaw);
  const loss = Number(lossRaw);
  const draw = drawRaw !== undefined ? Number(drawRaw) : undefined;

  const definition = requireSportDefinition(sportSlug);
  const config = sportOverrideSchema.parse({ standingsPoints: { win, loss, ...(draw !== undefined ? { draw } : {}) } });
  const issues = validateSportOverride(definition, config);
  if (issues.length > 0) {
    console.error("Invalid override:", issues.join("; "));
    process.exitCode = 1;
    return;
  }

  await withOrganizationContext(organizationId, async (tx) => {
    const sport = await tx.sport.findUniqueOrThrow({ where: { slug: sportSlug }, select: { id: true } });
    const latest = await tx.sportDefinitionOverride.findFirst({
      where: { organizationId, sportId: sport.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    await tx.sportDefinitionOverride.updateMany({
      where: { organizationId, sportId: sport.id, isActive: true },
      data: { isActive: false },
    });
    const override = await tx.sportDefinitionOverride.create({
      data: { organizationId, sportId: sport.id, version, config, isActive: true },
    });
    console.log(`Created override ${override.id} v${version} for org ${organizationId} / ${sportSlug}:`, config.standingsPoints);
  });
}

main().finally(() => prisma.$disconnect());
