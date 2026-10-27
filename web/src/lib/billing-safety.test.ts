import assert from "node:assert/strict";
import test from "node:test";
import { assessBillingSafety, LiveKeyInNonProductionError } from "@/lib/billing-safety";

// Streak v22, Prompt 3: a live payment key outside production must stop the server, not warn it.
//
// The scenarios mirror the ones that actually happen: staging carrying production's key (the state on this host for two
// streaks), a deployment that only sets the legacy BACH_IO name, and a loopback AUTH_URL being the only hint that a
// deployment is staging (NODE_ENV is "production" everywhere, which is why it cannot be the signal).
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

test("refuses to start when staging uses a live key", () => {
  const verdict = withEnv({ APP_ENV: "staging", BACHS_KEY: "sk_live_abc", BACH_IO: undefined, NODE_ENV: "production" }, () =>
    assessBillingSafety(),
  );
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /REFUSING TO START/);
});

test("refuses the same way when the key is only in the legacy BACH_IO variable", () => {
  const verdict = withEnv({ APP_ENV: "staging", BACHS_KEY: undefined, BACH_IO: "sk_live_legacy" }, () => assessBillingSafety());
  assert.equal(verdict.ok, false);
});

test("refuses on a loopback deployment even with no APP_ENV, because NODE_ENV says production", () => {
  const verdict = withEnv({ APP_ENV: undefined, AUTH_URL: "http://127.0.0.1:4120", BACHS_KEY: "sk_live_abc", NODE_ENV: "production" }, () =>
    assessBillingSafety(),
  );
  assert.equal(verdict.ok, false);
});

test("allows a live key in production", () => {
  const verdict = withEnv({ APP_ENV: "production", AUTH_URL: "https://app.neonultra.ng", BACHS_KEY: "sk_live_abc" }, () => assessBillingSafety());
  assert.equal(verdict.ok, true);
});

test("allows a sandbox key on staging, and no key at all", () => {
  const sandbox = withEnv({ APP_ENV: "staging", BACHS_KEY: "sk_sandbox_abc", BACH_IO: undefined }, () => assessBillingSafety());
  assert.equal(sandbox.ok, true);
  const none = withEnv({ APP_ENV: "staging", BACHS_KEY: undefined, BACH_IO: undefined }, () => assessBillingSafety());
  assert.equal(none.ok, true);
});

test("the error says what to do about it", () => {
  const error = new LiveKeyInNonProductionError("staging");
  assert.match(error.message, /BACHS_SANDBOX_KEY|BACHS_KEY/);
  assert.match(error.message, /BACHS_MOCK=1/);
  assert.match(error.message, /charge a real customer/);
});
