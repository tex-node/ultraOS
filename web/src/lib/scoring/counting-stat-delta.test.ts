import { buildCountingStatDeltaData } from "./counting-stat-delta";
import assert from "node:assert/strict";
import test from "node:test";

test("no Ultra-Time mirror: create/update touch only the primary field", () => {
  const data = buildCountingStatDeltaData("rebounds", 1, null);
  assert.deepEqual(data.create, { rebounds: 1 });
  assert.deepEqual(data.update, { rebounds: { increment: 1 } });
});

test("with an Ultra-Time mirror: create sets both fields to the delta directly", () => {
  const data = buildCountingStatDeltaData("assists", 1, { field: "ultraTimeAssists", delta: 1, existingValue: 0 });
  assert.deepEqual(data.create, { assists: 1, ultraTimeAssists: 1 });
});

test("with an Ultra-Time mirror: update increments the primary field but sets the mirror to existingValue + delta", () => {
  // The mirror can't use Prisma's { increment } in the same call the way the primary field does -
  // its value has to be read before the upsert, so this function takes it as an absolute
  // pre-computed value rather than a relative increment.
  const data = buildCountingStatDeltaData("steals", 1, { field: "ultraTimeSteals", delta: 1, existingValue: 3 });
  assert.deepEqual(data.update, { steals: { increment: 1 }, ultraTimeSteals: 4 });
});

test("a negative delta (future reversal use) decrements the primary field and the mirror the same way", () => {
  const data = buildCountingStatDeltaData("fouls", -1, { field: "ultraTimeFouls", delta: -1, existingValue: 2 });
  assert.deepEqual(data.create, { fouls: -1, ultraTimeFouls: -1 });
  assert.deepEqual(data.update, { fouls: { increment: -1 }, ultraTimeFouls: 1 });
});

test("no floor-at-zero clamping happens here - that's left to the caller", () => {
  const data = buildCountingStatDeltaData("turnovers", -1, { field: "ultraTimeTurnovers", delta: -1, existingValue: 0 });
  assert.deepEqual(data.update, { turnovers: { increment: -1 }, ultraTimeTurnovers: -1 });
});
