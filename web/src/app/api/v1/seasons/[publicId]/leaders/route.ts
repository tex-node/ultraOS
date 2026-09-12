import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { resolveSeasonByPublicId, resolvePlayerNames } from "@/lib/api-v1/identifiers";
import { loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { buildPlayerLeaderboard } from "@/lib/analytics/league-analytics";
import type { SeasonLeadersV1, LeaderV1 } from "@/lib/api-v1/contracts";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_CATEGORIES = ["PPG", "RPG", "APG", "SPG", "BPG", "FG_PCT", "THREE_PCT", "FT_PCT", "EFF"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

// GET /api/v1/seasons/[publicId]/leaders?category=PPG - reuses buildPlayerLeaderboard() (the
// same qualification-filtered leaderboard the public site's own stats pages use) rather than a
// second leader computation for the API.
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const organization = await resolveDefaultPublicOrganization();
    const season = await withOrganizationContext(organization.id, (tx) => resolveSeasonByPublicId(publicId, tx));
    if (!season) return apiError("SEASON_NOT_FOUND", "No season found for this id.");

    const url = new URL(request.url);
    const categoryParam = url.searchParams.get("category") ?? "PPG";
    const category: Category = (VALID_CATEGORIES as readonly string[]).includes(categoryParam) ? (categoryParam as Category) : "PPG";

    const totals = await withOrganizationContext(organization.id, (tx) => loadSeasonPlayerTotals(season.id, tx));
    const entries = buildPlayerLeaderboard(totals, category).slice(0, 10);

    const { names, seasonClubs } = await withOrganizationContext(organization.id, async (tx) => ({
      names: await resolvePlayerNames(entries.map((e) => e.playerId), tx),
      seasonClubs: await tx.seasonClub.findMany({ where: { seasonId: season.id }, include: { club: true } }),
    }));
    const clubByShortName = new Map(seasonClubs.map((sc) => [sc.club.shortName, sc.club]));

    const leaders: LeaderV1[] = entries.map((e) => {
      const club = clubByShortName.get(e.seasonClubShortName);
      return {
        category,
        player: { publicId: names.get(e.playerId)?.publicId ?? null, name: e.name },
        club: club ? { publicId: club.shortName.toLowerCase(), name: club.name, shortName: club.shortName } : { publicId: e.seasonClubShortName.toLowerCase(), name: e.seasonClubShortName, shortName: e.seasonClubShortName },
        value: e.rawValue,
      };
    });

    const response: SeasonLeadersV1 = { seasonPublicId: publicId, category, leaders, generatedAt: new Date().toISOString() };
    return NextResponse.json(response);
  });
}
