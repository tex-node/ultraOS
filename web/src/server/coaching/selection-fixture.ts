import "server-only";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

// Resolve a FIXTURE id (not a SeasonClub id) to the two clubs that play it, for the selection page.
// The /coaching routes are otherwise club-scoped, so this is the one place a coaching page starts
// from a fixture: it must find the fixture's organization before anything else can be read, because
// Fixture is a tenant table. Same "search the ACTIVE organizations with an explicit organizationId
// filter" approach as scope.ts, and the same guarantee: a guessed id from another organization can
// never resolve under the wrong tenant.

export type SelectionFixture = {
  organizationId: string;
  seasonId: string;
  fixtureId: string;
  scheduledAt: Date;
  status: string;
  homeSeasonClubId: string;
  awaySeasonClubId: string;
  homeName: string;
  awayName: string;
};

export async function loadSelectionFixture(fixtureId: string): Promise<SelectionFixture | null> {
  const organizations = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (const organization of organizations) {
    const found = await withOrganizationContext(organization.id, (tx) =>
      tx.fixture.findFirst({
        where: { id: fixtureId, organizationId: organization.id },
        select: {
          id: true,
          seasonId: true,
          scheduledAt: true,
          status: true,
          homeSeasonClubId: true,
          awaySeasonClubId: true,
          homeSeasonClub: { select: { club: { select: { name: true } } } },
          awaySeasonClub: { select: { club: { select: { name: true } } } },
        },
      }),
    );
    if (!found) continue;
    if (!found.homeSeasonClubId || !found.awaySeasonClubId) continue;
    return {
      organizationId: organization.id,
      seasonId: found.seasonId,
      fixtureId: found.id,
      scheduledAt: found.scheduledAt,
      status: found.status,
      homeSeasonClubId: found.homeSeasonClubId,
      awaySeasonClubId: found.awaySeasonClubId,
      homeName: found.homeSeasonClub?.club.name ?? "Home",
      awayName: found.awaySeasonClub?.club.name ?? "Away",
    };
  }
  return null;
}
