import { NextResponse } from "next/server";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { importReportRows, rowsToCsv } from "@/lib/imports";
import { withOrganizationContext } from "@/lib/tenant-context";

export async function GET(_request: Request, { params }: { params: Promise<{ importJobId: string }> }) {
  const { organizationId } = await requirePermissionWithOrganization("data:import:report");
  const { importJobId } = await params;
  const job = await withOrganizationContext(organizationId, (tx) => tx.importJob.findUnique({ where: { id: importJobId }, select: { type: true } }));
  if (!job) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }
  const csv = rowsToCsv(await importReportRows(organizationId, importJobId));
  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${job.type.toLowerCase()}-import-${importJobId}-report.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
