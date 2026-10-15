import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

// A /coaching URL carries only a SeasonClub id, but SeasonClub is a tenant table: it can only be
// read inside its organization's context. Resolve the id by looking in each ACTIVE organization
// (a handful) with an explicit organizationId filter, so a guessed id from another organization
// can never resolve under the wrong tenant.

export type ClubScope = {
  organizationId: string;
  seasonClubId: string;
  seasonId: string;
  seasonName: string;
  clubName: string;
};

export const resolveClubScope = cache(async (seasonClubId: string): Promise<ClubScope | null> => {
  const organizations = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (const organization of organizations) {
    const found = await withOrganizationContext(organization.id, (tx) =>
      tx.seasonClub.findFirst({
        where: { id: seasonClubId, organizationId: organization.id },
        select: { id: true, seasonId: true, season: { select: { name: true } }, club: { select: { name: true } } },
      }),
    );
    if (found) {
      return { organizationId: organization.id, seasonClubId: found.id, seasonId: found.seasonId, seasonName: found.season.name, clubName: found.club.name };
    }
  }
  return null;
});
