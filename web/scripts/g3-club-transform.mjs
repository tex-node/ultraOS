import { Client } from "pg";

const url = process.env.DATABASE_URL.split("?")[0];
const client = new Client({ connectionString: url });
await client.connect();

const APPLY = process.argv.includes("--apply");
const WOMENS_DIVISION_ID = "cmqfqpnkl0004lgkkk2bjeqfm";

const demoPlayerIds = [
  "cmqfqpno1000blgkkyjuslkcg","cmqfqpnor000hlgkkyvoaae6b","cmqfqpnpe000nlgkk2g6j3fjs","cmqfqpnpy000tlgkk25eubzru",
  "cmqfqpnqk000zlgkkc8u2f0pg","cmqfqpnr40015lgkkxj6za2dh","cmqfqpnrm001blgkkf33o97r8","cmqfqpns5001hlgkkd6nbqp7n",
];
const demoFixtureIds = ["cmqfqpnuq001ylgkktpehz4rz", "cmqfqpnuq001zlgkk50pu6lsc", "seed-fixture-content-showcase"];

const clubs = [
  { id: "cmqfqpno7000clgkkozvuomx8", code: "APX", name: "Apex", shortName: "APEX", division: null, slogan: "RISE ABOVE.", chant: "TO THE TOP!", identity: ["Ambition", "dominance", "elevation"] },
  { id: "cmqfqpnph000olgkkuti0zjnx", code: "SRG", name: "Surge", shortName: "SURGE", division: null, slogan: "BRING THE ENERGY.", chant: "FEEL THE SURGE!", identity: ["Explosive", "relentless", "electric"] },
  { id: "cmqfqpnl40006lgkktpjc55ci", code: "VTX", name: "Vortex", shortName: "VORTEX", division: null, slogan: "PULL THEM IN.", chant: "ENTER THE VORTEX!", identity: ["Pressure", "intensity", "controlled chaos"] },
  { id: "cmqfqpnou000ilgkkw8pzjn9j", code: "FLX", name: "Flux", shortName: "FLUX", division: null, slogan: "CHANGE THE GAME.", chant: "SHIFT THE GAME!", identity: ["Adaptability", "unpredictability", "movement"] },
  { id: "cmqfqpnr60016lgkki03b7gd1", code: "EMB", name: "Ember", shortName: "EMBER", division: WOMENS_DIVISION_ID, slogan: "BURN BRIGHTER.", chant: "LIGHT IT UP!", identity: ["Fire", "resilience", "intensity"] },
  { id: "cmqfqpnqn0010lgkkjt7kjjnk", code: "HLO", name: "Halo", shortName: "HALO", division: WOMENS_DIVISION_ID, slogan: "OWN THE LIGHT.", chant: "SHINE ON!", identity: ["Confidence", "presence", "elevation"] },
  { id: "cmqfqpnrp001clgkkuohxx99t", code: "ECL", name: "Eclipse", shortName: "ECLIPSE", division: WOMENS_DIVISION_ID, slogan: "BLOCK OUT THE NOISE.", chant: "LIGHTS OUT!", identity: ["Focus", "intimidation", "composure"] },
  { id: "cmqfqpnq1000ulgkkfwm41ewz", code: "NVA", name: "Nova", shortName: "NOVA", division: WOMENS_DIVISION_ID, slogan: "BORN TO EXPLODE.", chant: "GO NOVA!", identity: ["Star power", "emergence", "explosive energy"] },
];
const seasonClubByClub = {
  cmqfqpno7000clgkkozvuomx8: "cmqfqpnod000dlgkku9sqb9nm",
  cmqfqpnph000olgkkuti0zjnx: "cmqfqpnpm000plgkk6fofe078",
  cmqfqpnl40006lgkktpjc55ci: "cmqfqpnm20007lgkk0nfwj431",
  cmqfqpnou000ilgkkw8pzjn9j: "cmqfqpnoz000jlgkkv1i612md",
  cmqfqpnr60016lgkki03b7gd1: "cmqfqpnrb0017lgkkm9i40f6u",
  cmqfqpnqn0010lgkkjt7kjjnk: "cmqfqpnqs0011lgkkg2pvftnj",
  cmqfqpnrp001clgkkuohxx99t: "cmqfqpnrt001dlgkkskzah895",
  cmqfqpnq1000ulgkkfwm41ewz: "cmqfqpnq6000vlgkk3tyi7n08",
};

console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN ===");

console.log("\n-- Step 1: detach 8 demo Player.seasonClubId --");
if (APPLY) {
  const r = await client.query(`UPDATE "Player" SET "seasonClubId" = NULL WHERE id = ANY($1::text[])`, [demoPlayerIds]);
  console.log(`Detached ${r.rowCount} players`);
} else {
  console.log(`Would detach ${demoPlayerIds.length} players`);
}

console.log("\n-- Step 2: delete 3 demo Fixtures (cascades Game/FixtureOfficial) --");
if (APPLY) {
  const r = await client.query(`DELETE FROM "Fixture" WHERE id = ANY($1::text[])`, [demoFixtureIds]);
  console.log(`Deleted ${r.rowCount} fixtures`);
} else {
  console.log(`Would delete ${demoFixtureIds.length} fixtures`);
}

console.log("\n-- Step 3: delete 8 demo Standings --");
if (APPLY) {
  const r = await client.query(`DELETE FROM "Standing" WHERE "seasonClubId" = ANY($1::text[])`, [Object.values(seasonClubByClub)]);
  console.log(`Deleted ${r.rowCount} standings`);
} else {
  console.log(`Would delete standings for ${Object.values(seasonClubByClub).length} season clubs`);
}

console.log("\n-- Step 4+5: rename clubs, set brand metadata, correct division --");
for (const c of clubs) {
  if (APPLY) {
    await client.query(
      `UPDATE "Club" SET name=$2, "shortName"=$3, "officialSlogan"=$4, "crowdChant"=$5, "identityKeywords"=$6, "brandingStatus"='IDENTITY_READY' WHERE id=$1`,
      [c.id, c.name, c.shortName, c.slogan, c.chant, c.identity]
    );
    if (c.division) {
      await client.query(`UPDATE "SeasonClub" SET "divisionId"=$2 WHERE id=$1`, [seasonClubByClub[c.id], c.division]);
    }
    console.log(`Updated ${c.code} -> ${c.shortName}${c.division ? " (division -> WOMEN)" : ""}`);
  } else {
    console.log(`Would update ${c.code} -> ${c.shortName}${c.division ? " (division -> WOMEN)" : ""}`);
  }
}

await client.end();
