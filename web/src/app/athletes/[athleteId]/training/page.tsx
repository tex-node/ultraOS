import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AthleteTrainingPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const session = await auth();
  const { athleteId } = await params;
  if (!session?.user) redirect(`/login?callbackUrl=/athletes/${athleteId}/training`);
  if (!hasPermission(session.user.roles, "training:read")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const athlete = await prisma.athlete.findFirst({
    where: athleteId.startsWith("UBA-") ? { ultraAthleteId: athleteId } : { id: athleteId },
    include: { trainingRecords: { include: { trainingSession: true, metrics: { include: { metricDefinition: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!athlete) notFound();
  const canViewPrivate = hasPermission(session.user.roles, "training:view-private-notes");
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link className="text-sm text-emerald-400" href={`/players/${athlete.ultraAthleteId ?? athlete.id}`}>Back to athlete</Link>
        <h1 className="mt-4 text-3xl font-semibold">Training History</h1>
        <p className="mt-2 text-sm text-zinc-400">{athlete.firstName} {athlete.lastName} | {athlete.ultraAthleteId ?? "Ultra ID pending"}</p>
        <section className="mt-8 grid gap-3">{athlete.trainingRecords.map((record) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={record.id}><p className="font-semibold">{record.trainingSession.title}</p><p className="text-sm text-zinc-400">{record.attendanceStatus} | {record.trainingSession.sessionType}</p><p className="mt-2 text-sm">{record.publicSummary ?? (canViewPrivate ? record.performanceNotes ?? record.developmentFocus : "Private notes hidden")}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">{record.metrics.map((metric) => <span className="rounded-lg border border-white/10 px-2 py-1" key={metric.id}>{metric.metricDefinition.name}: {metric.numericValue?.toString() ?? metric.textValue ?? String(metric.booleanValue ?? "")}</span>)}</div></article>)}</section>
      </main>
    </OperationsShell>
  );
}
