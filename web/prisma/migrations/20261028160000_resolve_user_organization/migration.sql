-- Streak v21, Prompt 2 (found by the browser specs): a user's login-time organization cannot be resolved.
--
-- THE BUG: auth.ts resolves the session's organizationId at sign-in with
--   resolveActiveOrganizationId(user.id) -> SELECT ... FROM "UserRoleAssignment" WHERE organizationId IS NOT NULL ...
-- That query runs BEFORE any tenant context exists - that is the whole point, it is how the context is chosen - and
-- UserRoleAssignment has RLS ENABLED **and FORCED** with the policy
--   ("organizationId" IS NULL) OR ("organizationId" = COALESCE(current_setting('app.current_org_id', true), '<default org>'))
-- So with no context set, the policy resolves to the platform default organization and every membership in any OTHER
-- organization is invisible. The function returns null, the session gets organizationId: null, and every org-scoped page
-- answers "No league yet" - for exactly the users who belong to a real league and not to the default one.
--
-- THE FIX: one SECURITY DEFINER function, owned by the migration role, that answers exactly one question - "which
-- organization does this user belong to, oldest grant first?" - for the user id given. It bypasses RLS deliberately and
-- narrowly: it returns one organization id for one user id, never a row of tenant data, and the caller already knows its
-- own user id (it comes from the verified session/credential check).
--
-- FORCE ROW LEVEL SECURITY applies to the table OWNER, which is why this cannot be solved by "query as the owner".
-- A SECURITY DEFINER function owned by a role with BYPASSRLS (or a superuser) is the smallest mechanism that works.
CREATE OR REPLACE FUNCTION app_resolve_user_organization(p_user_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM (
    SELECT "organizationId" AS organization_id, "grantedAt" AS at
    FROM "UserRoleAssignment"
    WHERE "userId" = p_user_id AND "organizationId" IS NOT NULL AND "revokedAt" IS NULL
    UNION ALL
    SELECT "organizationId" AS organization_id, "createdAt" AS at
    FROM "GameControlGrant"
    WHERE "userId" = p_user_id AND "revokedAt" IS NULL
  ) memberships
  WHERE organization_id IS NOT NULL
  ORDER BY at ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION app_resolve_user_organization(TEXT) IS
  'Which organization a user belongs to, oldest grant first. SECURITY DEFINER because it runs before any tenant context exists; returns only an organization id.';

-- Same three roles as every other grant in this schema, in the same file.
GRANT EXECUTE ON FUNCTION app_resolve_user_organization(TEXT) TO ultraos;
GRANT EXECUTE ON FUNCTION app_resolve_user_organization(TEXT) TO ultraos_app;
GRANT EXECUTE ON FUNCTION app_resolve_user_organization(TEXT) TO ultraos_staging;
