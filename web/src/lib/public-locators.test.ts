import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OrganizationStatus,
  PublicLocatorStatus,
  PublicResourceLocatorType,
  PublicTokenLocatorType,
} from "@/generated/prisma/enums";
import {
  hashPublicToken,
  locatorMatchesResource,
  resolvePublicResourceLocator,
  resolvePublicTokenLocator,
} from "@/lib/public-locators";

test("hashPublicToken isolates token types", () => {
  const token = "same-raw-token";
  assert.notEqual(
    hashPublicToken(PublicTokenLocatorType.TICKET, token),
    hashPublicToken(PublicTokenLocatorType.ORDER, token),
  );
});

test("resolvePublicResourceLocator returns active organization provenance", async () => {
  const db = {
    publicResourceLocator: {
      findUnique: async () => ({
        organizationId: "org_b",
        resourceId: "fixture_1",
        status: PublicLocatorStatus.ACTIVE,
        organization: { status: OrganizationStatus.ACTIVE },
      }),
    },
  };
  const resolved = await resolvePublicResourceLocator(
    db as never,
    PublicResourceLocatorType.FIXTURE,
    "fixture_1",
  );
  assert.deepEqual(resolved, { organizationId: "org_b", resourceId: "fixture_1" });
});

test("resolvePublicResourceLocator fails closed for unknown or inactive selectors", async () => {
  const unknownDb = {
    publicResourceLocator: { findUnique: async () => null },
  };
  assert.equal(
    await resolvePublicResourceLocator(unknownDb as never, PublicResourceLocatorType.CLUB, "missing"),
    null,
  );

  const inactiveDb = {
    publicResourceLocator: {
      findUnique: async () => ({
        organizationId: "org_b",
        resourceId: "club_1",
        status: PublicLocatorStatus.INACTIVE,
        organization: { status: OrganizationStatus.ACTIVE },
      }),
    },
  };
  assert.equal(
    await resolvePublicResourceLocator(inactiveDb as never, PublicResourceLocatorType.CLUB, "club_1"),
    null,
  );
});

test("resolvePublicTokenLocator hashes lookup token and fails closed for inactive organizations", async () => {
  let where:
    | { tokenType_tokenHash: { tokenType: PublicTokenLocatorType; tokenHash: string } }
    | undefined;
  const db = {
    publicTokenLocator: {
      findUnique: async (args: { where: typeof where }) => {
        where = args.where;
        return {
          organizationId: "org_b",
          resourceId: "ticket_1",
          status: PublicLocatorStatus.ACTIVE,
          organization: { status: OrganizationStatus.SUSPENDED },
        };
      },
    },
  };
  const resolved = await resolvePublicTokenLocator(
    db as never,
    PublicTokenLocatorType.TICKET,
    "raw-ticket-token",
  );
  assert.equal(resolved, null);
  assert.equal(where?.tokenType_tokenHash.tokenType, PublicTokenLocatorType.TICKET);
  assert.equal(
    where?.tokenType_tokenHash.tokenHash,
    hashPublicToken(PublicTokenLocatorType.TICKET, "raw-ticket-token"),
  );
});

test("locatorMatchesResource requires id and organization agreement", () => {
  const locator = { organizationId: "org_a", resourceId: "resource_a" };
  assert.equal(
    locatorMatchesResource(locator, { id: "resource_a", organizationId: "org_a" }),
    true,
  );
  assert.equal(
    locatorMatchesResource(locator, { id: "resource_a", organizationId: "org_b" }),
    false,
  );
  assert.equal(
    locatorMatchesResource(locator, { id: "resource_b", organizationId: "org_a" }),
    false,
  );
  assert.equal(locatorMatchesResource(locator, null), false);
});
