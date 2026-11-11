import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WorkspaceShell } from "@/app/components/workspace-shell";

export const dynamic = "force-dynamic";

// (workspace) — the operations side of the product. One shell for every tool: sidebar, header, persona-driven navigation.
//
// WHY A LAYOUT AND NOT PER-PAGE WRAPPERS. Before this, forty-seven pages each rendered <OperationsShell> themselves, which
// meant the chrome was a copy-paste convention rather than a guarantee: a new page could forget it, and the sidebar list lived
// in a component nobody could vary without touching every caller. The shell now belongs to the segment, and the pages are just
// their content.
//
// This layout is the authorization boundary for the group: no session, no workspace. Pages keep their own permission checks for
// what they show; this only guarantees the frame exists and that an anonymous visitor is sent to sign in.
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <WorkspaceShell user={session.user}>{children}</WorkspaceShell>;
}
