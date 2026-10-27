import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

// League health for an organization admin (streak v19, Prompt 3).
//
// The numbers a league operator actually opens a dashboard for, in one read: how many competitions are running, what is
// on court RIGHT NOW, how much admin work is waiting, what was just produced, and what came in. Every query runs inside
// the tenant context, because every table here is RLS-forced - a bare prisma call would silently resolve to the platform
// default organization and report a different league's numbers as if they were yours.
export type LeagueDashboard = {
  organization: { id: string; name: string; slug: string; plan: string };
  activeCompetitions: number;
  totalCompetitions: number;
  liveFixtures: { id: string; homeName: string; awayName: string; homeScore: number; awayScore: number; competitionName: string; period: number | null; status: string }[];
  pendingApplications: number;
  pendingByType: { type: string; count: number }[];
  recentHighlights: { id: string; title: string | null; url: string | null; createdAt: Date; fixtureId: string | null }[];
  revenue: { ticketOrders: number; ticketRevenueKobo: number; paidOrders: number };
};

export async function loadLeagueDashboard(organizationSlug: string): Promise<LeagueDashboard | null> {
  const organization = await prisma.organization.findFirst({
    where: { slug: organizationSlug },
    select: { id: true, name: true, slug: true, plan: true },
  });
  if (!organization) return null;
  const organizationId = organization.id;

  return withOrganizationContext(organizationId, async (tx) => {
    const [activeCompetitions, totalCompetitions, liveFixtures, pending, pendingGrouped, highlights, orders] = await Promise.all([
      tx.competition.count({ where: { organizationId, isActive: true, seasons: { some: { status: "ACTIVE" } } } }),
      tx.competition.count({ where: { organizationId } }),
      tx.fixture.findMany({
        where: { organizationId, status: "LIVE" },
        orderBy: { scheduledAt: "asc" },
        take: 8,
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          status: true,
          homeSeasonClub: { select: { club: { select: { name: true } } } },
          awaySeasonClub: { select: { club: { select: { name: true } } } },
          homeEntrant: { select: { name: true } },
          awayEntrant: { select: { name: true } },
          game: { select: { currentPeriod: true } },
          division: { select: { competition: { select: { name: true } } } },
        },
      }),
      tx.application.count({ where: { organizationId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      tx.application.groupBy({ by: ["type"], where: { organizationId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, _count: { _all: true } }),
      tx.mediaAsset.findMany({
        where: { organizationId, purpose: "HIGHLIGHT_CLIP" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, title: true, publicUrl: true, createdAt: true, usages: { select: { entityType: true, entityId: true } } },
      }),
      tx.order.groupBy({ by: ["paymentStatus"], where: { organizationId }, _count: { _all: true }, _sum: { totalKobo: true } }),
    ]);

    const paid = orders.filter((row) => row.paymentStatus === "PAID");
    return {
      organization,
      activeCompetitions,
      totalCompetitions,
      liveFixtures: liveFixtures.map((fixture) => ({
        id: fixture.id,
        homeName: fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "Home",
        awayName: fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "Away",
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        competitionName: fixture.division.competition.name,
        period: fixture.game?.currentPeriod ?? null,
        status: fixture.status,
      })),
      pendingApplications: pending,
      pendingByType: pendingGrouped.map((row) => ({ type: row.type, count: row._count._all })),
      recentHighlights: highlights.map((asset) => ({
        id: asset.id,
        title: asset.title,
        url: asset.publicUrl ?? `/media/assets/${asset.id}/file`,
        createdAt: asset.createdAt,
        fixtureId: asset.usages.find((usage) => usage.entityType === "FIXTURE")?.entityId ?? null,
      })),
      revenue: {
        ticketOrders: orders.reduce((sum, row) => sum + row._count._all, 0),
        paidOrders: paid.reduce((sum, row) => sum + row._count._all, 0),
        ticketRevenueKobo: paid.reduce((sum, row) => sum + (row._sum.totalKobo ?? 0), 0),
      },
    };
  });
}
