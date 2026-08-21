import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { setCheckInStatusAction } from "./actions";
import { requireAnyPermission } from "@/lib/authorization";
import { getCheckInStatuses, type CheckInStatus } from "@/lib/game-day-checkin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_STYLE: Record<CheckInStatus, string> = {
  PRESENT: "bg-emerald-400 text-zinc-950",
  LATE: "bg-amber-400 text-zinc-950",
  ABSENT: "border border-rose-400/40 text-rose-300",
  UNAVAILABLE: "border border-rose-400/40 text-rose-300",
};

export default async function GameDayCheckIn() {
  const session = await requireAnyPermission(["game:operate", "check-in:operate"]);
  const event = await prisma.event.findFirst({ where: { status: { in: ["PUBLISHED", "IN_PROGRESS"] } }, orderBy: { startTime: "asc" } });

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } });
  const seasonClubs = season
    ? await prisma.seasonClub.findMany({
        where: { seasonId: season.id, status: "ACTIVE" },
        include: { club: true, players: { include: { athlete: true }, orderBy: { athlete: { firstName: "asc" } } } },
        orderBy: { club: { name: "asc" } },
      })
    : [];

  const statuses = event ? await getCheckInStatuses(event.id) : {};

  const totals = { present: 0, late: 0, absent: 0, unavailable: 0, notCheckedIn: 0, rostered: 0 };
  for (const seasonClub of seasonClubs) {
    for (const player of seasonClub.players) {
      totals.rostered++;
      const status = statuses[player.id]?.status;
      if (status === "PRESENT") totals.present++;
      else if (status === "LATE") totals.late++;
      else if (status === "ABSENT") totals.absent++;
      else if (status === "UNAVAILABLE") totals.unavailable++;
      else totals.notCheckedIn++;
    }
  }

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link href="/gameday" className="text-sm text-zinc-400">Back to control center</Link>
        <h1 className="mt-2 text-3xl font-bold">Player check-in</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Game Day attendance only — marking a player Absent or Unavailable here does not change their permanent club roster.
        </p>
        {!event ? <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-300">No published event found for Season Zero.</p> : null}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Rostered" value={totals.rostered} />
          <Stat label="Present" value={totals.present} tone="text-emerald-400" />
          <Stat label="Late" value={totals.late} tone="text-amber-400" />
          <Stat label="Absent" value={totals.absent} tone="text-rose-400" />
          <Stat label="Not checked in" value={totals.notCheckedIn} tone="text-zinc-500" />
        </div>

        <div className="mt-8 space-y-8">
          {seasonClubs.map((seasonClub) => {
            const present = seasonClub.players.filter((p) => statuses[p.id]?.status === "PRESENT").length;
            return (
              <section key={seasonClub.id}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{seasonClub.club.name}</h2>
                  <span className="text-xs text-zinc-500">{present} / {seasonClub.players.length} present</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {seasonClub.players.map((player) => {
                    const current = statuses[player.id]?.status;
                    return (
                      <div key={player.id} className="flex items-center justify-between rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
                        <span className="text-sm">{player.athlete.firstName} {player.athlete.lastName}</span>
                        <div className="flex gap-1">
                          {(["PRESENT", "LATE", "ABSENT", "UNAVAILABLE"] as const).map((status) => (
                            <form key={status} action={setCheckInStatusAction}>
                              <input type="hidden" name="eventId" value={event?.id ?? ""} />
                              <input type="hidden" name="playerId" value={player.id} />
                              <input type="hidden" name="status" value={status} />
                              <SubmitButton
                                disabled={!event}
                                className={`min-h-[36px] rounded-lg px-2 text-[10px] font-semibold uppercase tracking-wider transition ${current === status ? STATUS_STYLE[status] : "border border-white/10 text-zinc-500"}`}
                              >
                                {status === "UNAVAILABLE" ? "N/A" : status.slice(0, 4)}
                              </SubmitButton>
                            </form>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </OperationsShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3 text-center">
      <p className={`font-mono text-2xl font-bold ${tone ?? ""}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}
