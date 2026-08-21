import { NextResponse } from "next/server";
import { publicAthleteProfile } from "@/lib/participant-profiles";

export async function GET(_: Request, { params }: { params: Promise<{ ultraAthleteId: string }> }) {
  const { ultraAthleteId } = await params;
  const profile = await publicAthleteProfile(ultraAthleteId);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profile);
}
