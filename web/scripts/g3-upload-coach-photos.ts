import { readFileSync } from "node:fs";
import { MediaAssetPurpose, MediaVisibility } from "../src/generated/prisma/enums";
import { assignPrimaryMediaAsset, uploadMediaAsset } from "../src/lib/media-storage";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const ASSET_DIR = "/opt/ultraleagueos/shared/scripts/track-g3/coaches";

const coaches = [
  { name: "Olusegun Imah", file: "Segun.jpg", type: "jpg", staffId: "cmqurqfhh0001h3kkc6gfa79i" },
  { name: "Adetokunbo Olaosebikan Ijomah", file: "Adetokunbo.jpg", type: "jpg", staffId: "cmr0nqyoz0001utkkchz8uj8p" },
  { name: "Bilqis Adekoya", file: "Titi.jpg", type: "jpg", staffId: "cmr1tyxgt002gutkkor5xxxuh" },
  { name: "Christopher Ndifon Ekpe", file: "Christopher.jpg", type: "jpg", staffId: "cmrh7mw160006c9kkuii9i0dk" },
  { name: "Coach David Robinson", file: "Robinson.jpg", type: "jpg", staffId: "cmrh7meov0003c9kknsj5pq1r" },
  { name: "Afunku Adeyinka", file: "Adyinka.jpg", type: "jpg", staffId: "cmsm34n7w00046jkkm8brqy39" },
  { name: "Udeaja Chioma Priscilla", file: "chioma.jpeg", type: "jpeg", staffId: "cmsm34grj00016jkkthefvewo" },
  { name: "Imomoh Kewwe Blessing", file: "Kewwe.jpeg", type: "jpeg", staffId: "cmsmlv4dp0005o9kke0kxrlnu" },
];

async function main() {
  for (const c of coaches) {
    const bytes = readFileSync(`${ASSET_DIR}/${c.file}`);
    const mime = c.type === "jpg" || c.type === "jpeg" ? "image/jpeg" : "image/png";
    const file = new File([bytes], c.file, { type: mime });
    const asset = await uploadMediaAsset({
      file,
      purpose: MediaAssetPurpose.COACH_PROFILE_PHOTO,
      uploadedById: ACTOR_ID,
      visibility: MediaVisibility.PUBLIC,
      title: `${c.name} coach photo`,
      altText: `${c.name}`,
    });
    await assignPrimaryMediaAsset({ entityId: c.staffId, entityType: "Staff", purpose: MediaAssetPurpose.COACH_PROFILE_PHOTO }, asset.id, ACTOR_ID);
    console.log(`${c.name}: assetId=${asset.id}`);
  }
}

main().finally(() => prisma.$disconnect());
