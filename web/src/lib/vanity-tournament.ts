// Resolves a short, cross-organization vanity tournament slug (e.g. "lbcl") to its owning
// organization + competition via the Stage 5.5A PublicResourceLocator mechanism, extended with
// the COMPETITION resource type (2026-09-22). Deliberately separate from /t/[slug] (which stays
// Neon-Ultra-only by design) - this is the bootstrap path for any OTHER organization's public
// tournament page, reachable at the top-level `/[vanitySlug]` route.
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePublicResourceLocator, upsertPublicResourceLocator, locatorMatchesResource } from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

// Deliberately opt-in, never automatic per-competition: the vanity publicKey namespace is
// shared across every organization on the platform (@@unique([resourceType, publicKey])), so
// registering one is an explicit product decision for a specific tournament, not something every
// new Competition should silently claim (a common word could otherwise be land-grabbed by
// whichever organization happens to be created first).
export async function registerVanityTournamentSlug(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; competitionId: string; vanitySlug: string },
) {
  return upsertPublicResourceLocator(tx, {
    resourceType: "COMPETITION",
    publicKey: input.vanitySlug,
    organizationId: input.organizationId,
    resourceId: input.competitionId,
  });
}

export async function resolveVanityCompetitionId(vanitySlug: string) {
  const locator = await resolvePublicResourceLocator(prisma, "COMPETITION", vanitySlug);
  if (!locator) return null;
  const competition = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.competition.findUnique({ where: { id: locator.resourceId }, select: { id: true, organizationId: true, isActive: true } }),
  );
  if (!competition || !competition.isActive || !locatorMatchesResource(locator, competition)) return null;
  return { organizationId: locator.organizationId, competitionId: competition.id };
}
