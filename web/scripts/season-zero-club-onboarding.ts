import "dotenv/config";
import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { MediaAssetPurpose, MediaVisibility } from "../src/generated/prisma/enums";
import { assignPrimaryMediaAsset, detectImageType, uploadMediaAsset } from "../src/lib/media-storage";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

type ClubSpec = {
  name: string;
  shortName: string;
  divisionName: string;
  logoFile: string;
  checksumSha256: string;
  byteSize: number;
  officialSlogan: string;
  crowdChant: string;
  identityKeywords: string[];
};

const LOGO_DIR = process.env.SEASON_ZERO_CLUB_LOGO_DIR ?? "/opt/ultraos-staging/shared/imports/clubs";

const CLUBS: ClubSpec[] = [
  {
    name: "Apex",
    shortName: "APEX",
    divisionName: "Men's Division",
    logoFile: "Apex M.png",
    checksumSha256: "abbf1a01522e307b9506e73e25dc90d0c324cf175ee0ba98c9a434d6c28683b4",
    byteSize: 2188954,
    officialSlogan: "RISE ABOVE.",
    crowdChant: "TO THE TOP!",
    identityKeywords: ["Ambition", "dominance", "elevation"],
  },
  {
    name: "Surge",
    shortName: "SURGE",
    divisionName: "Men's Division",
    logoFile: "Surge M.png",
    checksumSha256: "44df03bae2d3856f7dadb9c693f559b117d4ba6f7eacbd714a2f2089ada115b5",
    byteSize: 897051,
    officialSlogan: "FLOW WITH FORCE.",
    crowdChant: "FEEL THE SURGE!",
    identityKeywords: ["Momentum", "pressure", "speed"],
  },
  {
    name: "Vortex",
    shortName: "VORTEX",
    divisionName: "Men's Division",
    logoFile: "Vortex M.png",
    checksumSha256: "ad675f0cc7be255b40650e869f3a1f24ce4a468d631f124d125bff9c6eb3b9af",
    byteSize: 2190669,
    officialSlogan: "CONTROL THE CHAOS.",
    crowdChant: "IN THE VORTEX!",
    identityKeywords: ["Pressure", "intensity", "disruption"],
  },
  {
    name: "Flux",
    shortName: "FLUX",
    divisionName: "Men's Division",
    logoFile: "Flux M.png",
    checksumSha256: "f52280a93b927e891bd569ddec22cdb80ff64a7ae145c0db5b20259275ca5a83",
    byteSize: 2264062,
    officialSlogan: "CHANGE THE GAME.",
    crowdChant: "SHIFT THE GAME!",
    identityKeywords: ["Adaptability", "movement", "innovation"],
  },
  {
    name: "Ember",
    shortName: "EMBER",
    divisionName: "Women's Division",
    logoFile: "Ember F.png",
    checksumSha256: "0dbed3f48fbb39ab119340ab8924eda7dc5ca9e1dcdc2b228c52918063523299",
    byteSize: 687939,
    officialSlogan: "START THE FIRE.",
    crowdChant: "BURN BRIGHT!",
    identityKeywords: ["Heat", "passion", "spark"],
  },
  {
    name: "Halo",
    shortName: "HALO",
    divisionName: "Women's Division",
    logoFile: "Halo F.png",
    checksumSha256: "0a09633ef50fc2a41219dc1406d6fae9b8b22a8cc12babd80caf9fb9c11b9d81",
    byteSize: 2320412,
    officialSlogan: "PLAY ABOVE.",
    crowdChant: "HALO RISE!",
    identityKeywords: ["Grace", "precision", "light"],
  },
  {
    name: "Eclipse",
    shortName: "ECLIPSE",
    divisionName: "Women's Division",
    logoFile: "Eclipse F.png",
    checksumSha256: "2ad948c263b15e4f2f592dec61b2c5da83692ff9470af9a50b01149e0a5fe66f",
    byteSize: 2204880,
    officialSlogan: "BLOCK OUT THE NOISE.",
    crowdChant: "TOTAL ECLIPSE!",
    identityKeywords: ["Focus", "defence", "composure"],
  },
  {
    name: "Nova",
    shortName: "NOVA",
    divisionName: "Women's Division",
    logoFile: "Nova F.png",
    checksumSha256: "36de71418dc8c4532089bdfb7f83ee6380a5b36e215aa431b26a3e3f56d5712a",
    byteSize: 1025115,
    officialSlogan: "BORN TO BURST.",
    crowdChant: "GO NOVA!",
    identityKeywords: ["Explosion", "youth", "energy"],
  },
];

function requireApply() {
  if (!process.argv.includes("--apply")) {
    throw new Error("Refusing to write without --apply.");
  }
}

async function readValidatedLogo(spec: ClubSpec) {
  const filePath = path.join(LOGO_DIR, spec.logoFile);
  const [bytes, stats] = await Promise.all([readFile(filePath), stat(filePath)]);
  const checksumSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const mimeType = detectImageType(bytes);

  if (stats.size !== spec.byteSize) {
    throw new Error(`${spec.logoFile} size mismatch. Expected ${spec.byteSize}, got ${stats.size}.`);
  }
  if (checksumSha256 !== spec.checksumSha256) {
    throw new Error(`${spec.logoFile} checksum mismatch. Expected ${spec.checksumSha256}, got ${checksumSha256}.`);
  }
  if (mimeType !== "image/png") {
    throw new Error(`${spec.logoFile} invalid MIME/signature. Expected image/png, got ${mimeType ?? "unknown"}.`);
  }

  return { bytes, checksumSha256, filePath, mimeType };
}

async function findAdminUserId() {
  const preferred = await prisma.user.findFirst({
    where: {
      email: "texdevices@gmail.com",
      roles: { some: { role: "SUPER_ADMIN", revokedAt: null } },
    },
    select: { id: true, email: true },
  });

  if (preferred) return preferred.id;

  const fallback = await prisma.user.findFirst({
    where: { roles: { some: { role: "SUPER_ADMIN", revokedAt: null } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  if (!fallback) throw new Error("No active SUPER_ADMIN user found for audited media ingestion.");
  return fallback.id;
}

async function getSeasonZeroScope() {
  const season = await prisma.season.findFirst({
    where: { name: "Season Zero 2026" },
    include: {
      competition: { include: { sport: true, divisions: true } },
    },
  });

  if (!season) throw new Error("Season Zero 2026 was not found.");

  const divisions = new Map(season.competition.divisions.map((division) => [division.name, division.id]));
  for (const divisionName of ["Men's Division", "Women's Division"]) {
    if (!divisions.has(divisionName)) throw new Error(`${divisionName} was not found in Season Zero competition.`);
  }

  return {
    organizationId: season.organizationId,
    sportId: season.competition.sportId,
    seasonId: season.id,
    divisions,
  };
}

async function ensureClubLogo(spec: ClubSpec, clubId: string, userId: string, organizationId: string) {
  const logo = await readValidatedLogo(spec);
  const existingUsage = await prisma.mediaAssetUsage.findFirst({
    where: {
      active: true,
      entityId: clubId,
      entityType: "Club",
      isPrimary: true,
      purpose: MediaAssetPurpose.CLUB_LOGO,
      asset: { checksumSha256: logo.checksumSha256, purpose: MediaAssetPurpose.CLUB_LOGO },
    },
    include: { asset: true },
  });

  if (existingUsage) {
    return { mediaAssetId: existingUsage.assetId, logoUrl: existingUsage.asset.publicUrl ?? `/media/assets/${existingUsage.assetId}/file`, reused: true };
  }

  const file = new File([logo.bytes], spec.logoFile, { type: logo.mimeType });
  return withOrganizationContext(organizationId, async (tx) => {
    const asset = await uploadMediaAsset({
      tx,
      organizationId,
      altText: `${spec.name} official Season Zero club logo`,
      file,
      purpose: MediaAssetPurpose.CLUB_LOGO,
      title: `${spec.name} official logo`,
      uploadedById: userId,
      visibility: MediaVisibility.PUBLIC,
    });
    await assignPrimaryMediaAsset(
      tx,
      organizationId,
      { entityId: clubId, entityType: "Club", purpose: MediaAssetPurpose.CLUB_LOGO },
      asset.id,
      userId,
    );
    return { mediaAssetId: asset.id, logoUrl: asset.publicUrl ?? `/media/assets/${asset.id}/file`, reused: false };
  });
}

async function main() {
  requireApply();
  const userId = await findAdminUserId();
  const scope = await getSeasonZeroScope();
  const results = [];

  for (const spec of CLUBS) {
    await readValidatedLogo(spec);
  }

  for (const spec of CLUBS) {
    const divisionId = scope.divisions.get(spec.divisionName);
    if (!divisionId) throw new Error(`${spec.divisionName} was not found.`);

    const club = await prisma.club.upsert({
      where: { organizationId_shortName: { organizationId: scope.organizationId, shortName: spec.shortName } },
      create: {
        organizationId: scope.organizationId,
        brandingStatus: "BRANDING_INCOMPLETE",
        crowdChant: spec.crowdChant,
        identityKeywords: spec.identityKeywords,
        name: spec.name,
        officialSlogan: spec.officialSlogan,
        primaryColor: null,
        secondaryColor: null,
        shortName: spec.shortName,
        sportId: scope.sportId,
        status: "ACTIVE",
      },
      update: {
        brandingStatus: "BRANDING_INCOMPLETE",
        crowdChant: spec.crowdChant,
        identityKeywords: spec.identityKeywords,
        name: spec.name,
        officialSlogan: spec.officialSlogan,
        primaryColor: null,
        secondaryColor: null,
        status: "ACTIVE",
      },
    });

    const seasonClub = await prisma.seasonClub!.upsert({
      where: {
        seasonId_clubId_divisionId: {
          clubId: club.id,
          divisionId,
          seasonId: scope.seasonId,
        },
      },
      create: {
        clubId: club.id,
        divisionId,
        seasonId: scope.seasonId,
        status: "ACTIVE",
      },
      update: { status: "ACTIVE" },
    });

    await prisma.standing.upsert({
      where: { seasonClubId: seasonClub.id },
      create: { seasonClubId: seasonClub.id, seasonId: scope.seasonId },
      update: { seasonId: scope.seasonId },
    });

    const logo = await ensureClubLogo(spec, club.id, userId, scope.organizationId);
    results.push({ ...spec, clubId: club.id, seasonClubId: seasonClub.id, ...logo });
  }

  const counts = {
    clubs: await prisma.club.count({ where: { sportId: scope.sportId } }),
    clubLogos: await prisma.mediaAsset.count({ where: { purpose: MediaAssetPurpose.CLUB_LOGO, status: "READY" } }),
    menSeasonClubs: await prisma.seasonClub!.count({
      where: { seasonId: scope.seasonId, division: { name: "Men's Division" }, status: "ACTIVE" },
    }),
    seasonClubs: await prisma.seasonClub!.count({ where: { seasonId: scope.seasonId, status: "ACTIVE" } }),
    womenSeasonClubs: await prisma.seasonClub!.count({
      where: { seasonId: scope.seasonId, division: { name: "Women's Division" }, status: "ACTIVE" },
    }),
  };

  console.log(JSON.stringify({ counts, logoDir: LOGO_DIR, results }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
