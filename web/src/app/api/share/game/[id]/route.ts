import { NextResponse } from "next/server";
import { buildGameResultCard } from "@/lib/analytics/cards/game-cards";
import { renderCardPng } from "@/lib/analytics/cards/png-card";
import { loadGameCoreByFixture } from "@/lib/analytics/game-analytics";
import { classifyGameStory } from "@/lib/analytics/game-story";
import { rankWhyTheyWon } from "@/lib/analytics/why-they-won";
import { getGameAnalyticsCapability } from "@/lib/game-data-capability";
import type { CardFormat } from "@/lib/analytics/cards/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = FORMAT_MAP[new URL(request.url).searchParams.get("format") ?? ""] ?? "SOCIAL_SQUARE";

  const game = await loadGameCoreByFixture(id);
  if (!game || game.status !== "FINAL") return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const tags = classifyGameStory(game);
  const factors = rankWhyTheyWon(game);
  const keyStat = factors[0] ? { label: factors[0].label, value: `${factors[0].winnerValue} vs ${factors[0].loserValue}` } : null;
  const capability = getGameAnalyticsCapability(game.dataCapability);
  const card = buildGameResultCard(game, tags, keyStat, capability);
  return renderCardPng(card, format);
}
