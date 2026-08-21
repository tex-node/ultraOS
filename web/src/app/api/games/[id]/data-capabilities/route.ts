import { NextResponse } from "next/server";
import {
  GAME_DATA_CAPABILITY_LABEL,
  hasEventLedger,
  hasShotLocation,
  hasUltraStatDerivation,
  hasVisionEnrichment,
  type GameDataCapability,
} from "@/lib/game-data-capability";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// What a consumer (broadcast overlay, analytics dashboard, public site) can safely trust for
// this specific game. Never infer capability from whether a field happens to be non-null -
// always check this endpoint (or the equivalent helpers in src/lib/game-data-capability.ts)
// first. A FIBA/Genius Sports box-score import, for example, can have a populated `points`
// total while having zero visibility into 4PT/Ultra Time at all.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await prisma.game.findUnique({
    where: { id },
    select: { id: true, dataCapability: true, statSource: true, resultSource: true },
  });
  if (!game) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const capability = game.dataCapability as GameDataCapability;
  return NextResponse.json({
    gameId: game.id,
    dataCapability: capability,
    dataCapabilityLabel: GAME_DATA_CAPABILITY_LABEL[capability],
    statSource: game.statSource,
    resultSource: game.resultSource,
    hasEventLedger: hasEventLedger(capability),
    hasUltraStatDerivation: hasUltraStatDerivation(capability),
    hasShotLocation: hasShotLocation(capability),
    hasVisionEnrichment: hasVisionEnrichment(capability),
  });
}
