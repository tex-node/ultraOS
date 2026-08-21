import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { seasonZeroReadinessReport } from "@/lib/season-zero-readiness";

export async function GET() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.roles, "operations:view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await seasonZeroReadinessReport();
  return NextResponse.json(report);
}
