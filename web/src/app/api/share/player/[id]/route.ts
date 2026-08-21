import { NextResponse } from "next/server";
import { buildPlayerSpotlightCard } from "@/lib/analytics/cards/player-cards";
import { renderCardPng } from "@/lib/analytics/cards/png-card";
import { loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { computePlayerRanks, topRankBadges } from "@/lib/analytics/rank-context";
import type { CardFormat } from "@/lib/analytics/cards/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = FORMAT_MAP[new URL(request.url).searchParams.get("format") ?? ""] ?? "SOCIAL_SQUARE";

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    select: { photoUrl: true, registrations: { include: { season: true }, orderBy: { season: { startDate: "desc" } } } },
  });
  const reg = athlete?.registrations.find((r) => r.season.status === "ACTIVE");
  if (!athlete || !reg) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const totals = await loadSeasonPlayerTotals(reg.seasonId);
  const target = totals.find((t) => t.playerId === reg.id);
  if (!target) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const ranks = topRankBadges(computePlayerRanks(reg.id, totals));
  const card = buildPlayerSpotlightCard(target, ranks, athlete.photoUrl, "BOX_SCORE_ONLY");
  return renderCardPng(card, format);
}
