import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreateDeviceId } from "./device-id";

function fakeStorage(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

test("getOrCreateDeviceId generates and persists a new id when none exists", () => {
  const storage = fakeStorage();
  const id = getOrCreateDeviceId(storage);
  assert.ok(id);
  assert.equal(storage.data.get("ultra-offline-device-id"), id);
});

test("getOrCreateDeviceId returns the same id on every call - stable across sessions", () => {
  const storage = fakeStorage();
  const first = getOrCreateDeviceId(storage);
  const second = getOrCreateDeviceId(storage);
  assert.equal(first, second);
});

test("getOrCreateDeviceId respects a pre-existing stored id rather than overwriting it", () => {
  const storage = fakeStorage();
  storage.setItem("ultra-offline-device-id", "pre-existing-id");
  assert.equal(getOrCreateDeviceId(storage), "pre-existing-id");
});
