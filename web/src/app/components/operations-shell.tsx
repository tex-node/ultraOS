import { WorkspaceShell, type WorkspaceUser } from "./workspace-shell";

// Legacy name kept so every operations page adopts the workspace shell unchanged.
// New code should import WorkspaceShell directly.
export function OperationsShell({ children, user }: { children: React.ReactNode; user: WorkspaceUser }) {
  return <WorkspaceShell user={user}>{children}</WorkspaceShell>;
}
