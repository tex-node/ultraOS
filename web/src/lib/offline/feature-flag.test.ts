import { OFFLINE_SCORING_ENV_KEY, isOfflineScoringEnabled } from "./feature-flag";

import assert from "node:assert/strict";
import test from "node:test";

test("isOfflineScoringEnabled is false when the env var is absent", () => {
  assert.equal(isOfflineScoringEnabled({}), false);
});

test("isOfflineScoringEnabled is false for any value other than the exact string 'true'", () => {
  for (const value of ["1", "TRUE", "True", "yes", "on", "false", ""]) {
    assert.equal(isOfflineScoringEnabled({ [OFFLINE_SCORING_ENV_KEY]: value }), false);
  }
});

test("isOfflineScoringEnabled is true only for the exact string 'true'", () => {
  assert.equal(isOfflineScoringEnabled({ [OFFLINE_SCORING_ENV_KEY]: "true" }), true);
});

test("isOfflineScoringEnabled defaults to off when read from a production env with no flag set", () => {
  assert.equal(isOfflineScoringEnabled({ NODE_ENV: "production" }), false);
});
