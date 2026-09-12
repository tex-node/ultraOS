import { NextRequest, NextResponse } from "next/server";
import { publicDraftEventState } from "@/lib/draft-events";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export async function GET(request: NextRequest, { params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? undefined;
  const organization = await resolveDefaultPublicOrganization();
  const state = await withOrganizationContext(organization.id, (tx) => publicDraftEventState(draftEventId, token, tx));
  if (!state) return NextResponse.json({ error: "Draft event not found." }, { status: 404 });
  return NextResponse.json(state);
}
