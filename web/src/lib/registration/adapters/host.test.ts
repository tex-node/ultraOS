import assert from "node:assert/strict";
import test from "node:test";

// Placeholder so importing the adapter (which loads the Prisma client at module
// scope) does not throw. Set before the adapter is imported dynamically; no
// connection is opened.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

const HOST_METHODS = ["getEvent", "getRegistrationConfig", "saveRegistrationSubmission", "listSubmissions", "getSubmission"] as const;

test("getRegistrationHost always returns the database-backed Ultra League OS adapter", async () => {
  const { getRegistrationHost } = await import("./index");
  const { UltraLeagueOsRegistrationHost } = await import("./ultra-league-os");
  assert.ok(getRegistrationHost() instanceof UltraLeagueOsRegistrationHost);
});

test("Ultra League OS adapter exposes the full RegistrationHost surface", async () => {
  const { UltraLeagueOsRegistrationHost } = await import("./ultra-league-os");
  const adapter = new UltraLeagueOsRegistrationHost() as unknown as Record<string, unknown>;
  for (const method of HOST_METHODS) {
    assert.equal(typeof adapter[method], "function", `missing ${method}`);
  }
});
