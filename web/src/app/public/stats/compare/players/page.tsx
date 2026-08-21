import Link from "next/link";
import { loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { computeLeaguePlayerDna, PLAYER_DNA_DIMENSION_LABEL, type PlayerDnaDimensionKey } from "@/lib/analytics/player-dna";
import { comparePlayers, type PlayerComparisonResult, type PlayerIdentity } from "@/lib/analytics/player-comparison";
import { MatchupCardView } from "@/components/analytics/cards/MatchupCardView";
import { buildPlayerMatchupCard } from "@/lib/analytics/cards/game-cards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DNA_KEYS: PlayerDnaDimensionKey[] = ["SCORING", "SHOOTING", "PLAYMAKING", "REBOUNDING", "DEFENSIVE_ACTIVITY", "BALL_SECURITY"];

export default async function ComparePlayers({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-black">Compare Players</h1>
        <p className="mt-4 text-zinc-400">No active season right now.</p>
      </main>
    );
  }

  const totals = await loadSeasonPlayerTotals(season.id);
  const options = [...totals].sort((x, y) => x.name.localeCompare(y.name));

  let result: PlayerComparisonResult | null = null;
  if (a && b && a !== b) {
    const totalsA = totals.find((t) => t.playerId === a);
    const totalsB = totals.find((t) => t.playerId === b);
    if (totalsA && totalsB) {
      const [identityA, identityB] = await Promise.all([loadIdentity(a), loadIdentity(b)]);
      if (identityA && identityB) {
        const dnaByPlayer = computeLeaguePlayerDna(totals);
        result = comparePlayers(identityA, identityB, totalsA, totalsB, dnaByPlayer.get(a) ?? null, dnaByPlayer.get(b) ?? null);
      }
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[.3em] text-cyan-400">Season Zero</p>
      <h1 className="mt-2 text-3xl font-black sm:text-4xl">Compare Players</h1>

      <form className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]" action="/public/stats/compare/players">
        <select name="a" defaultValue={a ?? ""} className="rounded-xl border border-white/[.12] bg-[#0b100e] px-3 py-2 text-sm [color-scheme:dark]">
          <option value="" disabled>Select Player A</option>
          {options.map((p) => <option key={p.playerId} value={p.playerId}>{p.name} · {p.seasonClubShortName}</option>)}
        </select>
        <span className="hidden self-center text-zinc-600 sm:block">vs</span>
        <select name="b" defaultValue={b ?? ""} className="rounded-xl border border-white/[.12] bg-[#0b100e] px-3 py-2 text-sm [color-scheme:dark]">
          <option value="" disabled>Select Player B</option>
          {options.map((p) => <option key={p.playerId} value={p.playerId}>{p.name} · {p.seasonClubShortName}</option>)}
        </select>
        <button type="submit" className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300 sm:col-span-3">Compare</button>
      </form>

      {a && b && a === b ? <p className="mt-6 text-sm text-amber-400">Choose two different players to compare.</p> : null}

      {result ? <ComparisonView result={result} /> : null}
    </main>
  );
}

async function loadIdentity(playerId: string): Promise<PlayerIdentity | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { athlete: { select: { firstName: true, lastName: true, ultraAthleteId: true } }, seasonClub: { select: { club: { select: { name: true, shortName: true } } } } },
  });
  if (!player) return null;
  return {
    playerId,
    name: `${player.athlete.firstName} ${player.athlete.lastName}`,
    ultraAthleteId: player.athlete.ultraAthleteId,
    clubShortName: player.seasonClub?.club.shortName ?? "—",
    clubName: player.seasonClub?.club.name ?? "Unassigned",
  };
}

function ComparisonView({ result }: { result: PlayerComparisonResult }) {
  return (
    <div className="mt-10">
      <div className="grid grid-cols-2 gap-4">
        <IdentityCard identity={result.a} games={result.gamesA} />
        <IdentityCard identity={result.b} games={result.gamesB} />
      </div>

      {result.summary.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/[.04] p-4 space-y-1.5">
          {result.summary.map((s, i) => <p key={i} className="text-sm text-zinc-300">{s}</p>)}
        </section>
      ) : null}

      {result.edges.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold tracking-tight">Head-to-Head Edges</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {result.edges.map((e) => (
              <div key={e.dimension} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3 text-center">
                <p className="text-[9px] uppercase tracking-wide text-zinc-600">{e.label}</p>
                <p className={`mt-1 text-sm font-bold ${e.result === "EVEN" || e.result === "INSUFFICIENT_SAMPLE" ? "text-zinc-500" : "text-cyan-400"}`}>
                  {e.result === "A" ? result.a.name.split(" ")[0] : e.result === "B" ? result.b.name.split(" ")[0] : e.result === "EVEN" ? "Even" : "—"}
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
            <MatchupCardView card={buildPlayerMatchupCard(result, "BOX_SCORE_ONLY")} />
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight">Core Production</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/[.08]">
          {result.metrics.map((m) => (
            <MetricRow key={m.metricId} row={m} aName={result.a.name} bName={result.b.name} />
          ))}
        </div>
      </section>

      {result.dnaA && result.dnaB ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight">Player DNA</h2>
          <p className="mt-1 text-xs text-zinc-600">Index is each player&apos;s per-game rate ÷ the league average — 1.00 is exactly average. How this is calculated: see Player DNA in the analytics methods documentation.</p>
          <div className="mt-3 flex justify-center rounded-2xl border border-white/[.08] bg-[#0b100e] p-4">
            <DnaRadar dnaA={result.dnaA} dnaB={result.dnaB} />
          </div>
          <div className="mt-3 flex justify-center gap-6 text-xs">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" />{result.a.name}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pink-400" />{result.b.name}</span>
          </div>
        </section>
      ) : (
        <p className="mt-8 text-sm text-zinc-500">Player DNA comparison unavailable — one or both players don&apos;t have enough games yet.</p>
      )}
    </div>
  );
}

function IdentityCard({ identity, games }: { identity: PlayerIdentity; games: number }) {
  return (
    <Link href={`/public/players/${identity.playerId}`} className="block rounded-2xl border border-white/[.08] bg-[#0b100e] p-4 transition hover:border-cyan-400/40">
      <p className="text-lg font-black">{identity.name}</p>
      <p className="mt-1 text-xs text-zinc-500">{identity.clubName}{identity.ultraAthleteId ? ` · ${identity.ultraAthleteId}` : ""}</p>
      <p className="mt-2 text-xs text-zinc-600">{games} game{games === 1 ? "" : "s"} played</p>
    </Link>
  );
}

function MetricRow({ row, aName, bName }: { row: PlayerComparisonResult["metrics"][number]; aName: string; bName: string }) {
  const aWins = row.result === "A";
  const bWins = row.result === "B";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-white/[.06] bg-[#0b100e] px-3 py-2.5 text-sm last:border-0" title={`${row.label} — ${row.result === "INSUFFICIENT_SAMPLE" ? "insufficient sample for one or both players" : row.result === "EVEN" ? "even" : row.result === "A" ? `${aName} ahead` : `${bName} ahead`}`}>
      <span className={`text-right font-semibold ${aWins ? "text-cyan-400" : "text-zinc-300"}`}>{row.aValue}</span>
      <span className="px-3 text-center text-[10px] uppercase tracking-wide text-zinc-600">{row.label}</span>
      <span className={`font-semibold ${bWins ? "text-cyan-400" : "text-zinc-300"}`}>{row.bValue}</span>
    </div>
  );
}

function DnaRadar({ dnaA, dnaB }: { dnaA: NonNullable<PlayerComparisonResult["dnaA"]>; dnaB: NonNullable<PlayerComparisonResult["dnaB"]> }) {
  const size = 260;
  const center = size / 2;
  const maxRadius = center - 40;
  const angleStep = (2 * Math.PI) / DNA_KEYS.length;
  const scale = (index: number | null) => Math.max(0, Math.min(1, (index ?? 0) / 2)) * maxRadius;

  function points(dna: typeof dnaA) {
    return DNA_KEYS.map((key, i) => {
      const dim = dna.dimensions.find((d) => d.key === key);
      const r = scale(dim?.index ?? null);
      const angle = i * angleStep - Math.PI / 2;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    }).join(" ");
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-64 w-64" role="img" aria-label="Player DNA comparison radar chart">
      {[0.33, 0.66, 1].map((frac) => (
        <circle key={frac} cx={center} cy={center} r={maxRadius * frac} fill="none" stroke="rgba(255,255,255,0.08)" />
      ))}
      {DNA_KEYS.map((key, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const x = center + maxRadius * Math.cos(angle);
        const y = center + maxRadius * Math.sin(angle);
        const labelX = center + (maxRadius + 22) * Math.cos(angle);
        const labelY = center + (maxRadius + 22) * Math.sin(angle);
        return (
          <g key={key}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" />
            <text x={labelX} y={labelY} fontSize="9" fill="#a1a1aa" textAnchor="middle" dominantBaseline="middle">
              {PLAYER_DNA_DIMENSION_LABEL[key].split(" ")[0]}
            </text>
          </g>
        );
      })}
      <polygon points={points(dnaA)} fill="rgba(34,211,238,0.15)" stroke="#22d3ee" strokeWidth="1.5" />
      <polygon points={points(dnaB)} fill="rgba(244,114,182,0.12)" stroke="#f472b6" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}
