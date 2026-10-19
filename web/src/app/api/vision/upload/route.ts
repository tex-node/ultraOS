import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { ingestUploadedVideo } from "@/server/vision/ingest-upload";

export const dynamic = "force-dynamic";

// POST /api/vision/upload (streak v8, Prompt 2)
//
// A route handler rather than a server action, for two reasons: a browser can show real progress with
// `fetch` (an action gives only pending/not), and an operator without a browser can reproduce an upload with
// curl - which is also how this was verified on staging.
//
// Auth is the same permission the vision pages use (`vision:manage`); the organization comes from the session,
// never from the form, so a crafted request cannot write into another tenant.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!hasPermission(session.user.roles, "vision:manage")) return NextResponse.json({ error: "You do not have vision:manage." }, { status: 403 });
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form with a file and a fixtureId." }, { status: 400 });
  }

  const file = form.get("file");
  const fixtureId = String(form.get("fixtureId") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a video file." }, { status: 400 });
  if (!fixtureId) return NextResponse.json({ error: "Choose the fixture this video belongs to." }, { status: 400 });

  const result = await ingestUploadedVideo({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    fixtureId,
    file,
    cameraLabel: String(form.get("cameraLabel") ?? "").trim() || undefined,
    sourceType: "PHONE_RECORDING",
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({
    gameVideoId: result.gameVideoId,
    mediaAssetId: result.mediaAssetId,
    duplicate: result.duplicate,
    analysis: result.queued ? { queued: true, runId: result.runId ?? null } : { queued: false, warning: result.warning ?? null },
  });
}
