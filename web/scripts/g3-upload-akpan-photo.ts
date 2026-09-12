import { readFileSync } from "node:fs";
import { MediaAssetPurpose, MediaVisibility } from "../src/generated/prisma/enums";
import { assignPrimaryMediaAsset, uploadMediaAsset } from "../src/lib/media-storage";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const STAFF_ID = "cmr0m6h8h0000z7kkfov56yoa"; // Mcspencer Akpan
const ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro"; // Neon Ultra Basketball League

async function main() {
  const bytes = readFileSync("/opt/ultraleagueos/shared/scripts/track-g3/coaches/McSpencer.jpeg");
  const file = new File([bytes], "McSpencer.jpeg", { type: "image/jpeg" });
  await withOrganizationContext(ORGANIZATION_ID, async (tx) => {
    const asset = await uploadMediaAsset({
      tx,
      organizationId: ORGANIZATION_ID,
      file,
      purpose: MediaAssetPurpose.COACH_PROFILE_PHOTO,
      uploadedById: ACTOR_ID,
      visibility: MediaVisibility.PUBLIC,
      title: "Mcspencer Akpan coach photo",
      altText: "Mcspencer Akpan",
    });
    await assignPrimaryMediaAsset(tx, ORGANIZATION_ID, { entityId: STAFF_ID, entityType: "Staff", purpose: MediaAssetPurpose.COACH_PROFILE_PHOTO }, asset.id, ACTOR_ID);
    console.log(`Mcspencer Akpan: assetId=${asset.id}`);
  });
}

main().finally(() => prisma.$disconnect());
