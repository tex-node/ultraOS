import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { draftEventReadiness } from "@/lib/draft-events";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DraftReadinessPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/readiness`);
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:read");
  const items = await withOrganizationContext(organizationId, (tx) => draftEventReadiness(tx, draftEventId));
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link className="text-sm text-brand-400" href={`/draft-events/${draftEventId}`}>Back to event</Link>
        <h1 className="mt-4 text-3xl font-semibold">Readiness checks</h1>
        <section className="mt-8 grid gap-3">
          {items.map((item) => (
            <div className="grid gap-3 rounded-md border border-line bg-ink-800 p-4 md:grid-cols-[140px_1fr_2fr]" key={item.key}>
              <span className={badgeClass(item.status)}>{item.squadStatus ?? item.status}</span>
              <div>
                <b>{item.label}</b>
                {item.current !== undefined && item.target !== undefined ? (
                  <p className="mt-1 text-xs text-text-3">
                    Current: {item.current} / Target: {item.target}
                    {item.shortfall ? ` | Shortfall: ${item.shortfall}` : ""}
                    {item.completion !== undefined ? ` | Completion: ${item.completion}%` : ""}
                  </p>
                ) : null}
              </div>
              <span className="text-sm text-text-2">{item.message}</span>
            </div>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}

function badgeClass(status: string) {
  if (status === "GREEN") return "text-brand-300";
  if (status === "RED") return "text-danger";
  if (status === "GREY") return "text-text-2";
  if (status === "BLUE") return "text-sky-300";
  return "text-warn";
}
