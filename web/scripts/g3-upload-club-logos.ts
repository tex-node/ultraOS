import { readFileSync } from "node:fs";
import { MediaAssetPurpose, MediaVisibility } from "../src/generated/prisma/enums";
import { assignPrimaryMediaAsset, uploadMediaAsset } from "../src/lib/media-storage";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const ASSET_DIR = "/opt/ultraleagueos/shared/scripts/track-g3/clubs";

const clubs = [
  { code: "APEX", file: "Apex M.png", clubId: "cmqfqpno7000clgkkozvuomx8" },
  { code: "SURGE", file: "Surge M.png", clubId: "cmqfqpnph000olgkkuti0zjnx" },
  { code: "VORTEX", file: "Vortex M.png", clubId: "cmqfqpnl40006lgkktpjc55ci" },
  { code: "FLUX", file: "Flux M.png", clubId: "cmqfqpnou000ilgkkw8pzjn9j" },
  { code: "EMBER", file: "Ember F.png", clubId: "cmqfqpnr60016lgkki03b7gd1" },
  { code: "HALO", file: "Halo F.png", clubId: "cmqfqpnqn0010lgkkjt7kjjnk" },
  { code: "ECLIPSE", file: "Eclipse F.png", clubId: "cmqfqpnrp001clgkkuohxx99t" },
  { code: "NOVA", file: "Nova F.png", clubId: "cmqfqpnq1000ulgkkfwm41ewz" },
];

async function main() {
  for (const c of clubs) {
    const bytes = readFileSync(`${ASSET_DIR}/${c.file}`);
    const file = new File([bytes], c.file, { type: "image/png" });
    const asset = await uploadMediaAsset({
      file,
      purpose: MediaAssetPurpose.CLUB_LOGO,
      uploadedById: ACTOR_ID,
      visibility: MediaVisibility.PUBLIC,
      title: `${c.code} official logo`,
      altText: `${c.code} club logo`,
    });
    await assignPrimaryMediaAsset({ entityId: c.clubId, entityType: "Club", purpose: MediaAssetPurpose.CLUB_LOGO }, asset.id, ACTOR_ID);
    console.log(`${c.code}: assetId=${asset.id} url=${asset.publicUrl}`);
  }
}

main().finally(() => prisma.$disconnect());
