import assert from "node:assert/strict";
import test from "node:test";
import { apiError } from "./errors";

test("apiError produces the stable { error: { code, message } } envelope", async () => {
  const response = apiError("GAME_NOT_FOUND", "No game found for this id.");
  const body = await response.json();
  assert.deepEqual(body, { error: { code: "GAME_NOT_FOUND", message: "No game found for this id." } });
});

test("apiError maps each code to its documented HTTP status", () => {
  assert.equal(apiError("GAME_NOT_FOUND", "x").status, 404);
  assert.equal(apiError("PLAYER_NOT_FOUND", "x").status, 404);
  assert.equal(apiError("CLUB_NOT_FOUND", "x").status, 404);
  assert.equal(apiError("SEASON_NOT_FOUND", "x").status, 404);
  assert.equal(apiError("GAME_NOT_LIVE", "x").status, 409);
  assert.equal(apiError("RATE_LIMITED", "x").status, 429);
  assert.equal(apiError("UNAUTHORIZED", "x").status, 401);
  assert.equal(apiError("INTERNAL_ERROR", "x").status, 500);
});

test("apiError never leaks anything beyond code and message (no stack trace field)", async () => {
  const response = apiError("INTERNAL_ERROR", "Something went wrong.");
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.deepEqual(Object.keys(body.error), ["code", "message"]);
});
