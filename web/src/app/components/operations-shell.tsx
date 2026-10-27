import { WorkspaceShell, type WorkspaceUser } from "./workspace-shell";

// Legacy name kept so every operations page adopts the workspace shell unchanged.
// New code should import WorkspaceShell directly.
export function OperationsShell({
  children,
  user,
  organizationName,
  organizationContext,
}: {
  children: React.ReactNode;
  user: WorkspaceUser;
  organizationName?: string;
  organizationContext?: string | null;
}) {
  return (
    <WorkspaceShell user={user} organizationName={organizationName} organizationContext={organizationContext}>
      {children}
    </WorkspaceShell>
  );
}
