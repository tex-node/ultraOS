import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { seasonZeroReadinessReport } from "@/lib/season-zero-readiness";
import { withOrganizationContext } from "@/lib/tenant-context";

export async function GET() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.roles, "operations:view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.organizationId) {
    return NextResponse.json({ error: "Organization context required" }, { status: 403 });
  }
  const report = await withOrganizationContext(session.user.organizationId, (tx) => seasonZeroReadinessReport(tx));
  return NextResponse.json(report);
}
