import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionOrRedirect } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import {
  reconcileLine,
  reconcilePlayers,
  summarizeGameReconciliation,
  type ComparableStatField,
  type StatSourceLine,
  type TeamReconciliation,
} from "@/lib/native-vs-official-reconciliation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PLAYER_FIELDS: ComparableStatField[] = ["points", "rebounds", "assists", "steals", "blocks", "turnovers", "fouls"];
const TEAM_FIELDS: ComparableStatField[] = ["points", "rebounds", "assists", "turnovers", "fouls", "fieldGoalsMade", "fieldGoalsAttempted", "offensiveRebounds", "defensiveRebounds"];

const STATE_TONE: Record<string, string> = {
  MATCH: "text-emerald-400", FULL_MATCH: "text-emerald-400",
  MISMATCH: "text-rose-400",
  NATIVE_ONLY: "text-sky-400", PARTIAL_MATCH: "text-amber-400",
  OFFICIAL_ONLY: "text-violet-400",
  NOT_COMPARABLE: "text-zinc-600", INSUFFICIENT_DATA: "text-zinc-500",
};

export default async function ReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { fixtureId } = await params;
  const session = await requirePermissionOrRedirect("result:confirm", `/games/${fixtureId}/stats/reconciliation`);
  const query = await searchParams;

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: {
      homeSeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      awaySeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      game: { include: { playerStats: true, teamStats: true } },
    },
  });
  if (!fixture) notFound();
  const game = fixture.game;
  if (!game) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-4 py-8"><p className="text-zinc-400">This game has no data yet.</p></main>
      </OperationsShell>
    );
  }

  const nativePlayerLines = new Map<string, StatSourceLine>();
  for (const s of game.playerStats) {
    nativePlayerLines.set(s.playerId, {
      points: s.points, rebounds: s.rebounds, assists: s.assists, steals: s.steals, blocks: s.blocks,
      turnovers: s.turnovers, fouls: s.fouls, fieldGoalsMade: s.fieldGoalsMade, fieldGoalsAttempted: s.fieldGoalsAttempted,
      threePointsMade: s.threePointsMade, threePointsAttempted: s.threePointsAttempted,
      freeThrowsMade: s.freeThrowsMade, freeThrowsAttempted: s.freeThrowsAttempted,
      offensiveRebounds: s.offensiveRebounds, defensiveRebounds: s.defensiveRebounds,
      fourPointsMade: s.fourPointsMade, fourPointsAttempted: s.fourPointsAttempted,
    });
  }

  const allPlayers = [...fixture.homeSeasonClub.players, ...fixture.awaySeasonClub.players].filter((p) => nativePlayerLines.has(p.id));

  // Official comparison values are read from the query string only - this page never writes
  // anything to PlayerStat/TeamStat or any other table. A comparison is purely ephemeral,
  // computed fresh on every render from whatever was typed into the form.
  const officialPlayerLines = new Map<string, StatSourceLine>();
  for (const p of allPlayers) {
    const line: StatSourceLine = {};
    let any = false;
    for (const field of PLAYER_FIELDS) {
      const raw = query[`official_${p.id}_${field}`];
      if (raw !== undefined && raw !== "") { line[field] = Number(raw); any = true; }
    }
    if (any) officialPlayerLines.set(p.id, line);
  }

  const playerResults = allPlayers.length > 0
    ? reconcilePlayers(nativePlayerLines, officialPlayerLines).filter((r) => nativePlayerLines.has(r.playerId))
    : [];
  // Restrict the field set actually displayed to the ones this page's form collects.
  const playerResultsScoped = playerResults.map((r) => ({ ...r, fields: r.fields.filter((f) => PLAYER_FIELDS.includes(f.field)) }));

  function teamNativeLine(seasonClubId: string): StatSourceLine {
    const t = game!.teamStats.find((ts) => ts.seasonClubId === seasonClubId);
    const players = game!.playerStats.filter((s) => s.seasonClubId === seasonClubId);
    const sum = (field: "fieldGoalsMade" | "fieldGoalsAttempted" | "offensiveRebounds" | "defensiveRebounds") => {
      const values = players.map((p) => p[field]).filter((v): v is number => typeof v === "number");
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
    };
    return {
      points: t?.points ?? null, rebounds: t?.rebounds ?? null, assists: t?.assists ?? null, turnovers: t?.turnovers ?? null, fouls: t?.fouls ?? null,
      fieldGoalsMade: sum("fieldGoalsMade"), fieldGoalsAttempted: sum("fieldGoalsAttempted"),
      offensiveRebounds: sum("offensiveRebounds"), defensiveRebounds: sum("defensiveRebounds"),
    };
  }

  function officialTeamLine(seasonClubId: string): StatSourceLine {
    const line: StatSourceLine = {};
    for (const field of TEAM_FIELDS) {
      const raw = query[`official_team_${seasonClubId}_${field}`];
      if (raw !== undefined && raw !== "") line[field] = Number(raw);
    }
    return line;
  }

  const teamResults: TeamReconciliation[] = [fixture.homeSeasonClub, fixture.awaySeasonClub].map((team) => {
    const native = teamNativeLine(team.id);
    const official = officialTeamLine(team.id);
    const hasOfficial = Object.keys(official).length > 0;
    return { seasonClubId: team.id, ...(hasOfficial ? reconcileLine(native, official, TEAM_FIELDS) : { fields: [], state: "INSUFFICIENT_DATA" as const }) };
  });

  const summary = summarizeGameReconciliation(playerResultsScoped.filter((r) => officialPlayerLines.has(r.playerId)), teamResults.filter((r) => r.fields.length > 0));
  const hasAnyOfficialInput = officialPlayerLines.size > 0 || teamResults.some((r) => r.fields.length > 0);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="flex items-center justify-between py-3">
          <Link href={`/games/${fixtureId}/stats`} className="text-sm text-zinc-400">Back to statistician console</Link>
        </div>

        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h1 className="text-lg font-semibold">Native vs. official reconciliation</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {fixture.homeSeasonClub.club.shortName} vs {fixture.awaySeasonClub.club.shortName}. Native totals below come from this
            game&apos;s own materialized statistics. Enter official/PDF numbers to compare — nothing on this page is ever written to
            the database; every comparison is computed fresh from what you type in.
          </p>
          {hasAnyOfficialInput ? (
            <p className={`mt-3 text-sm font-semibold ${STATE_TONE[summary.overallState]}`}>Overall: {summary.overallState.replace("_", " ")}</p>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No official values entered yet — enter numbers below to compare.</p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="font-semibold">Team totals</h2>
          <form method="get" className="mt-4 grid gap-6 lg:grid-cols-2">
            {[fixture.homeSeasonClub, fixture.awaySeasonClub].map((team) => {
              const native = teamNativeLine(team.id);
              const result = teamResults.find((r) => r.seasonClubId === team.id)!;
              return (
                <div key={team.id} className="rounded-xl border border-white/10 p-3">
                  <p className="font-semibold">{team.club.shortName}</p>
                  {result.fields.length > 0 ? <p className={`text-xs font-semibold ${STATE_TONE[result.state]}`}>{result.state.replace("_", " ")}</p> : null}
                  <table className="mt-2 w-full text-xs">
                    <thead><tr className="text-left text-zinc-500"><th className="py-1">Field</th><th>Native</th><th>Official</th><th>State</th></tr></thead>
                    <tbody>
                      {TEAM_FIELDS.map((field) => {
                        const comparison = result.fields.find((f) => f.field === field);
                        return (
                          <tr key={field} className="border-t border-white/[.06]">
                            <td className="py-1 text-zinc-400">{field}</td>
                            <td className="text-zinc-200">{native[field] ?? "—"}</td>
                            <td>
                              <input type="number" name={`official_team_${team.id}_${field}`} defaultValue={query[`official_team_${team.id}_${field}`] ?? ""} className="w-16 rounded bg-white/[.06] px-1 py-0.5 text-zinc-100" />
                            </td>
                            <td className={comparison ? STATE_TONE[comparison.state] : "text-zinc-600"}>{comparison?.state.replace("_", " ") ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            <div className="lg:col-span-2">
              <button type="submit" className="min-h-[44px] rounded-lg border border-emerald-400/30 px-5 text-sm font-semibold text-emerald-300">Compare</button>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="font-semibold">Player totals</h2>
          {allPlayers.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No native player statistics exist for this game yet.</p> : null}
          {allPlayers.length > 0 ? (
            <form method="get" className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="py-1">Player</th>
                    {PLAYER_FIELDS.map((f) => <th key={f} colSpan={2}>{f}</th>)}
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {allPlayers.map((p) => {
                    const native = nativePlayerLines.get(p.id)!;
                    const result = playerResultsScoped.find((r) => r.playerId === p.id);
                    return (
                      <tr key={p.id} className="border-t border-white/[.06]">
                        <td className="py-1 text-zinc-300">{p.athlete.firstName} {p.athlete.lastName}</td>
                        {PLAYER_FIELDS.map((field) => (
                          <td key={field} colSpan={2} className="whitespace-nowrap">
                            <span className="text-zinc-200">{native[field] ?? "—"}</span>{" "}
                            <input type="number" name={`official_${p.id}_${field}`} defaultValue={query[`official_${p.id}_${field}`] ?? ""} className="w-12 rounded bg-white/[.06] px-1 py-0.5 text-zinc-100" />
                          </td>
                        ))}
                        <td className={result && officialPlayerLines.has(p.id) ? STATE_TONE[result.state] : "text-zinc-600"}>
                          {result && officialPlayerLines.has(p.id) ? result.state.replace("_", " ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button type="submit" className="mt-4 min-h-[44px] rounded-lg border border-emerald-400/30 px-5 text-sm font-semibold text-emerald-300">Compare</button>
            </form>
          ) : null}
        </section>
      </main>
    </OperationsShell>
  );
}
