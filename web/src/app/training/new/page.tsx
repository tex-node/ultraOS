import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createTrainingSession } from "@/app/training/actions";
import { TrainingSessionType } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function NewTrainingSessionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/training/new");
  if (!hasPermission(session.user.roles, "training:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const [seasons, seasonClubs] = await Promise.all([prisma.season.findMany({ orderBy: { startDate: "desc" } }), prisma.seasonClub.findMany({ include: { club: true, division: true }, orderBy: { club: { name: "asc" } } })]);
  return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-3xl font-semibold">New Training Session</h1><form action={createTrainingSession} className="mt-8 grid gap-4 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="title" placeholder="Session title" required /><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="sessionType">{Object.values(TrainingSessionType).map((type) => <option key={type} value={type}>{type}</option>)}</select><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="occurredAt" type="datetime-local" required /><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="seasonId"><option value="">Season</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="seasonClubId"><option value="">SeasonClub</option>{seasonClubs.map((club) => <option key={club.id} value={club.id}>{club.club.name} | {club.division.name}</option>)}</select><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="location" placeholder="Location" /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Create</button></form></main></OperationsShell>;
}
