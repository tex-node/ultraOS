import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  MediaAssetPurpose,
  MediaVisibility,
  PublicResourceLocatorType,
} from "../src/generated/prisma/enums";
import { uploadMediaAsset, mediaLocalRoot } from "../src/lib/media-storage";
import {
  locatorMatchesResource,
  resolvePublicResourceLocator,
} from "../src/lib/public-locators";

const baseUrl = process.env.STAGE55A_BASE_URL ?? "http://127.0.0.1:4120";
const runTag = `stage55a-neon-media-${Date.now()}-${randomUUID().slice(0, 8)}`;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type CheckStatus = "PASS" | "FAIL" | "INFO";
type Check = { name: string; status: CheckStatus; details?: unknown };

const checks: Check[] = [];
const cleanupState: { assetId?: string; userId?: string; objectKeys: string[] } = {
  objectKeys: [],
};

function record(name: string, status: CheckStatus, details?: unknown) {
  checks.push({ name, status, details });
}

function assertCheck(name: string, condition: unknown, details?: unknown) {
  record(name, condition ? "PASS" : "FAIL", details);
}

async function withOrg<T>(organizationId: string, fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

async function cleanup(organizationId?: string) {
  if (cleanupState.assetId && organizationId) {
    await withOrg(organizationId, async (tx) => {
      await tx.mediaAssetUsage.deleteMany({ where: { assetId: cleanupState.assetId } });
      await tx.mediaAssetVariant.deleteMany({ where: { assetId: cleanupState.assetId } });
      await tx.auditLog.deleteMany({
        where: { entityType: "MediaAsset", entityId: cleanupState.assetId },
      });
      await tx.mediaAsset.deleteMany({ where: { id: cleanupState.assetId } });
    });
    await prisma.publicResourceLocator.deleteMany({
      where: {
        resourceType: PublicResourceLocatorType.MEDIA_ASSET,
        publicKey: cleanupState.assetId,
      },
    });
  }
  if (cleanupState.userId) {
    await prisma.user.deleteMany({ where: { id: cleanupState.userId } });
  }
  for (const key of cleanupState.objectKeys) {
    await rm(path.join(mediaLocalRoot(), key), { force: true });
  }
}

async function httpStatus(pathname: string) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  return response.status;
}

async function main() {
  const target = await prisma.$queryRaw<Array<{ db: string; usr: string }>>`
    select current_database() as db, current_user as usr
  `;
  record("TARGET_DATABASE", "INFO", target[0]);

  const neon = await prisma.organization.findUnique({
    where: { slug: "neon-ultra" },
    select: { id: true },
  });
  if (!neon) throw new Error("Neon Ultra organization not found");

  await cleanup(neon.id);

  const user = await prisma.user.create({
    data: {
      name: `${runTag} uploader`,
      email: `${runTag}@example.test`,
      role: "SUPER_ADMIN",
    },
  });
  cleanupState.userId = user.id;

  // Valid 1x1 PNG. The upload path validates image signatures and dimensions,
  // writes through the configured media storage provider, creates variants, and
  // inserts the Stage 5.5A media locator in the same transaction.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  const file = new File([png], `${runTag}.png`, { type: "image/png" });

  const asset = await withOrg(neon.id, async (tx) =>
    uploadMediaAsset({
      tx,
      organizationId: neon.id,
      file,
      purpose: MediaAssetPurpose.CONTENT_ASSET,
      uploadedById: user.id,
      visibility: MediaVisibility.PUBLIC,
      title: `${runTag} proof media`,
    }),
  );
  cleanupState.assetId = asset.id;
  cleanupState.objectKeys.push(asset.objectKey);

  const variants = await withOrg(neon.id, (tx) =>
    tx.mediaAssetVariant.findMany({
      where: { assetId: asset.id },
      select: { objectKey: true },
    }),
  );
  cleanupState.objectKeys.push(...variants.map((variant) => variant.objectKey));

  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.MEDIA_ASSET,
    asset.id,
  );
  const reread = locator
    ? await withOrg(locator.organizationId, (tx) =>
        tx.mediaAsset.findUnique({
          where: { id: locator.resourceId },
          select: {
            id: true,
            organizationId: true,
            visibility: true,
            status: true,
            storageProvider: true,
            objectKey: true,
            publicUrl: true,
          },
        }),
      )
    : null;

  assertCheck("LEGACY_NEON_MEDIA_LOCATOR_BOOTSTRAP", locator?.organizationId === neon.id && locator.resourceId === asset.id, locator);
  assertCheck("LEGACY_NEON_MEDIA_AUTHORITATIVE_REREAD", Boolean(locator && locatorMatchesResource(locator, reread)), reread);
  assertCheck("LEGACY_NEON_MEDIA_PUBLIC_VISIBILITY", reread?.visibility === MediaVisibility.PUBLIC && reread.status === "READY", reread);
  assertCheck("LEGACY_NEON_MEDIA_ROUTE_BYTES", (await httpStatus(`/media/assets/${asset.id}/file`)) === 200);

  await cleanup(neon.id);
  const residue = {
    mediaAssets: await withOrg(neon.id, (tx) =>
      tx.mediaAsset.count({ where: { title: `${runTag} proof media` } }),
    ),
    locators: await prisma.publicResourceLocator.count({
      where: { publicKey: asset.id },
    }),
    users: await prisma.user.count({ where: { id: user.id } }),
  };
  assertCheck("MEDIA_PROOF_FIXTURE_RESIDUE_ZERO", Object.values(residue).every((count) => count === 0), residue);

  const summary = {
    runTag,
    checks,
    failed: checks.filter((check) => check.status === "FAIL").length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exit(1);
}

main()
  .catch(async (error) => {
    try {
      const neon = await prisma.organization.findUnique({
        where: { slug: "neon-ultra" },
        select: { id: true },
      });
      await cleanup(neon?.id);
    } catch (cleanupError) {
      record("SCRIPT_CLEANUP_ERROR", "FAIL", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    }
    record("SCRIPT_ERROR", "FAIL", error instanceof Error ? error.message : String(error));
    console.error(JSON.stringify({
      runTag,
      checks,
      failed: checks.filter((check) => check.status === "FAIL").length,
    }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
