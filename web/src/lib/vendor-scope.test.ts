import assert from "node:assert/strict";
import test from "node:test";
import { vendorScopeFrom } from "@/lib/vendor-scope";

test("platform staff see everything", () => {
  assert.deepEqual(vendorScopeFrom(["SUPER_ADMIN"], null), { kind: "all" });
  assert.deepEqual(vendorScopeFrom(["TOURNAMENT_DIRECTOR"], "v1"), { kind: "all" });
});

test("vendor-linked accounts are confined to their vendor", () => {
  assert.deepEqual(vendorScopeFrom(["VENDOR"], "v1"), { kind: "vendor", vendorId: "v1" });
  assert.deepEqual(vendorScopeFrom(["VENDOR_MANAGER"], "v1"), { kind: "vendor", vendorId: "v1" });
});

test("unlinked narrow accounts hold no scope", () => {
  assert.deepEqual(vendorScopeFrom(["VENDOR"], null), { kind: "none" });
  assert.deepEqual(vendorScopeFrom(["FAN"], null), { kind: "none" });
});
