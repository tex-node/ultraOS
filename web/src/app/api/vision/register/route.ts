import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

// Register a video for LOCAL processing (Prompt 5c-iv).
//
// The desktop sidecar returns observations, not files: it needs a `gameVideoId` and an `analysisRunId` to attach them to, and those
// only exist once the server has created a GameVideo and a VisionAnalysisRun. So the page registers first, processes locally, then
// syncs the observations through the agent.
//
// MEDIA ASSET DECISION. `GameVideo.mediaAssetId` is required, and a locally-processed video has no object in R2. Rather than add a
// `GAME_VIDEO_LOCAL` enum value (a schema change and a migration for a placeholder), the row reuses `purpose: GAME_VIDEO` with
// `objectKey: "local://<uuid>"` and `publicUrl: null`. Nothing reads the key for a local video; if a downloader ever tries, the
// `local://` scheme is the flag that there is nothing to fetch.
//
// The upload URL is null by design: the file never leaves the laptop.
export async function POST(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationId = session.user.organizationId;
  if (!organizationId) return NextResponse.json({ error: "no active organization" }, { status: 400 });

  let body: { fixtureId?: string; fileName?: string; fileSize?: number; durationSeconds?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.fixtureId) return NextResponse.json({ error: "fixtureId is required" }, { status: 400 });

  const fixtureId = body.fixtureId;
  const fileName = body.fileName ?? "local-video.mp4";
  const fileSize = Math.max(0, Math.trunc(body.fileSize ?? 0));

  try {
    return await withOrganizationContext(organizationId, async (tx) => {
      // Scoped lookup: a fixture from another organization is invisible under RLS, so this is the tenancy check.
      const fixture = await tx.fixture.findUnique({ where: { id: fixtureId }, select: { id: true } });
      if (!fixture) return NextResponse.json({ error: "fixture not found in this organization" }, { status: 404 });

      const mediaAsset = await tx.mediaAsset.create({
        data: {
          organizationId,
          storageProvider: "LOCAL_PERSISTENT_STORAGE",
          objectKey: `local://${randomUUID()}`,
          publicUrl: null,
          mimeType: fileName.endsWith(".mov") ? "video/quicktime" : "video/mp4",
          byteSize: fileSize,
          checksumSha256: "0".repeat(64),
          purpose: "GAME_VIDEO",
          uploadedById: session.user.id,
        },
        select: { id: true },
      });

      const gameVideo = await tx.gameVideo.create({
        data: {
          organizationId,
          fixtureId,
          mediaAssetId: mediaAsset.id,
          sourceType: "FULL_GAME",
          durationSeconds: body.durationSeconds ? Math.trunc(body.durationSeconds) : null,
          registeredById: session.user.id,
        },
        select: { id: true },
      });

      // One model row per local engine version would be cleaner, but the sidecar does not report its version yet; a stable key keeps
      // the run attributable without inventing a version string.
      const modelKey = "yolov8n-person";
      const existing = await tx.visionModel.findFirst({ where: { organizationId, key: modelKey }, select: { id: true } });
      const visionModel =
        existing ??
        (await tx.visionModel.create({
          data: { organizationId, key: modelKey, version: "local-bundle" },
          select: { id: true },
        }));

      const run = await tx.visionAnalysisRun.create({
        data: {
          organizationId,
          gameVideoId: gameVideo.id,
          visionModelId: visionModel.id,
          requestedById: session.user.id,
        },
        select: { id: true },
      });

      return NextResponse.json({
        gameVideoId: gameVideo.id,
        analysisRunId: run.id,
        // Null on purpose: local processing never uploads the file.
        uploadUrl: null,
      });
    });
  } catch (error) {
    console.error("vision register failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "registration failed" }, { status: 500 });
  }
}
