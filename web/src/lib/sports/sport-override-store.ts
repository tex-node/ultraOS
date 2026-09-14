// Server-side resolution of sport definitions with organization-level overrides applied.
// See documentation/architecture/MULTI_SPORT_ARCHITECTURE.md, Section 5.1 (decision D3).
//
// The code registry stays the authority: an override can only replace values the definition
// already declares. A missing, invalid, or stale override never changes behaviour - resolution
// falls back to the registered definition rather than failing a read.

import type { Prisma } from "@/generated/prisma/client";
import { withOrganizationContext } from "@/lib/tenant-context";
import { requireSportDefinition } from "./registry";
import { applySportOverride, parseSportOverride, validateSportOverride } from "./overrides";
import type { SportDefinition } from "./types";

export async function loadActiveSportOverride(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sportId: string,
) {
  return tx.sportDefinitionOverride.findFirst({
    where: { organizationId, sportId, isActive: true },
    orderBy: { version: "desc" },
  });
}

// Applies an organization's active override to a code-registered definition. Safe to call inside an
// existing transaction (unlike resolveSportDefinitionForOrganization); falls back to the registered
// definition when no valid override exists.
export async function resolveSportDefinitionForSportInTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sport: { id: string; slug: string },
): Promise<SportDefinition> {
  const base = requireSportDefinition(sport.slug);
  const override = await loadActiveSportOverride(tx, organizationId, sport.id);
  if (!override) return base;
  try {
    const config = parseSportOverride(override.config);
    if (validateSportOverride(base, config).length > 0) return base;
    return applySportOverride(base, config);
  } catch {
    return base;
  }
}

export async function resolveSportDefinitionForOrganization(
  organizationId: string,
  sportKeyOrSlug: string,
): Promise<SportDefinition> {
  const base = requireSportDefinition(sportKeyOrSlug);
  return withOrganizationContext(organizationId, async (tx) => {
    const sport = await tx.sport.findUnique({ where: { slug: base.slug }, select: { id: true, slug: true } });
    if (!sport) return base;
    return resolveSportDefinitionForSportInTx(tx, organizationId, sport);
  });
}
