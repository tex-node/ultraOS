import { NextRequest, NextResponse } from "next/server";
import { publicDraftEventState } from "@/lib/draft-events";

export async function GET(request: NextRequest, { params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? undefined;
  const state = await publicDraftEventState(draftEventId, token);
  if (!state) return NextResponse.json({ error: "Draft event not found." }, { status: 404 });
  return NextResponse.json(state);
}
