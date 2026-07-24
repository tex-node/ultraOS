import { OperationsShell } from "@/app/components/operations-shell";
import { StaffRole } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { assignSeasonClubCoach, clearSeasonClubCoach } from "../actions";

export default async function CoachAssignmentsPage() {
  const session = await requirePermission("staff:manage");
  const [seasonClubs, coaches] = await Promise.all([
    prisma.seasonClub.findMany({
      include: {
        assistantCoach: true,
        club: true,
        division: true,
        headCoach: true,
        season: true,
      },
      orderBy: [{ season: { startDate: "desc" } }, { division: { name: "asc" } }, { club: { name: "asc" } }],
    }),
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      where: { role: { in: [StaffRole.HEAD_COACH, StaffRole.ASSISTANT_COACH] } },
    }),
  ]);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-xs uppercase tracking-[.2em] text-emerald-400">SeasonClub staff</p>
          <h1 className="mt-2 text-3xl font-semibold">Coach assignments</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Assign coaches to a club&apos;s participation in a season. This intentionally writes to
            SeasonClub, not permanent Club identity.
          </p>
        </div>
        <section className="mt-8 grid gap-4">
          {seasonClubs.map((seasonClub) => (
            <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={seasonClub.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{seasonClub.club.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {seasonClub.season.name} - {seasonClub.division.name}
                  </p>
                </div>
                <div className="text-sm text-zinc-400">
                  <p>Head: {seasonClub.headCoach?.name ?? "Unassigned"}</p>
                  <p>Assistant: {seasonClub.assistantCoach?.name ?? "Unassigned"}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <CoachAssignmentForm
                  assignmentType="head"
                  coaches={coaches}
                  seasonClubId={seasonClub.id}
                />
                <CoachAssignmentForm
                  assignmentType="assistant"
                  coaches={coaches}
                  seasonClubId={seasonClub.id}
                />
              </div>
            </article>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}

function CoachAssignmentForm({
  assignmentType,
  coaches,
  seasonClubId,
}: {
  assignmentType: "head" | "assistant";
  coaches: { id: string; name: string; role: StaffRole }[];
  seasonClubId: string;
}) {
  return (
    <div className="rounded-xl border border-white/[.06] bg-black/20 p-4">
      <p className="text-sm font-semibold capitalize">{assignmentType} coach</p>
      <form action={assignSeasonClubCoach} className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <input name="seasonClubId" type="hidden" value={seasonClubId} />
        <input name="assignmentType" type="hidden" value={assignmentType} />
        <select
          className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm"
          name="staffId"
          required
        >
          <option value="">Select coach</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.name} ({coach.role.replace("_", " ")})
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">
          Assign
        </button>
      </form>
      <form action={clearSeasonClubCoach} className="mt-2">
        <input name="seasonClubId" type="hidden" value={seasonClubId} />
        <input name="assignmentType" type="hidden" value={assignmentType} />
        <button className="text-xs text-zinc-500 hover:text-rose-300">Clear assignment</button>
      </form>
    </div>
  );
}
