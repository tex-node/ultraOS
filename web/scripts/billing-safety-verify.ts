import { deploymentScope, bachsKeyKind, billingSafetyWarning } from "../src/lib/deployment-safety";

// Streak v20, Prompt 2 verification: the live-key warning logic, exercised against this process's real environment.
//
//   npx tsx scripts/billing-safety-verify.ts [--base-url http://127.0.0.1:4120]
//
// The HTTP half (does the banner actually RENDER for a signed-in operator) is done by the deploy script; this proves the
// decision: a live key outside production must warn, a live key IN production must not, and the scope detection must
// not depend on NODE_ENV - which is "production" on staging too, and was the reason a naive check would never fire.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
void arg;

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const scenarios: { name: string; env: Record<string, string | undefined>; expectWarning: boolean }[] = [
  { name: "staging (loopback AUTH_URL) + live key", env: { APP_ENV: undefined, AUTH_URL: "http://127.0.0.1:4120", BACHS_KEY: "sk_live_abc", BACH_IO: undefined, NODE_ENV: "production" }, expectWarning: true },
  { name: "staging (APP_ENV=staging) + live key", env: { APP_ENV: "staging", AUTH_URL: "https://staging.example", BACHS_KEY: "sk_live_abc", BACH_IO: undefined, NODE_ENV: "production" }, expectWarning: true },
  { name: "production + live key", env: { APP_ENV: "production", AUTH_URL: "https://app.neonultra.ng", BACHS_KEY: "sk_live_abc", BACH_IO: undefined, NODE_ENV: "production" }, expectWarning: false },
  { name: "staging + sandbox key", env: { APP_ENV: "staging", BACHS_KEY: "sk_sandbox_abc", BACH_IO: undefined, NODE_ENV: "production" }, expectWarning: false },
  { name: "staging + no key", env: { APP_ENV: "staging", BACHS_KEY: undefined, BACH_IO: undefined, NODE_ENV: "production" }, expectWarning: false },
  { name: "legacy BACH_IO live on a loopback host", env: { APP_ENV: undefined, AUTH_URL: "http://127.0.0.1:4120", BACHS_KEY: undefined, BACH_IO: "sk_live_legacy", NODE_ENV: "production" }, expectWarning: true },
  { name: "NODE_ENV alone must NOT mark loopback as production", env: { APP_ENV: undefined, AUTH_URL: "http://127.0.0.1:4120", BACHS_KEY: "sk_live_abc", BACH_IO: undefined, NODE_ENV: "production" }, expectWarning: true },
];

let problems = 0;
console.log("scenario                                                 scope        key      warns  expected");
for (const scenario of scenarios) {
  const result = withEnv(scenario.env, () => ({
    scope: deploymentScope(),
    kind: bachsKeyKind(),
    warns: billingSafetyWarning() !== null,
  }));
  const ok = result.warns === scenario.expectWarning;
  if (!ok) problems += 1;
  console.log(
    `${scenario.name.padEnd(56)} ${result.scope.padEnd(12)} ${result.kind.padEnd(8)} ${String(result.warns).padEnd(6)} ${scenario.expectWarning}${ok ? "" : "  <-- WRONG"}`,
  );
}

console.log("");
console.log(`this process: scope=${deploymentScope()} key=${bachsKeyKind()} warns=${billingSafetyWarning() !== null}`);
console.log(problems === 0 ? "PASS: a live key warns everywhere except production, and the scope does not depend on NODE_ENV" : `FAIL: ${problems} scenario(s) wrong`);
if (problems > 0) process.exitCode = 1;
