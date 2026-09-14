import assert from "node:assert/strict";
import test from "node:test";
import { GameEventType } from "@/generated/prisma/enums";
import { BASKETBALL } from "@/lib/sports/basketball";
import {
  LEGACY_EVENT_KEY_REMAP,
  eventCatalogCategory,
  eventDefinitionFor,
  eventPointValues,
  eventScores,
  legacyEventTypeToKey,
} from "@/lib/sports/event-catalog";

test("every legacy GameEventType maps to a key in the basketball catalog", () => {
  const catalogKeys = new Set(BASKETBALL.events.map((event) => event.key));
  for (const legacyType of Object.values(GameEventType)) {
    const mapped = legacyEventTypeToKey(legacyType);
    assert.ok(catalogKeys.has(mapped), `legacy ${legacyType} -> ${mapped} missing from catalog`);
  }
});

test("SCORE is remapped to SHOT_MADE and identity mappings are preserved", () => {
  assert.equal(legacyEventTypeToKey("SCORE"), "SHOT_MADE");
  assert.equal(legacyEventTypeToKey("ASSIST"), "ASSIST");
  assert.equal(legacyEventTypeToKey("DEFENSIVE_REBOUND"), "DEFENSIVE_REBOUND");
  assert.deepEqual(LEGACY_EVENT_KEY_REMAP, { SCORE: "SHOT_MADE" });
});

test("event lookups resolve against the catalog", () => {
  assert.equal(eventDefinitionFor(BASKETBALL, "SHOT_MADE")?.label, "Shot made");
  assert.equal(eventDefinitionFor(BASKETBALL, "NOPE"), undefined);
  assert.equal(eventDefinitionFor(BASKETBALL, null), undefined);

  assert.equal(eventScores(BASKETBALL, "SHOT_MADE"), true);
  assert.equal(eventScores(BASKETBALL, "TIMEOUT"), false);
  assert.equal(eventScores(BASKETBALL, "NOPE"), false);

  assert.deepEqual(eventPointValues(BASKETBALL, "SHOT_MADE"), [1, 2, 3, 4]);
  assert.deepEqual(eventPointValues(BASKETBALL, "TIMEOUT"), []);
});

test("the catalog can be filtered by category", () => {
  const lifecycle = eventCatalogCategory(BASKETBALL, "LIFECYCLE").map((event) => event.key);
  assert.ok(lifecycle.includes("GAME_STARTED"));
  assert.ok(lifecycle.includes("GAME_ENDED"));
  assert.equal(eventCatalogCategory(BASKETBALL, "NOPE").length, 0);
});
