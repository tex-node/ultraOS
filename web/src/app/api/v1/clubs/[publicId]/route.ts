import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { resolveClubByPublicId } from "@/lib/api-v1/identifiers";
import type { ClubSummaryV1 } from "@/lib/api-v1/contracts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/clubs/[publicId] - publicId is Club.shortName lowercased (Part XV: unique per
// sport, stable, human-readable - the closest thing to a real slug this schema has).
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const club = await resolveClubByPublicId(publicId);
    if (!club) return apiError("CLUB_NOT_FOUND", "No club found for this id.");

    const activeSeasonClub = await prisma.seasonClub.findFirst({
      where: { clubId: club.id, status: "ACTIVE" },
      include: { division: true, standing: true },
      orderBy: { season: { startDate: "desc" } },
    });

    const summary: ClubSummaryV1 = {
      publicId, name: club.name, shortName: club.shortName, logoUrl: club.logoUrl,
      division: activeSeasonClub?.division.name ?? "",
      record: activeSeasonClub?.standing
        ? {
            played: activeSeasonClub.standing.played, won: activeSeasonClub.standing.won, lost: activeSeasonClub.standing.lost,
            pointsFor: activeSeasonClub.standing.pointsFor, pointsAgainst: activeSeasonClub.standing.pointsAgainst,
            pointDifference: activeSeasonClub.standing.pointDifference, leaguePoints: activeSeasonClub.standing.leaguePoints,
          }
        : null,
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(summary);
  });
}
