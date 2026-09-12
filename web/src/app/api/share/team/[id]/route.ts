import { NextResponse } from "next/server";
import { buildTeamProfileCard } from "@/lib/analytics/cards/team-cards";
import { renderCardPng } from "@/lib/analytics/cards/png-card";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { computeSeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import { computeLeagueTeamDna } from "@/lib/analytics/team-dna";
import { computeTeamRanks, topRankBadges } from "@/lib/analytics/rank-context";
import type { CardFormat } from "@/lib/analytics/cards/types";
import { PublicResourceLocatorType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  locatorMatchesResource,
  resolvePublicResourceLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = FORMAT_MAP[new URL(request.url).searchParams.get("format") ?? ""] ?? "SOCIAL_SQUARE";

  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.CLUB,
    id,
  );
  if (!locator) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const club = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.club.findUnique({
      where: { id: locator.resourceId },
      select: { id: true, organizationId: true, logoUrl: true, seasonClubs: { where: { status: "ACTIVE" }, select: { id: true, organizationId: true, seasonId: true }, take: 1 } },
    }),
  );
  if (!locatorMatchesResource(locator, club)) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  const seasonClub = club?.seasonClubs[0];
  if (!club || !seasonClub) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const games = await withOrganizationContext(seasonClub.organizationId, (tx) => loadSeasonGameCores(seasonClub.seasonId, tx));
  const totalsByTeam = computeSeasonTeamTotals(games);
  const totals = totalsByTeam.get(seasonClub.id);
  if (!totals) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const dnaByTeam = computeLeagueTeamDna(games);
  const dna = dnaByTeam.get(seasonClub.id) ?? null;
  const ranks = topRankBadges(computeTeamRanks(seasonClub.id, [...totalsByTeam.values()]));
  const card = buildTeamProfileCard(totals, dna, club.logoUrl, ranks, "BOX_SCORE_ONLY");
  return renderCardPng(card, format);
}
