import Link from "next/link";
import { findPlayerMetric, isPlayerMetricQualified, type PlayerMetricId } from "@/lib/analytics/analytics-metrics";
import { loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import type { SeasonPlayerTotals } from "@/lib/analytics/league-analytics";
import { computePlayerArchetype, PLAYER_ARCHETYPE_LABEL, type PlayerArchetype } from "@/lib/analytics/player-archetype";
import { computeLeaguePlayerDna } from "@/lib/analytics/player-dna";
import { playerSampleQualification, SAMPLE_CONFIDENCE_LABEL } from "@/lib/analytics/qualification";
import type { QualificationState } from "@/lib/analytics/types";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SORT_OPTIONS: { id: PlayerMetricId | "GAMES"; label: string }[] = [
  { id: "PPG", label: "Points Per Game" },
  { id: "RPG", label: "Rebounds Per Game" },
  { id: "APG", label: "Assists Per Game" },
  { id: "SPG", label: "Steals Per Game" },
  { id: "BPG", label: "Blocks Per Game" },
  { id: "FG_PCT", label: "Field Goal %" },
  { id: "EFFECTIVE_EFFICIENCY", label: "Effective Efficiency" },
  { id: "GAMES", label: "Games Played" },
];

type SearchParams = { q?: string; club?: string; minGames?: string; archetype?: string; confidence?: string; sort?: string };

export default async function PlayerDiscovery({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const organization = await resolveDefaultPublicOrganization();
  const season = await withOrganizationContext(organization.id, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-black">Players</h1>
        <p className="mt-4 text-text-2">No active season right now.</p>
      </main>
    );
  }

  const totals = await withOrganizationContext(organization.id, (tx) => loadSeasonPlayerTotals(season.id, tx));
  const dnaByPlayer = computeLeaguePlayerDna(totals);
  const clubs = [...new Set(totals.map((t) => t.seasonClubShortName))].sort();

  const sortId = (SORT_OPTIONS.find((s) => s.id === params.sort)?.id ?? "PPG") as PlayerMetricId | "GAMES";
  const minGames = params.minGames ? Number(params.minGames) : 0;
  const query = (params.q ?? "").trim().toLowerCase();

  let rows = totals.map((t) => {
    const dna = dnaByPlayer.get(t.playerId) ?? null;
    const archetype = dna ? computePlayerArchetype(dna).primary : null;
    return { totals: t, dna, archetype, qualification: playerSampleQualification(t.gamesPlayed) };
  });

  if (query) rows = rows.filter((r) => r.totals.name.toLowerCase().includes(query) || r.totals.seasonClubShortName.toLowerCase().includes(query));
  if (params.club) rows = rows.filter((r) => r.totals.seasonClubShortName === params.club);
  if (minGames > 0) rows = rows.filter((r) => r.totals.gamesPlayed >= minGames);
  if (params.archetype) rows = rows.filter((r) => r.archetype === params.archetype);
  if (params.confidence) rows = rows.filter((r) => r.qualification === params.confidence);

  const sorted = sortRows(rows, sortId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[.3em] text-info">Season Zero</p>
      <h1 className="mt-2 text-3xl font-black sm:text-4xl">Players</h1>
      <p className="mt-2 text-sm text-text-3">{sorted.length} of {totals.length} players</p>

      <form className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" action="/public/stats/players">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search name or club"
          className="col-span-2 rounded-md border border-line bg-ink-800 px-3 py-2 text-sm placeholder:text-text-3 lg:col-span-2"
        />
        <select name="club" defaultValue={params.club ?? ""} className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm [color-scheme:dark]">
          <option value="">All Clubs</option>
          {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="minGames" defaultValue={params.minGames ?? ""} className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm [color-scheme:dark]">
          <option value="">Any Games</option>
          <option value="1">1+ games</option>
          <option value="2">2+ games</option>
          <option value="3">3+ games</option>
        </select>
        <select name="confidence" defaultValue={params.confidence ?? ""} className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm [color-scheme:dark]">
          <option value="">Any Sample</option>
          {(["QUALIFIED", "DEVELOPING_PROFILE", "INSUFFICIENT_SAMPLE"] as QualificationState[]).map((q) => (
            <option key={q} value={q}>{SAMPLE_CONFIDENCE_LABEL[q]}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sortId} className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm [color-scheme:dark]">
          {SORT_OPTIONS.map((s) => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
        </select>
        <button type="submit" className="col-span-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-info sm:col-span-1 lg:col-span-6">
          Apply
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {sorted.map((r) => (
          <PlayerRow key={r.totals.playerId} row={r} />
        ))}
        {sorted.length === 0 ? <p className="py-8 text-center text-sm text-text-3">No players match these filters.</p> : null}
      </div>
    </main>
  );
}

type PlayerDiscoveryRow = { totals: SeasonPlayerTotals; dna: ReturnType<typeof computeLeaguePlayerDna> extends Map<string, infer V> ? V | null : never; archetype: PlayerArchetype | null; qualification: QualificationState };

function sortRows(rows: PlayerDiscoveryRow[], sortId: PlayerMetricId | "GAMES") {
  if (sortId === "GAMES") return [...rows].sort((a, b) => b.totals.gamesPlayed - a.totals.gamesPlayed);
  const metric = findPlayerMetric(sortId);
  return [...rows]
    .map((r) => ({ ...r, sortValue: isPlayerMetricQualified(metric, r.totals) ? metric.getValue(r.totals) : null }))
    .sort((a, b) => {
      if (a.sortValue == null && b.sortValue == null) return 0;
      if (a.sortValue == null) return 1;
      if (b.sortValue == null) return -1;
      return b.sortValue - a.sortValue;
    });
}

function PlayerRow({ row }: { row: PlayerDiscoveryRow }) {
  const { totals, archetype, qualification } = row;
  const ppg = totals.gamesPlayed > 0 ? (totals.points / totals.gamesPlayed).toFixed(1) : "0.0";
  const rpg = totals.gamesPlayed > 0 ? (totals.rebounds / totals.gamesPlayed).toFixed(1) : "0.0";
  const apg = totals.gamesPlayed > 0 ? (totals.assists / totals.gamesPlayed).toFixed(1) : "0.0";
  return (
    <Link
      href={`/public/players/${totals.athleteId}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-ink-800 p-3 transition hover:border-cyan-400/40"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{totals.name}</span>
          <span className="shrink-0 text-xs text-text-3">{totals.seasonClubShortName}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {archetype ? (
            <span className="rounded-full border border-info/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-info">
              {PLAYER_ARCHETYPE_LABEL[archetype]}
            </span>
          ) : null}
          {qualification !== "QUALIFIED" ? (
            <span className="rounded-full border border-white/[.15] px-2 py-0.5 text-[9px] uppercase tracking-wide text-text-3">
              {SAMPLE_CONFIDENCE_LABEL[qualification]}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-4 text-xs text-text-2">
        <span>{ppg} <span className="text-text-3">PPG</span></span>
        <span>{rpg} <span className="text-text-3">RPG</span></span>
        <span>{apg} <span className="text-text-3">APG</span></span>
        <span>{totals.gamesPlayed} <span className="text-text-3">GP</span></span>
      </div>
    </Link>
  );
}
