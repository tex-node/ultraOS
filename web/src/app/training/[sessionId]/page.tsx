import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { recordTrainingAttendance } from "@/app/training/actions";
import { TrainingAttendanceStatus } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: previously read a training session (and every roster candidate for the
// attendance form) via the bare, unscoped client - an Org B "training:read" holder could view
// Org A's training session detail, attendance, and (private-notes-permitted) performance notes.
// Scoped to the acting user's own organization.
export default async function TrainingSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/training/${sessionId}`);
  if (!hasPermission(session.user.roles, "training:read")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const training = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.trainingSession.findUnique({ where: { id: sessionId }, include: { participants: { include: { athlete: true } }, seasonClub: { include: { club: true, players: { include: { athlete: true } } } } } }),
  );
  if (!training) redirect("/training");
  return <OperationsShell user={session.user}><main className="mx-auto max-w-5xl px-6 py-10"><h1 className="text-3xl font-semibold">{training.title}</h1><p className="mt-2 text-sm text-zinc-400">{training.sessionType} | {training.seasonClub?.club.name ?? "No club"}</p>{hasPermission(session.user.roles, "training:record") ? <form action={recordTrainingAttendance.bind(null, training.id)} className="mt-8 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[1fr_180px_1fr_auto]"><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="athleteId" required>{training.seasonClub?.players.map((player) => <option key={player.athlete.id} value={player.athlete.id}>{player.athlete.firstName} {player.athlete.lastName}</option>)}</select><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="attendanceStatus">{Object.values(TrainingAttendanceStatus).map((status) => <option key={status} value={status}>{status}</option>)}</select><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="developmentFocus" placeholder="Development focus" /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Record</button></form> : null}<section className="mt-8 grid gap-3">{training.participants.map((record) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={record.id}><b>{record.athlete.firstName} {record.athlete.lastName}</b><p className="text-sm text-zinc-400">{record.attendanceStatus} | {record.developmentFocus ?? "No focus"}</p></article>)}</section></main></OperationsShell>;
}
