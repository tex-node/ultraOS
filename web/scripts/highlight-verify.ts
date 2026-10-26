import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createHighlightForObservation, reviewObservation } from "../src/lib/vision/vision-loader";
import { HIGHLIGHT_WINDOW_SECONDS } from "../src/server/vision/highlights";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Streak v15, Prompt 4 verification: a confirmed observation becomes a playable clip.
//
//   npx tsx scripts/highlight-verify.ts --organization <orgId> --actor <userId> [--keep]
//
// It confirms a real observation from the person clip (300 detections), lets the hook cut the ten seconds around it
// with ffmpeg, then:
//   * probes the produced file with ffprobe (duration, codec, streams) - a file that exists but will not decode is
//     not a clip;
//   * checks the MediaAsset row and its FIXTURE usage link;
//   * renders the match-centre URL and confirms the Highlights section is in the HTML.
const execFileAsync = promisify(execFile);

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: highlight-verify.ts --organization <id> --actor <userId> [--base-url url]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;

async function main() {
  const observation = await withOrganizationContext(ORG, (tx) =>
    tx.visionObservation.findFirst({
      where: { organizationId: ORG, status: { not: "CONFIRMED" }, analysisRun: { status: "COMPLETED" }, videoTimeMs: { gt: 3000 } },
      orderBy: { createdAt: "desc" },
      select: { id: true, videoTimeMs: true, gameVideo: { select: { fixtureId: true, mediaAsset: { select: { publicUrl: true } } } } },
    }),
  );
  if (!observation) throw new Error("no unconfirmed observation with a usable timestamp - run the vision pipeline first");
  console.log(`observation ${observation.id} at ${observation.videoTimeMs} ms · source ${observation.gameVideo.mediaAsset.publicUrl}`);
  console.log(`fixture ${observation.gameVideo.fixtureId}`);

  await withOrganizationContext(ORG, (tx) => reviewObservation(ORG, observation.id, "CONFIRMED", ACTOR_ID, "highlight verification"));
  const created = await createHighlightForObservation(ORG, observation.id, ACTOR_ID);
  console.log(`highlight: ${JSON.stringify(created)}`);
  if (!created.ok) throw new Error(`highlight creation failed: ${created.reason}`);

  const asset = await withOrganizationContext(ORG, (tx) =>
    tx.mediaAsset.findUniqueOrThrow({
      where: { id: created.mediaAssetId! },
      select: { id: true, purpose: true, objectKey: true, publicUrl: true, byteSize: true, mimeType: true, title: true, source: true, usages: { select: { entityType: true, entityId: true } } },
    }),
  );
  const clipPath = (asset.publicUrl ?? "").replace(/^file:\/\//, "");

  // ffprobe is the honest test: a 0-byte or truncated file has a size but no decodable stream.
  let probe = "";
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size,format_name",
      "-show_entries", "stream=codec_name,width,height,nb_frames",
      "-of", "default=noprint_wrappers=1",
      clipPath,
    ]);
    probe = stdout.trim().replace(/\n/g, " · ");
  } catch (error) {
    probe = `ffprobe failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  // The public match centre is addressed by the fixture's public LOCATOR, not its id (v10 learned this: a raw id is a
  // 404). Create a temporary locator when the fixture has none, and remove it afterwards.
  const existing = await withOrganizationContext(ORG, (tx) =>
    tx.publicResourceLocator.findFirst({ where: { organizationId: ORG, resourceType: "FIXTURE", resourceId: observation.gameVideo.fixtureId }, select: { publicKey: true } }),
  );
  const temporaryKey = existing ? null : `highlight-verify-${Date.now()}`;
  if (temporaryKey) {
    await withOrganizationContext(ORG, (tx) =>
      tx.publicResourceLocator.create({
        data: { organizationId: ORG, resourceType: "FIXTURE", publicKey: temporaryKey, resourceId: observation.gameVideo.fixtureId, status: "ACTIVE" },
      }),
    );
  }
  const fixtureUrl = `${BASE_URL}/public/fixtures/${existing?.publicKey ?? temporaryKey}`;
  // The point of streak v16: the stored URL must be one a browser can fetch. A file:// path (v15) played nowhere.
  let urlStatus = 0;
  let urlType = "";
  if (asset.publicUrl && /^https?:/.test(asset.publicUrl)) {
    const head = await fetch(asset.publicUrl, { method: "GET", headers: { range: "bytes=0-1023" } }).catch(() => null);
    urlStatus = head?.status ?? 0;
    urlType = head?.headers.get("content-type") ?? "";
  }

  const page = await fetch(fixtureUrl);
  const html = await page.text();

  console.log("");
  console.log(`asset: ${asset.purpose} · ${asset.mimeType} · ${asset.byteSize} bytes · ${asset.objectKey}`);
  console.log(`linked to: ${asset.usages.map((usage) => `${usage.entityType}:${usage.entityId}`).join(", ")}`);
  console.log(`ffprobe: ${probe}`);
  console.log(`stored URL: ${asset.publicUrl ?? "(none)"} -> ${urlStatus} · ${urlType || "no content-type"}`);
  console.log(`match centre: ${fixtureUrl} -> ${page.status} · "Highlights" present: ${html.includes("Highlights")} · <video> present: ${html.includes("<video")}`);

  const problems: string[] = [];
  if (asset.purpose !== "HIGHLIGHT_CLIP") problems.push(`asset purpose is ${asset.purpose}`);
  if (!asset.usages.some((usage) => usage.entityType === "FIXTURE" && usage.entityId === observation.gameVideo.fixtureId)) problems.push("the clip is not linked to the fixture");
  if (!asset.publicUrl || !/^https?:\/\//.test(asset.publicUrl)) problems.push(`the stored URL is not an HTTP URL (${asset.publicUrl ?? "null"})`);
  if (urlStatus !== 200 && urlStatus !== 206) problems.push(`fetching the stored URL returned ${urlStatus}`);
  if (!probe.includes("codec_name")) problems.push("ffprobe found no decodable stream");
  if (!/duration=[\d.]+/.test(probe)) problems.push("the clip has no duration");
  const duration = Number(/duration=([\d.]+)/.exec(probe)?.[1] ?? 0);
  if (Math.abs(duration - HIGHLIGHT_WINDOW_SECONDS * 2) > 6) problems.push(`clip duration ${duration}s is not close to ${HIGHLIGHT_WINDOW_SECONDS * 2}s`);
  if (page.status !== 200) problems.push(`the match centre returned ${page.status}`);
  if (!html.includes("Highlights")) problems.push("the match centre does not render a Highlights section");
  if (!html.includes("<video")) problems.push("the match centre does not render a video element");

  console.log("");
  console.log(problems.length === 0 ? `PASS: a confirmed observation produced a playable ${duration.toFixed(1)}s clip, linked to the fixture and rendered on the match centre` : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.mediaAssetUsage.deleteMany({ where: { assetId: asset.id } });
      await tx.mediaAsset.delete({ where: { id: asset.id } });
      await tx.visionObservation.update({ where: { id: observation.id }, data: { status: "PENDING" } });
    });
    if (temporaryKey) {
      await withOrganizationContext(ORG, (tx) => tx.publicResourceLocator.deleteMany({ where: { publicKey: temporaryKey } }));
    }
    console.log("cleanup: the clip asset, its links, the temporary locator and the observation status removed (use --keep to inspect)");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
