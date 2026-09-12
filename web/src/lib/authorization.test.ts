import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@/generated/prisma/enums";
import { userHasPlatformPermission } from "@/lib/platform-permissions";

function grantReader(grants: Array<{ userId: string; role: UserRole; organizationId: string | null; revokedAt: Date | null }>) {
  return {
    userRoleAssignment: {
      async findMany(args: {
        where: { userId: string; organizationId: null; revokedAt: null };
        select: { role: true };
      }) {
        return grants
          .filter(
            (grant) =>
              grant.userId === args.where.userId &&
              grant.organizationId === args.where.organizationId &&
              grant.revokedAt === args.where.revokedAt,
          )
          .map((grant) => ({ role: grant.role }));
      },
    },
  };
}

test("platform permission denies an org-scoped LEAGUE_OPERATOR grant", async () => {
  const db = grantReader([
    { userId: "user-a", role: UserRole.LEAGUE_OPERATOR, organizationId: "org-b", revokedAt: null },
  ]);

  assert.equal(await userHasPlatformPermission("user-a", "data:readiness", db), false);
});

test("platform permission allows an active null-org qualifying grant", async () => {
  const db = grantReader([
    { userId: "user-b", role: UserRole.LEAGUE_OPERATOR, organizationId: null, revokedAt: null },
  ]);

  assert.equal(await userHasPlatformPermission("user-b", "data:readiness", db), true);
});

test("platform permission denies a user with no qualifying grant", async () => {
  const db = grantReader([]);

  assert.equal(await userHasPlatformPermission("user-c", "data:readiness", db), false);
});

test("platform permission allows mixed grants only when a null-org grant qualifies", async () => {
  const db = grantReader([
    { userId: "user-d", role: UserRole.LEAGUE_OPERATOR, organizationId: "org-b", revokedAt: null },
    { userId: "user-d", role: UserRole.SUPER_ADMIN, organizationId: null, revokedAt: null },
  ]);

  assert.equal(await userHasPlatformPermission("user-d", "data:readiness", db), true);
});

test("platform permission denies a null-org role that does not grant the requested permission", async () => {
  const db = grantReader([
    { userId: "user-e", role: UserRole.FAN, organizationId: null, revokedAt: null },
  ]);

  assert.equal(await userHasPlatformPermission("user-e", "data:readiness", db), false);
});

test("platform permission ignores revoked null-org qualifying grants", async () => {
  const db = grantReader([
    { userId: "user-f", role: UserRole.SUPER_ADMIN, organizationId: null, revokedAt: new Date("2026-09-01T00:00:00.000Z") },
  ]);

  assert.equal(await userHasPlatformPermission("user-f", "data:readiness", db), false);
});
