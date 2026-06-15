import { NextResponse } from "next/server";
import type { ContentType } from "@/generated/prisma/enums";
import { generateContentPayload } from "@/lib/content-engine";

const typeByKind: Record<string, ContentType> = {
  draft: "DRAFT_ANNOUNCEMENT",
  fixture: "FIXTURE_ANNOUNCEMENT",
  match: "RESULT_ANNOUNCEMENT",
  mvp: "MVP_ANNOUNCEMENT",
  standings: "STANDINGS_UPDATE",
  sponsor: "SPONSOR_REPORT",
  "fan-club": "FAN_CLUB_REPORT",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const type = typeByKind[kind];
  if (!type) {
    return NextResponse.json({ error: "Unsupported content type" }, { status: 404 });
  }
  try {
    const payload = await generateContentPayload(type, id);
    return NextResponse.json(payload.graphicData);
  } catch {
    return NextResponse.json({ error: "Content source not found or not ready" }, { status: 404 });
  }
}
