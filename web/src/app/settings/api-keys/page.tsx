import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { listApiKeys } from "@/lib/api-v1/api-keys";
import { ApiKeysManager } from "./manager";

export const dynamic = "force-dynamic";

// /settings/api-keys (streak v9, Prompt 2). The developer side of the partner API: create, see the prefix of,
// and revoke keys. The raw key is shown once by the create action and never stored.
export default async function ApiKeysSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/settings/api-keys");
  if (!hasPermission(session.user.roles, "operations:manage")) notFound();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const keys = await withOrganizationContext(session.user.organizationId, (tx) => listApiKeys(tx, session.user.organizationId!));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Developer API keys</h1>
          <div className="flex gap-3 text-sm">
            <Link href="/settings/data-feed" className="text-info underline">
              Data feed
            </Link>
            <Link href="/api-docs" className="text-info underline">
              API docs
            </Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-text-2">
          Authenticate partner requests to <code>/api/v1</code>. The public scoreboard (<code>/api/v1/live</code>)
          stays open; everything else needs a key, and each tier has its own rate limit.
        </p>
        <ApiKeysManager keys={keys} />
      </main>
    </OperationsShell>
  );
}
