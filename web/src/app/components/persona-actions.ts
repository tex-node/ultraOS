"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { homeForPersona, personasForRoles, type Persona } from "@/lib/workspace/nav";
import { getSessionRoles } from "@/lib/workspace/session";

// Persist the viewport the user chose. A cookie rather than a query parameter, because the choice should survive navigation -
// a coach who opens the admin workspace once should not have to re-choose on every page load.
export const WORKSPACE_PERSONA_COOKIE = "workspace_persona";

export async function choosePersona(formData: FormData): Promise<void> {
  const wanted = formData.get("persona");
  const roles = await getSessionRoles();
  const allowed = personasForRoles(roles);
  const persona = allowed.find((candidate) => candidate === wanted);
  if (!persona) redirect(homeForPersona(allowed[0]));

  const store = await cookies();
  store.set(WORKSPACE_PERSONA_COOKIE, persona satisfies Persona, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(homeForPersona(persona));
}

export async function clearPersona(): Promise<void> {
  const store = await cookies();
  store.delete(WORKSPACE_PERSONA_COOKIE);
  const roles = await getSessionRoles();
  redirect(homeForPersona(personasForRoles(roles)[0]));
}
