import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorization";
import { importReportRows, rowsToCsv } from "@/lib/imports";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ importJobId: string }> }) {
  await requirePermission("data:import:report");
  const { importJobId } = await params;
  const job = await prisma.importJob.findUnique({ where: { id: importJobId }, select: { type: true } });
  if (!job) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }
  const csv = rowsToCsv(await importReportRows(importJobId));
  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${job.type.toLowerCase()}-import-${importJobId}-report.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
