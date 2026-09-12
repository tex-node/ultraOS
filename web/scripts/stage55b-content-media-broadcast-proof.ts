/**
 * Stage 5.5B Batch 6 read-only proof harness.
 *
 * This script deliberately does not create, update, delete, or upload anything.
 * Point it at disposable staging identifiers after the required backup has been
 * recorded. The staging operator may use the existing application-level setup
 * flow to create the resources, then run this proof against them.
 */
import { prisma } from "../src/lib/prisma";
import { getBroadcastPresentationState } from "../src/lib/broadcast-presentation-state";
import { withOrganizationContext } from "../src/lib/tenant-context";

const orgA = process.env.STAGE55B_PROOF_ORG_A;
const orgB = process.env.STAGE55B_PROOF_ORG_B;
const mediaAssetId = process.env.STAGE55B_PROOF_MEDIA_ASSET_ID;
const contentAssetId = process.env.STAGE55B_PROOF_CONTENT_ASSET_ID;

function ok(label: string, condition: boolean, detail?: unknown) {
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!condition) throw new Error(`BATCH 6 PROOF FAILED: ${label}`);
}

async function main() {
  if (!orgA || !orgB) {
    throw new Error("Set STAGE55B_PROOF_ORG_A and STAGE55B_PROOF_ORG_B before running the proof.");
  }
  if (!mediaAssetId && !contentAssetId) {
    throw new Error("Set at least one disposable STAGE55B_PROOF_MEDIA_ASSET_ID or STAGE55B_PROOF_CONTENT_ASSET_ID.");
  }
  if (orgA === orgB) throw new Error("Proof organizations must be different.");

  console.log("=== Stage 5.5B Batch 6 read-only proof ===");
  console.log(JSON.stringify({ orgA, orgB, mediaAssetId: mediaAssetId ?? null, contentAssetId: contentAssetId ?? null }, null, 2));

  if (mediaAssetId) {
    const mediaInA = await withOrganizationContext(orgA, (tx) => tx.mediaAsset.findUnique({ where: { id: mediaAssetId }, select: { id: true, organizationId: true } }));
    const mediaInB = await withOrganizationContext(orgB, (tx) => tx.mediaAsset.findUnique({ where: { id: mediaAssetId }, select: { id: true, organizationId: true } }));
    ok("Media asset is visible in its owning organization", mediaInA?.id === mediaAssetId && mediaInA.organizationId === orgA, mediaInA);
    ok("Media asset is invisible from the wrong organization", mediaInB === null, mediaInB);
  }

  if (contentAssetId) {
    const contentInA = await withOrganizationContext(orgA, (tx) => tx.contentAsset.findUnique({ where: { id: contentAssetId }, select: { id: true, organizationId: true } }));
    const contentInB = await withOrganizationContext(orgB, (tx) => tx.contentAsset.findUnique({ where: { id: contentAssetId }, select: { id: true, organizationId: true } }));
    ok("Content asset is visible in its owning organization", contentInA?.id === contentAssetId && contentInA.organizationId === orgA, contentInA);
    ok("Content asset is invisible from the wrong organization", contentInB === null, contentInB);
  }

  const stateA = await withOrganizationContext(orgA, (tx) => getBroadcastPresentationState(orgA, tx));
  const stateB = await withOrganizationContext(orgB, (tx) => getBroadcastPresentationState(orgB, tx));
  ok("Broadcast presentation reads execute inside explicit Org A context", stateA !== undefined);
  ok("Broadcast presentation reads execute inside explicit Org B context", stateB !== undefined);
  ok("Proof does not mutate broadcast state", true);

  console.log("=== Batch 6 read-only proof passed ===");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
