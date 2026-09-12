import { NextResponse } from "next/server";
import { buildRecordCard } from "@/lib/analytics/cards/leaderboard-cards";
import { renderCardPng } from "@/lib/analytics/cards/png-card";
import { loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { buildGameRecords, buildPlayerSeasonRecords, buildPlayerSingleGameRecords, buildTeamRecords } from "@/lib/analytics/records";
import type { CardFormat } from "@/lib/analytics/cards/types";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const format = FORMAT_MAP[new URL(request.url).searchParams.get("format") ?? ""] ?? "SOCIAL_SQUARE";
  const decodedKey = decodeURIComponent(key);

  const organization = await resolveDefaultPublicOrganization();
  const season = await withOrganizationContext(organization.id, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 404 });

  const [games, players] = await withOrganizationContext(organization.id, (tx) =>
    Promise.all([loadSeasonGameCores(season.id, tx), loadSeasonPlayerTotals(season.id, tx)]),
  );
  const allRecords = [
    ...buildPlayerSingleGameRecords(games),
    ...buildPlayerSeasonRecords(players),
    ...buildTeamRecords(games),
    ...buildGameRecords(games),
  ];
  const record = allRecords.find((r) => r.key === decodedKey);
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const card = buildRecordCard(record, "BOX_SCORE_ONLY");
  return renderCardPng(card, format);
}
