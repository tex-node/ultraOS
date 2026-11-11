import Link from "next/link";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { computeSeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import { compareTeams, type TeamComparisonResult } from "@/lib/analytics/team-comparison";
import { computeLeagueTeamDna, TEAM_DNA_DIMENSION_LABEL, type TeamDnaDimensionKey } from "@/lib/analytics/team-dna";
import { MatchupCardView } from "@/components/analytics/cards/MatchupCardView";
import { buildMatchupCard } from "@/lib/analytics/cards/game-cards";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DNA_KEYS: TeamDnaDimensionKey[] = ["SCORING", "SHOOTING", "PLAYMAKING", "REBOUNDING", "DEFENSE", "TRANSITION", "PAINT_ATTACK", "BENCH_PRODUCTION", "BALL_SECURITY"];

export default async function CompareTeams({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const organization = await resolveDefaultPublicOrganization();
  const season = await withOrganizationContext(organization.id, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-black">Compare Teams</h1>
        <p className="mt-4 text-text-2">No active season right now.</p>
      </main>
    );
  }

  const games = await withOrganizationContext(organization.id, (tx) => loadSeasonGameCores(season.id, tx));
  const totalsByTeam = computeSeasonTeamTotals(games);
  const options = [...totalsByTeam.values()].sort((x, y) => x.shortName.localeCompare(y.shortName));

  let result: TeamComparisonResult | null = null;
  if (a && b && a !== b) {
    const totalsA = totalsByTeam.get(a);
    const totalsB = totalsByTeam.get(b);
    if (totalsA && totalsB) {
      const dnaByTeam = computeLeagueTeamDna(games);
      result = compareTeams(totalsA, totalsB, dnaByTeam.get(a) ?? null, dnaByTeam.get(b) ?? null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[.3em] text-info">Season Zero</p>
      <h1 className="mt-2 text-3xl font-black sm:text-4xl">Compare Teams</h1>

      <form className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]" action="/public/stats/compare/teams">
        <select name="a" defaultValue={a ?? ""} className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm [color-scheme:dark]">
          <option value="" disabled>Select Team A</option>
          {options.map((t) => <option key={t.seasonClubId} value={t.seasonClubId}>{t.name}</option>)}
        </select>
        <span className="hidden self-center text-text-3 sm:block">vs</span>
        <select name="b" defaultValue={b ?? ""} className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm [color-scheme:dark]">
          <option value="" disabled>Select Team B</option>
          {options.map((t) => <option key={t.seasonClubId} value={t.seasonClubId}>{t.name}</option>)}
        </select>
        <button type="submit" className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-info sm:col-span-3">Compare</button>
      </form>

      {a && b && a === b ? <p className="mt-6 text-sm text-warn">Choose two different teams to compare.</p> : null}

      {result ? <TeamComparisonView result={result} /> : null}
    </main>
  );
}

function TeamComparisonView({ result }: { result: TeamComparisonResult }) {
  return (
    <div className="mt-10">
      <div className="grid grid-cols-2 gap-4">
        <TeamIdentityCard totals={result.a} />
        <TeamIdentityCard totals={result.b} />
      </div>

      {result.summary.length > 0 ? (
        <section className="mt-6 rounded-lg border border-info/20 bg-info/[.04] p-4 space-y-1.5">
          {result.summary.map((s, i) => <p key={i} className="text-sm text-text-1">{s}</p>)}
        </section>
      ) : null}

      {result.edges.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold tracking-tight">Head-to-Head Edges</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {result.edges.map((e) => (
              <div key={e.dimension} className="rounded-md border border-line bg-ink-800 p-3 text-center">
                <p className="text-[9px] uppercase tracking-wide text-text-3">{e.label}</p>
                <p className={`mt-1 text-sm font-bold ${e.result === "EVEN" || e.result === "INSUFFICIENT_SAMPLE" ? "text-text-3" : "text-info"}`}>
                  {e.result === "A" ? result.a.shortName : e.result === "B" ? result.b.shortName : e.result === "EVEN" ? "Even" : "—"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {result.edges.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight">Matchup Card</h2>
          <div className="mt-3 max-w-sm">
            <MatchupCardView card={buildMatchupCard(result, "BOX_SCORE_ONLY")} />
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight">Record &amp; Production</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          {result.metrics.map((m) => (
            <div key={m.metricId} className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-ink-800 px-3 py-2.5 text-sm last:border-0">
              <span className={`text-right font-semibold ${m.result === "A" ? "text-info" : "text-text-1"}`}>{m.aValue}</span>
              <span className="px-3 text-center text-[10px] uppercase tracking-wide text-text-3">{m.label}</span>
              <span className={`font-semibold ${m.result === "B" ? "text-info" : "text-text-1"}`}>{m.bValue}</span>
            </div>
          ))}
        </div>
      </section>

      {result.dnaA && result.dnaB ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight">Team DNA</h2>
          <div className="mt-3 space-y-2 rounded-lg border border-line bg-ink-800 p-4">
            {DNA_KEYS.map((key) => {
              const dimA = result.dnaA!.dimensions.find((d) => d.key === key)!;
              const dimB = result.dnaB!.dimensions.find((d) => d.key === key)!;
              const aHigher = dimA.index != null && dimB.index != null && dimA.index > dimB.index;
              const bHigher = dimA.index != null && dimB.index != null && dimB.index > dimA.index;
              return (
                <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center text-xs">
                  <span className={`text-right ${aHigher ? "font-bold text-info" : "text-text-2"}`}>{dimA.teamValue}</span>
                  <span className="px-3 text-center uppercase tracking-wide text-text-3">{TEAM_DNA_DIMENSION_LABEL[key]}</span>
                  <span className={`${bHigher ? "font-bold text-info" : "text-text-2"}`}>{dimB.teamValue}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="mt-8 text-sm text-text-3">Team DNA comparison unavailable — one or both clubs don&apos;t have enough games yet.</p>
      )}
    </div>
  );
}

function TeamIdentityCard({ totals }: { totals: TeamComparisonResult["a"] }) {
  return (
    <Link href={`/public/clubs/${totals.seasonClubId}`} className="block rounded-lg border border-line bg-ink-800 p-4 transition hover:border-cyan-400/40">
      <p className="text-lg font-black">{totals.name}</p>
      <p className="mt-2 text-xs text-text-3">{totals.wins}-{totals.losses} · {totals.gamesPlayed} game{totals.gamesPlayed === 1 ? "" : "s"}</p>
    </Link>
  );
}
