import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { saveEventDebrief, saveVendorReview, saveVolunteerReview } from "@/app/events/[id]/debrief/actions";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { formatLagosDate } from "@/lib/format-datetime";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EventDebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const session = await requirePermissionOrRedirect("event:manage", `/events/${eventId}/debrief`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const [event, debrief, vendors, vendorReviews, volunteers, volunteerReviews, gateCheckIns] = await withOrganizationContext(organizationId, async (tx) => {
    const eventRow = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, date: true } });
    if (!eventRow) return [null, null, [], [], [], [], [{ count: BigInt(0) }]] as const;
    return Promise.all([
      Promise.resolve(eventRow),
      tx.eventDebrief.findUnique({ where: { eventId } }),
      tx.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      tx.eventVendorReview.findMany({ where: { eventId } }),
      tx.user.findMany({ where: { roles: { some: { role: "VOLUNTEER", revokedAt: null } } }, orderBy: { name: "asc" } }),
      tx.eventVolunteerReview.findMany({ where: { eventId } }),
      tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM "CheckIn" ci
        WHERE ci."organizationId" = ${organizationId}
          AND ci.type = 'VENUE_ENTRY'
          AND (
            ci."ticketId" IN (SELECT t.id FROM "Ticket" t JOIN "SeatReservation" sr ON sr.id = t."reservationId" WHERE sr."eventId" = ${eventId})
            OR ci."accreditationId" IN (SELECT a.id FROM "Accreditation" a WHERE a."eventId" = ${eventId})
          )
      `,
    ]);
  });
  if (!event) notFound();

  const vendorReviewByVendor = new Map(vendorReviews.map((r) => [r.vendorId, r]));
  const volunteerReviewByVolunteer = new Map(volunteerReviews.map((r) => [r.volunteerId, r]));
  const gateCount = Number(gateCheckIns[0]?.count ?? 0);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link className="text-sm text-text-2" href={`/events/${eventId}`}>Back to event</Link>
        <p className="mt-6 text-xs uppercase tracking-[.2em] text-brand-400">Post-event debrief</p>
        <h1 className="mt-2 text-3xl font-semibold">{event.name}</h1>
        <p className="mt-2 text-sm text-text-2">{formatLagosDate(event.date)} — record how the event actually went, to refine the next edition.</p>

        <section className="mt-8 rounded-lg border border-line bg-ink-800 p-6">
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="mt-2 text-sm text-text-2">
            Gate check-ins recorded (automatic, from ticket/accreditation scans at the door): <b className="text-brand-400">{gateCount}</b>
          </p>
          <form action={saveEventDebrief.bind(null, eventId)} className="mt-4 grid gap-4">
            <label className="block text-sm text-text-1">
              Actual attendance (manual final headcount, if different from gate scans)
              <input className="mt-2 w-full max-w-xs rounded-md border border-line bg-ink-900 p-3" defaultValue={debrief?.actualAttendance ?? ""} name="actualAttendance" type="number" />
            </label>
            <label className="block text-sm text-text-1">
              Weather conditions
              <input className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" defaultValue={debrief?.weatherConditions ?? ""} name="weatherConditions" />
            </label>
            <label className="block text-sm text-text-1">
              What went well
              <textarea className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" defaultValue={debrief?.whatWentWell ?? ""} name="whatWentWell" rows={3} />
            </label>
            <label className="block text-sm text-text-1">
              What to improve for next edition
              <textarea className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" defaultValue={debrief?.whatToImprove ?? ""} name="whatToImprove" rows={3} />
            </label>
            <label className="block text-sm text-text-1">
              General notes
              <textarea className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" defaultValue={debrief?.generalNotes ?? ""} name="generalNotes" rows={3} />
            </label>
            <button className="w-fit rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Save overview</button>
          </form>
        </section>

        <section className="mt-8 rounded-lg border border-line bg-ink-800 p-6">
          <h2 className="text-lg font-semibold">Vendor performance</h2>
          {vendors.length === 0 ? <p className="mt-2 text-sm text-text-3">No active vendors on file.</p> : null}
          <div className="mt-4 space-y-4">
            {vendors.map((vendor) => {
              const review = vendorReviewByVendor.get(vendor.id);
              return (
                <details className="rounded-md border border-line bg-ink-900 p-4" key={vendor.id}>
                  <summary className="cursor-pointer text-sm font-semibold">
                    {vendor.name}
                    {review ? <span className="ml-2 text-xs font-normal text-brand-400">rated {review.rating ?? "-"}/5</span> : null}
                  </summary>
                  <form action={saveVendorReview.bind(null, eventId, vendor.id)} className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="block text-xs text-text-2">
                      Rating (1-5)
                      <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={review?.rating ?? ""} max={5} min={1} name="rating" type="number" />
                    </label>
                    <label className="block text-xs text-text-2">
                      Would invite back
                      <select className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={review?.wouldInviteBack === null || review?.wouldInviteBack === undefined ? "" : String(review.wouldInviteBack)} name="wouldInviteBack">
                        <option value="">Not set</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </label>
                    <label className="block text-xs text-text-2 md:col-span-2">
                      Notes
                      <textarea className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={review?.notes ?? ""} name="notes" rows={2} />
                    </label>
                    <button className="md:col-span-2 rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs text-brand-300">Save</button>
                  </form>
                </details>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-line bg-ink-800 p-6">
          <h2 className="text-lg font-semibold">Volunteer performance</h2>
          {volunteers.length === 0 ? <p className="mt-2 text-sm text-text-3">No volunteers on file.</p> : null}
          <div className="mt-4 space-y-4">
            {volunteers.map((volunteer) => {
              const review = volunteerReviewByVolunteer.get(volunteer.id);
              return (
                <details className="rounded-md border border-line bg-ink-900 p-4" key={volunteer.id}>
                  <summary className="cursor-pointer text-sm font-semibold">
                    {volunteer.name}
                    {review ? <span className="ml-2 text-xs font-normal text-brand-400">rated {review.rating ?? "-"}/5</span> : null}
                  </summary>
                  <form action={saveVolunteerReview.bind(null, eventId, volunteer.id)} className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="block text-xs text-text-2">
                      Role on the day
                      <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={review?.roleDescription ?? ""} name="roleDescription" />
                    </label>
                    <label className="block text-xs text-text-2">
                      Rating (1-5)
                      <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={review?.rating ?? ""} max={5} min={1} name="rating" type="number" />
                    </label>
                    <label className="block text-xs text-text-2 md:col-span-2">
                      Notes
                      <textarea className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={review?.notes ?? ""} name="notes" rows={2} />
                    </label>
                    <button className="md:col-span-2 rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs text-brand-300">Save</button>
                  </form>
                </details>
              );
            })}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}
