import { test } from "node:test";
import assert from "node:assert/strict";
import { isCoachingAssistantEnabled } from "./feature-flag";

test("coaching flag is off unless explicitly 'true'", () => {
  assert.equal(isCoachingAssistantEnabled({}), false);
  assert.equal(isCoachingAssistantEnabled({ COACHING_ASSISTANT_ENABLED: "1" }), false);
  assert.equal(isCoachingAssistantEnabled({ COACHING_ASSISTANT_ENABLED: "TRUE" }), false);
  assert.equal(isCoachingAssistantEnabled({ COACHING_ASSISTANT_ENABLED: "true" }), true);
});
