-- Streak v22, Prompt 2: the ROLES a user holds are invisible at sign-in, for exactly the reason the organization was.
--
-- THE BUG (found by the multi-tenant auth spec): auth.ts's getSessionUser() reads
--   prisma.user.findUnique({ include: { roles: { where: { revokedAt: null } } } })
-- and that read happens BEFORE any tenant context exists. UserRoleAssignment has RLS ENABLED **and FORCED**, so the
-- policy resolves organizationId to the platform default organization and every grant in any OTHER organization is
-- invisible. `roles` came back EMPTY, and the code fell back to the legacy `User.role` column -
--   roles: roles.length > 0 ? roles : [user.role, UserRole.FAN]
-- which means every user of a non-default league signed in with whatever that legacy column happened to say. For an
-- account created as SUPER_ADMIN (as the E2E fixture was) that is a PRIVILEGE ESCALATION: a league operator of Org B
-- signed in as a platform administrator and could open Org A's dashboard.
--
-- v21 fixed the ORGANIZATION part of this with app_resolve_user_organization(). This is the other half, and the same
-- mechanism applies for the same reason: the question cannot be answered by a scoped query because the scope is what is
-- being determined. The function returns only the roles of the user id given - no tenant data.
CREATE OR REPLACE FUNCTION app_resolve_user_roles(p_user_id TEXT)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT role::text), ARRAY[]::text[])
  FROM "UserRoleAssignment"
  WHERE "userId" = p_user_id AND "revokedAt" IS NULL;
$$;

COMMENT ON FUNCTION app_resolve_user_roles(TEXT) IS
  'Every active role a user holds, across all organizations. SECURITY DEFINER because it runs before any tenant context exists; returns role names only.';

GRANT EXECUTE ON FUNCTION app_resolve_user_roles(TEXT) TO ultraos;
GRANT EXECUTE ON FUNCTION app_resolve_user_roles(TEXT) TO ultraos_app;
GRANT EXECUTE ON FUNCTION app_resolve_user_roles(TEXT) TO ultraos_staging;
