import { redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { SetupWizard } from "./wizard";

export const dynamic = "force-dynamic";

// Admin onboarding (streak v15, Prompt 3): a new partner stands up a league without a script.
export default async function SetupWizardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/setup-wizard");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  if (!hasPermission(session.user.roles, "operations:manage")) redirect("/dashboard");

  const canCreateOrganization = session.user.roles.includes("SUPER_ADMIN");

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">Onboarding</p>
        <h1 className="mt-2 text-2xl font-bold">Set up a league</h1>
        <p className="mt-1 text-sm text-text-2">
          Five steps, one transaction: sport, league name, participants, format, generate. Nothing is written until the
          last step, so leaving early leaves nothing behind.
        </p>
        <div className="mt-6">
          <SetupWizard canCreateOrganization={canCreateOrganization} />
        </div>
      </main>
    </OperationsShell>
  );
}
