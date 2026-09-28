import { ledgerSourceFor } from "./provenance";
import assert from "node:assert/strict";
import test from "node:test";

test("LIVE_UI maps to the scorer ledger value by default", () => {
  assert.equal(ledgerSourceFor("LIVE_UI"), "ULTRA_NATIVE_LIVE_SCORER");
});

test("LIVE_UI maps to the statistician ledger value when the hint says so", () => {
  assert.equal(ledgerSourceFor("LIVE_UI", "STATISTICIAN"), "ULTRA_NATIVE_LIVE_STATISTICIAN");
});

test("OFFLINE_SYNC with a hint resolves to the same ledger value as the matching LIVE_UI write", () => {
  assert.equal(ledgerSourceFor("OFFLINE_SYNC", "SCORER"), "ULTRA_NATIVE_LIVE_SCORER");
  assert.equal(ledgerSourceFor("OFFLINE_SYNC", "STATISTICIAN"), "ULTRA_NATIVE_LIVE_STATISTICIAN");
});

test("OFFLINE_SYNC with no hint falls back to the reserved OFFLINE_SYNC value", () => {
  assert.equal(ledgerSourceFor("OFFLINE_SYNC"), "OFFLINE_SYNC");
});

test("VISION_PROMOTED maps to a distinct ledger value from any live source", () => {
  assert.equal(ledgerSourceFor("VISION_PROMOTED"), "EXTERNAL_PROVIDER");
});

test("MANUAL_ADMIN maps to the manual-entry ledger value", () => {
  assert.equal(ledgerSourceFor("MANUAL_ADMIN"), "MANUAL_ADMIN_ENTRY");
});

test("source is transport-stable: the same hint yields the same ledger value whether live or synced", () => {
  assert.equal(ledgerSourceFor("LIVE_UI", "SCORER"), ledgerSourceFor("OFFLINE_SYNC", "SCORER"));
  assert.equal(ledgerSourceFor("LIVE_UI", "STATISTICIAN"), ledgerSourceFor("OFFLINE_SYNC", "STATISTICIAN"));
});

test("distinct sources with no shared hint never collapse to the same ledger value", () => {
  const values = [
    ledgerSourceFor("LIVE_UI", "SCORER"),
    ledgerSourceFor("LIVE_UI", "STATISTICIAN"),
    ledgerSourceFor("OFFLINE_SYNC"),
    ledgerSourceFor("VISION_PROMOTED"),
    ledgerSourceFor("MANUAL_ADMIN"),
  ];
  assert.equal(new Set(values).size, values.length);
});
