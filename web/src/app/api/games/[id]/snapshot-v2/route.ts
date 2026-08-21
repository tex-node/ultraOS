import { NextResponse } from "next/server";
import { buildLiveGameSnapshotV2 } from "@/lib/live-game-snapshot-v2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, read-only Live Snapshot V2 (G.17, Part X/XXI). Stable data contract for OBS/vMix/
// browser graphics/LED displays/a future mobile app - see
// documentation/broadcast/BROADCAST_GRAPHICS_DATA_CONTRACT.md for the documented field list.
// Never exposes operator identity beyond a user id already public elsewhere (statisticsVerifiedById),
// no PII, no internal correction reasons. Composes the same domain primitives every other G.16/
// G.17 surface uses - never a second independent computation of the same numbers.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const snapshot = await buildLiveGameSnapshotV2(id);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
