import assert from "node:assert/strict";
import test from "node:test";
import { ImportType } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let importsModule: typeof import("@/lib/imports") | null = null;

async function loadImports() {
  importsModule ??= await import("@/lib/imports");
  return importsModule;
}

test("parseCsv handles quoted values and UTF-8 BOM", async () => {
  const imports = await loadImports();
  const parsed = imports.parseCsv('\uFEFFfirstName,lastName,email\n"Jane, A.",Doe,jane@example.com\n');
  assert.deepEqual(parsed.headers, ["firstName", "lastName", "email"]);
  assert.equal(parsed.rows[0].firstName, "Jane, A.");
  assert.equal(parsed.rows[0].email, "jane@example.com");
});

test("parseCsv rejects empty files and unterminated quotes", async () => {
  const imports = await loadImports();
  assert.throws(() => imports.parseCsv("   "), /empty/);
  assert.throws(() => imports.parseCsv('firstName\n"Jane'), /unterminated/);
});

test("validateHeaders rejects missing or extra headers", async () => {
  const imports = await loadImports();
  assert.doesNotThrow(() => imports.validateHeaders(ImportType.PLAYER, imports.importTemplates.PLAYER));
  assert.throws(
    () => imports.validateHeaders(ImportType.PLAYER, ["firstName", "lastName"]),
    /Invalid player CSV headers/,
  );
  assert.throws(
    () => imports.validateHeaders(ImportType.CLUB, [...imports.importTemplates.CLUB, "password"]),
    /Extra: password/,
  );
});

test("csvTemplate returns exact template headers", async () => {
  const imports = await loadImports();
  assert.equal(imports.csvTemplate(ImportType.COACH), `${imports.importTemplates.COACH.join(",")}\r\n`);
});

test("CSV exports protect against formula injection", async () => {
  const imports = await loadImports();
  assert.equal(imports.csvCell("=SUM(1,1)"), '"\'=SUM(1,1)"');
  assert.equal(imports.csvCell("@handle"), '"\'@handle"');
  assert.equal(
    imports.rowsToCsv([["name", "value"], ["Jane", "-1"]]),
    '"name","value"\r\n"Jane","\'-1"',
  );
});

test("import permissions are restricted to operators and super admins", () => {
  assert.equal(hasPermission(["SUPER_ADMIN"], "data:import:players"), true);
  assert.equal(hasPermission(["LEAGUE_OPERATOR"], "data:import:clubs"), true);
  assert.equal(hasPermission(["TEAM_MANAGER"], "data:import"), false);
  assert.equal(hasPermission(["COACH"], "data:import:coaches"), false);
  assert.equal(hasPermission(["FAN"], "data:import"), false);
});
