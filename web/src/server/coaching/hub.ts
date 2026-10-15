import "server-only";
import type { CoachingViewer } from "@/lib/coaching/access";
import { hasInsightsAccess } from "@/lib/insights-access";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

// What the /coaching hub lists for a viewer. Coaches see only their assigned clubs; org admins see
// their organization's clubs that have games; super admins and the legacy insights override pick an
// organization first. Visibility here is only navigation: every club page re-checks access itself.

const ORG_ADMIN_ROLES = new Set(["LEAGUE_OPERATOR", "TOURNAMENT_DIRECTOR"]);

export type HubClub = { seasonClubId: string; clubName: string; seasonName: string };
export type HubOrganization = { organizationId: string; name: string; clubs: HubClub[] };
export type HubModel =
  | { kind: "PICKER"; organizations: { organizationId: string; name: string }[] }
  | { kind: "CLUBS"; groups: HubOrganization[] };

async function clubsWithGames(organizationId: string): Promise<HubClub[]> {
  const rows = await withOrganizationContext(organizationId, (tx) =>
    tx.seasonClub.findMany({
      where: { organizationId, season: { fixtures: { some: { status: "FINAL" } } } },
      select: { id: true, club: { select: { name: true } }, season: { select: { name: true, startDate: true } } },
    }),
  );
  return rows
    .sort((a, b) => b.season.startDate.getTime() - a.season.startDate.getTime() || a.club.name.localeCompare(b.club.name))
    .map((r) => ({ seasonClubId: r.id, clubName: r.club.name, seasonName: r.season.name }));
}

async function coachedClubDetails(organizationId: string, seasonClubIds: string[]): Promise<HubClub[]> {
  const rows = await withOrganizationContext(organizationId, (tx) =>
    tx.seasonClub.findMany({
      where: { organizationId, id: { in: seasonClubIds } },
      select: { id: true, club: { select: { name: true } }, season: { select: { name: true } } },
    }),
  );
  return rows.map((r) => ({ seasonClubId: r.id, clubName: r.club.name, seasonName: r.season.name }));
}

export async function loadHub(viewer: CoachingViewer, selectedOrganizationId: string | null): Promise<HubModel> {
  const organizations = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const nameOf = new Map(organizations.map((o) => [o.id, o.name]));
  const sees = (id: string) => nameOf.has(id);

  const seesEverything = viewer.roleAssignments.some((r) => r.role === "SUPER_ADMIN") || hasInsightsAccess(viewer.email);
  if (seesEverything) {
    const chosen = selectedOrganizationId && sees(selectedOrganizationId) ? selectedOrganizationId : organizations.length === 1 ? organizations[0].id : null;
    if (!chosen) return { kind: "PICKER", organizations: organizations.map((o) => ({ organizationId: o.id, name: o.name })) };
    return { kind: "CLUBS", groups: [{ organizationId: chosen, name: nameOf.get(chosen)!, clubs: await clubsWithGames(chosen) }] };
  }

  const groups = new Map<string, HubOrganization>();
  const adminOrgIds = new Set(viewer.roleAssignments.filter((r) => ORG_ADMIN_ROLES.has(r.role) && r.organizationId && sees(r.organizationId)).map((r) => r.organizationId as string));
  for (const organizationId of adminOrgIds) groups.set(organizationId, { organizationId, name: nameOf.get(organizationId)!, clubs: await clubsWithGames(organizationId) });

  const coachedByOrg = new Map<string, string[]>();
  for (const c of viewer.coachedSeasonClubs) {
    if (!sees(c.organizationId) || adminOrgIds.has(c.organizationId)) continue; // admins already see every club in the org
    coachedByOrg.set(c.organizationId, [...(coachedByOrg.get(c.organizationId) ?? []), c.seasonClubId]);
  }
  for (const [organizationId, ids] of coachedByOrg) {
    groups.set(organizationId, { organizationId, name: nameOf.get(organizationId)!, clubs: await coachedClubDetails(organizationId, ids) });
  }
  return { kind: "CLUBS", groups: [...groups.values()].filter((g) => g.clubs.length > 0) };
}
