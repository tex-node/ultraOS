import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { koboToAmountString, verifyBachsSignature } from "@/lib/bachs";

test("kobo converts to a decimal string at currency precision", () => {
  assert.equal(koboToAmountString(150000), "1500.00");
  assert.equal(koboToAmountString(0), "0.00");
  assert.equal(koboToAmountString(99), "0.99");
  assert.equal(koboToAmountString(123456), "1234.56");
});

function sign(secret: string, timestamp: number, body: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

test("webhook signature verifies with a fresh timestamp", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "collection.succeeded", data: {} });
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = sign(secret, timestamp, body);
  assert.equal(
    verifyBachsSignature({ rawBody: body, secret, timestampHeader: String(timestamp), signatureHeader: sig, signatureV2Header: null }),
    true,
  );
  // Wrong secret fails.
  assert.equal(
    verifyBachsSignature({ rawBody: body, secret: "whsec_wrong", timestampHeader: String(timestamp), signatureHeader: sig, signatureV2Header: null }),
    false,
  );
  // Tampered body fails.
  assert.equal(
    verifyBachsSignature({ rawBody: body + " ", secret, timestampHeader: String(timestamp), signatureHeader: sig, signatureV2Header: null }),
    false,
  );
});

test("V2 signature header is accepted and stale timestamps rejected", () => {
  const secret = "whsec_test";
  const body = "raw-body-bytes";
  const fresh = Math.floor(Date.now() / 1000);
  const stale = fresh - 3600;
  const v2 = (ts: number) => `t=${ts},v1=${sign(secret, ts, body)}`;
  assert.equal(verifyBachsSignature({ rawBody: body, secret, timestampHeader: null, signatureHeader: null, signatureV2Header: v2(fresh) }), true);
  assert.equal(verifyBachsSignature({ rawBody: body, secret, timestampHeader: null, signatureHeader: null, signatureV2Header: v2(stale) }), false);
});

test("missing signature headers are rejected", () => {
  assert.equal(verifyBachsSignature({ rawBody: "x", secret: "s", timestampHeader: null, signatureHeader: null, signatureV2Header: null }), false);
});