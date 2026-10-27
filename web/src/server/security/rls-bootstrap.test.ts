import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";

// The dynamic half of the RLS bootstrap audit (streak v23, Prompt 2); runs under `npm run test:db` because it needs a
// database. The static half is src/lib/security/rls-bootstrap-audit.test.ts.
//
// What it proves, against the real policy rather than against the source text: the SECURITY DEFINER functions return what
// a bare read CANNOT. If someone removes the functions (or the grants) these fail, and the failure is the same shape as
// the two bugs that motivated them - a league's own membership disappearing at sign-in.
test("app_resolve_user_roles and app_resolve_user_organization agree with the rows an owner-context query sees", async () => {
  // Pick a user who holds an organization-scoped grant, which is the case that used to break.
  const membership = await prisma.userRoleAssignment.findFirst({
    where: { organizationId: { not: null }, revokedAt: null },
    select: { userId: true, organizationId: true, role: true },
    orderBy: { grantedAt: "asc" },
  });
  assert.ok(membership, "the test database must have at least one organization-scoped grant");

  const roles = await prisma.$queryRaw<{ roles: string[] | null }[]>`SELECT app_resolve_user_roles(${membership!.userId}) AS roles`;
  assert.ok(Array.isArray(roles[0]?.roles), "app_resolve_user_roles must return an array");
  assert.ok(
    roles[0]!.roles!.includes(String(membership!.role)),
    `the resolved roles (${JSON.stringify(roles[0]!.roles)}) must include the grant (${membership!.role})`,
  );

  const organization = await prisma.$queryRaw<{ organization_id: string | null }[]>`
    SELECT app_resolve_user_organization(${membership!.userId}) AS organization_id
  `;
  assert.equal(organization[0]?.organization_id, membership!.organizationId, "the resolved organization must be the oldest grant's");
});

test("a bare read of UserRoleAssignment is narrower than the function - the reason the functions exist", async () => {
  // No tenant context is set here, so the policy resolves to the platform default organization. The SQL function is
  // SECURITY DEFINER and does not go through it. Both are correct answers to different questions; the point is that they
  // differ for any user whose membership is not in the default organization, which is why sign-in cannot use the bare read.
  const memberships = await prisma.userRoleAssignment.findMany({
    where: { organizationId: { not: null }, revokedAt: null },
    select: { userId: true, organizationId: true },
    take: 200,
  });
  const defaultOrganization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const outsideDefault = memberships.find((row) => row.organizationId !== defaultOrganization?.id);
  if (!outsideDefault) {
    // A database with a single organization cannot demonstrate the difference; say so rather than pretending to.
    console.log("skipped: every membership is in the default organization, so the two paths cannot diverge here");
    return;
  }

  const bare = await prisma.userRoleAssignment.findFirst({
    where: { userId: outsideDefault.userId, organizationId: { not: null }, revokedAt: null },
    select: { organizationId: true },
  });
  const viaFunction = await prisma.$queryRaw<{ organization_id: string | null }[]>`
    SELECT app_resolve_user_organization(${outsideDefault.userId}) AS organization_id
  `;
  assert.equal(viaFunction[0]?.organization_id, outsideDefault.organizationId, "the function sees the real membership");
  assert.notEqual(
    bare?.organizationId,
    outsideDefault.organizationId,
    "the bare read must NOT see a membership outside the default organization - if it does, the policy changed and this test's premise is gone",
  );
});

test("the API key lookup still resolves through its SECURITY DEFINER function", async () => {
  const functions = await prisma.$queryRaw<{ proname: string; secdef: boolean }[]>`
    SELECT proname, prosecdef AS secdef FROM pg_proc
    WHERE proname IN ('resolve_api_key', 'app_resolve_user_roles', 'app_resolve_user_organization')
  `;
  const byName = new Map(functions.map((row) => [row.proname, row.secdef]));
  for (const name of ["resolve_api_key", "app_resolve_user_roles", "app_resolve_user_organization"]) {
    assert.equal(byName.get(name), true, `${name} must exist and be SECURITY DEFINER`);
  }
});
