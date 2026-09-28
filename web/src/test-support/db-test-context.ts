// Per-suite Postgres schema isolation for DB-integration tests (A3b, Point 5 of
// docs/canonical-write-audit.md's sketch). Prisma Client binds to a connection string at
// construction and can't be rebound - so isolation means: create a fresh schema, push the current
// schema.prisma shape into it, build a Prisma Client scoped to that schema, and drop the schema
// when the suite is done. One context per test file/suite (not per test) - `db push` against a
// fresh schema takes real time, so provisioning it once and reusing the client across a file's
// tests is the intended usage.
//
// Spiked, not assumed: a client built from `new PrismaPg({ connectionString })` alone - the
// pattern this codebase's own src/lib/prisma.ts uses, and the pattern every `?schema=public` in
// every DATABASE_URL implies - does NOT scope to that schema. @prisma/adapter-pg's runtime client
// ignores a `?schema=` query-string parameter entirely (that convention belonged to the legacy
// query-engine binary this project no longer uses); a client built that way silently falls back to
// the connecting role's default search_path (`public`) and, in a first attempt at this harness,
// collided with real production-mirrored data sitting in staging's `public` schema. The schema
// must be passed as PrismaPg's explicit second-argument `{ schema }` option instead - see below.
//
// Requires DATABASE_URL to point at a real, reachable Postgres server the test runner's role can
// CREATE SCHEMA / DROP SCHEMA on - the same server the app itself uses is fine, since each test
// gets its own schema, not its own database. Throws early and clearly if DATABASE_URL is missing
// or a placeholder, rather than failing confusingly mid-provision.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export interface TestDbContext {
  prisma: PrismaClient;
  schemaName: string;
  teardown: () => Promise<void>;
}

function scopedConnectionString(baseUrl: string, schemaName: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

export async function createTestDbContext(): Promise<TestDbContext> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. DB-integration tests need a real, reachable Postgres server - set it before running this suite.",
    );
  }

  // A random, valid-identifier schema name - collision-proof enough for test isolation without
  // needing a lock or a registry of names in use.
  const schemaName = `test_${randomUUID().replace(/-/g, "")}`;

  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
  } finally {
    await admin.end();
  }

  const scopedUrl = scopedConnectionString(baseUrl, schemaName);

  // `db push` (not `migrate deploy`): tests want the CURRENT schema.prisma shape quickly, into an
  // empty schema, without replaying the full historical migration chain. Schema-diff based, so it
  // introspects the (empty) target schema and creates every table/column/enum in one pass.
  // prisma.config.ts reads its datasource URL from process.env.DATABASE_URL, so overriding it for
  // this child process is enough - no --url flag needed (and this Prisma version's `db push` has
  // no --skip-generate flag; the Prisma Client used here is already generated).
  execFileSync(
    "npx",
    ["prisma", "db", "push", "--accept-data-loss"],
    { env: { ...process.env, DATABASE_URL: scopedUrl }, stdio: "pipe" },
  );

  // @prisma/adapter-pg's runtime client does NOT honor a `?schema=` query-string parameter the
  // way the legacy query-engine binary did - confirmed by spike (a client built with only the
  // connection string silently fell back to the role's default search_path, `public`, and
  // collided with real data there). The schema must be passed as this explicit second-argument
  // option instead; the connection string only carries host/credentials/database.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: scopedUrl }, { schema: schemaName }) });

  // Self-check: fail here, clearly, if the client ever silently resolves to the wrong schema
  // again (a config regression, a future Prisma version change) - not confusingly, deep inside
  // whatever the first real query in a test happens to be. Deliberately does NOT check
  // `SELECT current_schema()` - that reflects the connection's search_path, which raw SQL uses,
  // not the schema-qualification PrismaPg's `{ schema }` option applies to its OWN generated model
  // queries (confirmed by spike: current_schema() still reported "public" even once model queries
  // were correctly isolated). A model-layer query is the only way to check what a model-layer
  // query will actually see.
  const rowCount = await prisma.organization.count();
  if (rowCount !== 0) {
    await prisma.$disconnect();
    throw new Error(
      `Test DB context for schema "${schemaName}" sees ${rowCount} pre-existing Organization row(s) - isolation is broken (likely resolved to a shared schema instead of this fresh one).`,
    );
  }

  return {
    prisma,
    schemaName,
    teardown: async () => {
      await prisma.$disconnect();
      const cleanupAdmin = new Client({ connectionString: baseUrl });
      await cleanupAdmin.connect();
      try {
        await cleanupAdmin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      } finally {
        await cleanupAdmin.end();
      }
    },
  };
}
