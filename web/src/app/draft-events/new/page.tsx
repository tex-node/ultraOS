import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createDraftEvent } from "@/app/draft-events/actions";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

const input = "mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white";

export default async function NewDraftEventPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/draft-events/new");
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:configure");
  const [seasons, events] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    tx.season.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    tx.event.findMany({ orderBy: { date: "desc" }, select: { id: true, name: true } }),
  ]));
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <h1 className="text-2xl font-semibold">Create Draft Day event</h1>
          <form action={createDraftEvent} className="mt-8 space-y-5">
            <label className="block text-sm text-zinc-300">Internal name<input className={input} name="name" required /></label>
            <label className="block text-sm text-zinc-300">Public title<input className={input} name="publicTitle" placeholder="Ultra Basketball Draft Day" /></label>
            <label className="block text-sm text-zinc-300">Season<select className={input} name="seasonId" required><option value="">Select season</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <label className="block text-sm text-zinc-300">Linked event<select className={input} name="eventId"><option value="">None</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
            <label className="block text-sm text-zinc-300">Sponsor name<input className={input} name="sponsorName" /></label>
            <label className="block text-sm text-zinc-300">Sponsor logo URL<input className={input} name="sponsorLogoUrl" /></label>
            <button className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">Create event</button>
          </form>
        </section>
      </main>
    </OperationsShell>
  );
}
