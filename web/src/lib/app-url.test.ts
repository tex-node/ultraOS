import assert from "node:assert/strict";
import test from "node:test";
import { PublicBaseUrlRequiredError, publicBaseUrl } from "@/lib/app-url";

// The bug these pin (streak v32c): every Bachs checkout built its return URLs from
// `APP_BASE_URL ?? NEXTAUTH_URL ?? "http://127.0.0.1:4120"`. Production sets neither of the first two (it uses AUTH_URL),
// so the loopback fallback won and Bachs rejected the checkout at the card form with an error that never mentioned the URL.
test("NEXT_PUBLIC_APP_URL wins, because it is the only one that is meant to be public", () => {
  assert.equal(
    publicBaseUrl({
      env: { NEXT_PUBLIC_APP_URL: "https://app.neonultra.ng", APP_BASE_URL: "https://other.example", AUTH_URL: "https://third.example" },
    }),
    "https://app.neonultra.ng",
  );
});

test("AUTH_URL is used when the public variable is unset - which is how the app is configured today", () => {
  assert.equal(publicBaseUrl({ env: { AUTH_URL: "https://app.neonultra.ng" } }), "https://app.neonultra.ng");
});

test("a loopback candidate is skipped, not silently used, and the next public one wins", () => {
  assert.equal(
    publicBaseUrl({ env: { NEXT_PUBLIC_APP_URL: "http://127.0.0.1:4120", AUTH_URL: "https://app.neonultra.ng" } }),
    "https://app.neonultra.ng",
  );
});

test("with only loopback configured it throws, naming what was tried and what to set", () => {
  let message = "";
  assert.throws(
    () => publicBaseUrl({ env: { AUTH_URL: "http://127.0.0.1:4120", NEXTAUTH_URL: "http://localhost:3000" } }),
    (error: unknown) => {
      assert.ok(error instanceof PublicBaseUrlRequiredError);
      message = (error as Error).message;
      return true;
    },
  );
  assert.match(message, /NEXT_PUBLIC_APP_URL/);
  assert.match(message, /loopback/);
  assert.match(message, /AUTH_URL, NEXTAUTH_URL/);
});

test("private container ranges are refused too - a 172.17 address must not masquerade as public", () => {
  assert.throws(() => publicBaseUrl({ env: { AUTH_URL: "http://172.17.0.1:4120" } }), PublicBaseUrlRequiredError);
  assert.throws(() => publicBaseUrl({ env: { AUTH_URL: "http://192.168.1.10" } }), PublicBaseUrlRequiredError);
});

test("callers that are not sending a browser to a provider may keep loopback", () => {
  assert.equal(publicBaseUrl({ allowLoopback: true, env: { AUTH_URL: "http://127.0.0.1:4120" } }), "http://127.0.0.1:4120");
});

test("trailing slashes and a root path are normalised so callers can append paths", () => {
  assert.equal(publicBaseUrl({ env: { AUTH_URL: "https://app.neonultra.ng/" } }), "https://app.neonultra.ng");
});

test("a non-http scheme is a configuration error, not a silent pass", () => {
  assert.throws(() => publicBaseUrl({ env: { AUTH_URL: "ftp://app.neonultra.ng" } }), /must be http/);
});
