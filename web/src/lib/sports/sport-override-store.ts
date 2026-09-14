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

export async function resolveSportDefinitionForOrganization(
  organizationId: string,
  sportKeyOrSlug: string,
): Promise<SportDefinition> {
  const base = requireSportDefinition(sportKeyOrSlug);
  const override = await withOrganizationContext(organizationId, (tx) =>
    tx.sportDefinitionOverride.findFirst({
      where: { organizationId, sport: { slug: base.slug }, isActive: true },
      orderBy: { version: "desc" },
    }),
  );
  if (!override) return base;
  try {
    const config = parseSportOverride(override.config);
    if (validateSportOverride(base, config).length > 0) return base;
    return applySportOverride(base, config);
  } catch {
    return base;
  }
}
