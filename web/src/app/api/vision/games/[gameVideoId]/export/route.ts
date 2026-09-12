import { NextResponse } from "next/server";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { buildEvaluationDatasetExport, datasetExportToJsonl } from "@/lib/vision/vision-loader";

export const dynamic = "force-dynamic";

// G.22 Part LXV. Internal, authenticated evaluation dataset export - JSONL, public-safe fields
// only (see vision-loader.ts's buildEvaluationDatasetExport doc comment for exactly what is and
// isn't included). Never public - requires vision:manage, same as every other vision route.
export async function GET(request: Request, { params }: { params: Promise<{ gameVideoId: string }> }) {
  let organizationId: string;
  try {
    ({ organizationId } = await requirePermissionWithOrganization("vision:manage"));
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "vision:manage permission required." } }, { status: 401 });
  }
  const { gameVideoId } = await params;
  const rows = await buildEvaluationDatasetExport(organizationId, gameVideoId);
  return new NextResponse(datasetExportToJsonl(rows), {
    headers: { "Content-Type": "application/jsonl", "Content-Disposition": `attachment; filename="vision-dataset-${gameVideoId}.jsonl"` },
  });
}
