import { Client } from "pg";

const url = process.env.DATABASE_URL.split("?")[0];
const client = new Client({ connectionString: url });
await client.connect();

const coaches = [
  ["cmquqx23j0003t0kkijgdzowq", "Olusegun Imah", "MEN"],
  ["cmqz3knju000mxbkkalt42f1u", "Mcspencer Akpan", "MEN"],
  ["cmr4s69vp00gautkkr00a08dg", "Christopher Ndifon Ekpe", "MEN"],
  ["cmr4sv1ue00ibutkke4ljecin", "Coach David Robinson", "MEN"],
  ["cmrne8kyb005zfekk81y5xb3u", "Afunku Adeyinka", "MEN"],
  ["cmr0nopfd0000utkk0x7cosvw", "Adetokunbo Olaosebikan Ijomah", "WOMEN"],
  ["cmr1p7t08002futkkrhmdwzw0", "Bilqis Adekoya", "WOMEN"],
  ["cmronmkf9008qfekkrejwgv5k", "Udeaja Chioma Priscilla", "WOMEN"],
];

for (const [id, name, division] of coaches) {
  const before = await client.query(`SELECT status, type FROM "Application" WHERE id = $1`, [id]);
  if (before.rows[0]?.status !== "APPROVED" || before.rows[0]?.type !== "COACH") {
    console.log(`SKIP ${name} (${id}): status/type mismatch`, before.rows[0]);
    continue;
  }
  await client.query(
    `UPDATE "Application" SET "coachSeasonZeroSelectionStatus" = 'SEASON_ZERO_SELECTED', "coachSeasonZeroDivision" = $2 WHERE id = $1`,
    [id, division]
  );
  console.log(`SET ${name} (${id}) -> SEASON_ZERO_SELECTED / ${division}`);
}

await client.end();
