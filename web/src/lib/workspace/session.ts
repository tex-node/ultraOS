import { cookies } from "next/headers";
import { auth } from "@/auth";
import { homeForPersona, personasForRoles, type Persona } from "@/lib/workspace/nav";

// Which viewport is active for this request, resolved on the server from the session's roles plus the cookie the switcher
// sets. A cookie that names a persona the user no longer holds is ignored, so losing a role immediately loses its tools -
// the sidebar is not a client-side preference that outlives authorization.
import { WORKSPACE_PERSONA_COOKIE } from "@/lib/workspace/persona-cookie";

export async function getSessionRoles(): Promise<string[]> {
  const session = await auth();
  const roles = (session?.user as { roles?: string[]; role?: string } | undefined) ?? {};
  if (Array.isArray(roles.roles) && roles.roles.length > 0) return roles.roles;
  return roles.role ? [roles.role] : [];
}

export type WorkspaceViewport = { active: Persona; available: Persona[]; roles: string[] };

export async function resolveViewport(): Promise<WorkspaceViewport> {
  const roles = await getSessionRoles();
  const available = personasForRoles(roles);
  const store = await cookies();
  const chosen = store.get(WORKSPACE_PERSONA_COOKIE)?.value as Persona | undefined;
  const active = chosen && available.includes(chosen) ? chosen : available[0];
  return { active, available, roles };
}

export { homeForPersona };
