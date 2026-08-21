import { NextResponse } from "next/server";
import { buildTeamProfileCard } from "@/lib/analytics/cards/team-cards";
import { renderCardPng } from "@/lib/analytics/cards/png-card";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { computeSeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import { computeLeagueTeamDna } from "@/lib/analytics/team-dna";
import { computeTeamRanks, topRankBadges } from "@/lib/analytics/rank-context";
import type { CardFormat } from "@/lib/analytics/cards/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = FORMAT_MAP[new URL(request.url).searchParams.get("format") ?? ""] ?? "SOCIAL_SQUARE";

  const club = await prisma.club.findUnique({
    where: { id },
    select: { logoUrl: true, seasonClubs: { where: { status: "ACTIVE" }, select: { id: true, seasonId: true }, take: 1 } },
  });
  const seasonClub = club?.seasonClubs[0];
  if (!club || !seasonClub) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const games = await loadSeasonGameCores(seasonClub.seasonId);
  const totalsByTeam = computeSeasonTeamTotals(games);
  const totals = totalsByTeam.get(seasonClub.id);
  if (!totals) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const dnaByTeam = computeLeagueTeamDna(games);
  const dna = dnaByTeam.get(seasonClub.id) ?? null;
  const ranks = topRankBadges(computeTeamRanks(seasonClub.id, [...totalsByTeam.values()]));
  const card = buildTeamProfileCard(totals, dna, club.logoUrl, ranks, "BOX_SCORE_ONLY");
  return renderCardPng(card, format);
}
