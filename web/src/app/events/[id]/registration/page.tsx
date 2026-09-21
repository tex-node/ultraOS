import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganizationOrRedirect } from "@/lib/authorization";
import { getEventRegistrationConfig } from "@/lib/registration/service";
import { parseSportConfig } from "@/lib/registration/sport-config";
import { SportConfigForm } from "./sport-config-form";

export const dynamic = "force-dynamic";

export default async function EventRegistrationConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, organizationId } = await requirePermissionWithOrganizationOrRedirect("event:manage", `/events/${id}/registration`);
  const result = await getEventRegistrationConfig(organizationId, id);
  if (!result) notFound();
  const { event, form } = result;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link className="text-sm text-text-2" href={`/events/${id}`}>Back to event</Link>
        <p className="mt-6 text-xs uppercase tracking-[.24em] text-brand-400">Registration configuration</p>
        <h1 className="mt-2 text-3xl font-semibold">{event.name}</h1>
        <p className="mt-2 text-sm text-text-2">
          Configure the sports and roster rules for this event&apos;s team registration.
          {form ? ` ${form._count.submissions} submission(s), ${form._count.fields} custom field(s).` : " No registration form yet - saving will create one."}
        </p>
        <SportConfigForm
          eventId={id}
          existing={form ? {
            title: form.title,
            description: form.description,
            status: form.status,
            publicEnabled: form.publicEnabled,
            capacity: form.capacity,
            opensAt: form.opensAt?.toISOString() ?? null,
            closesAt: form.closesAt?.toISOString() ?? null,
            config: parseSportConfig(form.sportConfig),
          } : null}
        />
      </main>
    </OperationsShell>
  );
}
