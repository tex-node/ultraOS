import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { listFeedSubscriptions } from "@/server/data-feed/subscriptions";
import { DataFeedManager } from "./manager";

export const dynamic = "force-dynamic";

// /settings/data-feed (streak v8, Prompt 4): the B2B side of the data feed.
//
// Before this, a partner subscription was a row someone inserted with SQL: no rotation, no delivery log, no
// retry. The permission is `operations:manage` - the same org-level operator permission that governs
// integrations - because handing a partner a signing secret is an operational act, not a scoring one.
export default async function DataFeedSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/settings/data-feed");
  if (!hasPermission(session.user.roles, "operations:manage")) notFound();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const subscriptions = await withOrganizationContext(session.user.organizationId, (tx) =>
    listFeedSubscriptions(tx, session.user.organizationId!),
  );

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Partner data feed</h1>
          <Link href="/api-docs" className="text-sm text-info underline">
            API &amp; webhook docs
          </Link>
        </div>
        <p className="mt-1 text-sm text-text-2">
          Signed webhooks for odds providers and media partners. The secret is shown once when it is created or
          rolled; the list only ever shows its last four characters.
        </p>
        <DataFeedManager subscriptions={subscriptions} />
      </main>
    </OperationsShell>
  );
}
