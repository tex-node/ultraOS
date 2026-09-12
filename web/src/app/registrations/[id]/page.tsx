import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { RegistrationSubmissionStatus } from "@/generated/prisma/enums";
import { requirePermissionWithOrganizationOrRedirect } from "@/lib/authorization";
import { getRegistration } from "@/lib/registration/service";
import { updateRegistrationStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function RegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, organizationId } = await requirePermissionWithOrganizationOrRedirect("event:manage", `/registrations/${id}`);
  const registration = await getRegistration(organizationId, id);
  if (!registration) notFound();

  const volleyball = registration.participants.filter((participant) => participant.sportMemberships.some((membership) => membership.sport === "VOLLEYBALL"));
  const flagRace = registration.participants.filter((participant) => participant.sportMemberships.some((membership) => membership.sport === "FLAG_RACE"));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link className="text-sm text-zinc-400" href="/registrations">Back to registrations</Link>
        <p className="mt-6 font-mono text-xs text-emerald-400">{registration.referenceNumber}</p>
        <h1 className="mt-1 text-3xl font-semibold">{registration.teamName ?? "Team registration"}</h1>
        <p className="mt-2 text-sm text-zinc-400">{registration.teamClubOrSchool ?? "—"} · {registration.teamCategory ?? "No category"} · {registration.status}</p>

        <form action={updateRegistrationStatusAction.bind(null, registration.id)} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[200px_1fr_auto]">
          <select name="status" defaultValue={registration.status} className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm">
            {Object.values(RegistrationSubmissionStatus).map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <input name="reviewNotes" defaultValue={registration.reviewNotes ?? ""} placeholder="Review notes" className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" />
          <button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Update status</button>
        </form>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          <Roster title="Volleyball roster" count={volleyball.length} participants={volleyball} showActive />
          <Roster title="Flag Race roster" count={flagRace.length} participants={flagRace} ordered />
        </section>

        <p className="mt-6 text-xs text-zinc-500">Dual-sport children appear on both rosters; they are one participant record with two sport memberships.</p>
      </main>
    </OperationsShell>
  );
}

function Roster({ title, count, participants, showActive = false, ordered = false }: {
  title: string;
  count: number;
  participants: { id: string; fullName: string; dateOfBirth: Date | null; gender: string | null; guardianName: string | null; consentAccepted: boolean; sportMemberships: { sport: string; rosterOrder: number; isActive: boolean }[] }[];
  showActive?: boolean;
  ordered?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <h2 className="text-lg font-semibold">{title} <span className="text-sm text-zinc-500">({count})</span></h2>
      <div className="mt-4 space-y-2">
        {participants.length === 0 ? <p className="text-sm text-zinc-500">Empty.</p> : participants.map((participant) => {
          const membership = participant.sportMemberships.find((item) => (showActive ? item.sport === "VOLLEYBALL" : item.sport === "FLAG_RACE"));
          return (
            <div key={participant.id} className="rounded-xl border border-white/[.06] bg-black/20 p-3 text-sm">
              <b>{participant.fullName}</b>
              <p className="text-xs text-zinc-500">
                {participant.dateOfBirth ? participant.dateOfBirth.toISOString().slice(0, 10) : "No DOB"} · {participant.gender ?? "—"}
                {ordered && membership ? ` · order ${membership.rosterOrder}` : ""}
                {showActive && membership ? membership.isActive ? " · active" : " · substitute" : ""}
                {participant.consentAccepted ? " · consent" : " · NO CONSENT"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
