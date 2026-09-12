import { NextResponse } from "next/server";
import type { ContentType } from "@/generated/prisma/enums";
import { generateClubBrandPayload, generateCoachPresentationPayload, generateContentPayload } from "@/lib/content-engine";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

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
  const organization = await resolveDefaultPublicOrganization();
  if (kind === "club") {
    try {
      const payload = await withOrganizationContext(organization.id, (tx) => generateClubBrandPayload(id, tx));
      return NextResponse.json(payload.graphicData);
    } catch {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }
  }
  if (kind === "coach") {
    try {
      const payload = await withOrganizationContext(organization.id, (tx) => generateCoachPresentationPayload(id, tx));
      return NextResponse.json(payload.graphicData);
    } catch {
      return NextResponse.json({ error: "Coach pool entry not found" }, { status: 404 });
    }
  }
  const type = typeByKind[kind];
  if (!type) {
    return NextResponse.json({ error: "Unsupported content type" }, { status: 404 });
  }
  try {
    const payload = await withOrganizationContext(organization.id, (tx) => generateContentPayload(type, id, tx));
    return NextResponse.json(payload.graphicData);
  } catch {
    return NextResponse.json({ error: "Content source not found or not ready" }, { status: 404 });
  }
}
