// The cookie that names the viewport the user chose. Kept in its own module because a "use server" file may only export
// async functions - a constant exported from persona-actions.ts made the whole action module unimportable for the client.
export const WORKSPACE_PERSONA_COOKIE = "workspace_persona";
