import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPercent, percent } from "@/lib/analytics/normalization";
import { loadPlayerBestGame, loadPlayerGameLog, loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { formatLagosDate } from "@/lib/format-datetime";
import { computeLeaguePlayerDna, PLAYER_DNA_DIMENSION_LABEL, type PlayerDna } from "@/lib/analytics/player-dna";
import { computePlayerArchetype, PLAYER_ARCHETYPE_LABEL } from "@/lib/analytics/player-archetype";
import { selectBestGameByCategory, type BestGameCategory } from "@/lib/analytics/player-game-log";
import { findSimilarPlayers, SIMILARITY_BAND_LABEL } from "@/lib/analytics/player-similarity";
import { computePlayerRanks, topRankBadges } from "@/lib/analytics/rank-context";
import { playerDevelopingAreas, playerStatisticalIdentity, playerStrengths } from "@/lib/analytics/player-statistical-identity";
import { buildPlayerDevelopmentContext } from "@/lib/analytics/player-development-context";
import { buildPlayerMilestonesForPlayer } from "@/lib/analytics/milestones";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { buildPlayerDnaCard } from "@/lib/analytics/cards/player-cards";
import { buildPlayerMilestoneCard } from "@/lib/analytics/cards/leaderboard-cards";
import { SAMPLE_CONFIDENCE_LABEL } from "@/lib/analytics/qualification";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export default async function Player({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Phase 1 Stage 5.2D: this legacy public route is the Neon Ultra public site. Resolve that
  // organization explicitly, then read the athlete and registrations inside tenant context. A
  // valid athlete id from another organization remains indistinguishable from a missing id.
  const organization = await resolveDefaultPublicOrganization();
  const a = await withOrganizationContext(organization.id, (tx) =>
    tx.athlete.findUnique({
      where: { id },
      select: {
        id: true, organizationId: true, firstName: true, lastName: true, gender: true, dateOfBirth: true,
        dominantHand: true, photoUrl: true, nationality: true, awards: true,
        registrations: {
          include: { season: true, seasonClub: { include: { club: true, division: true } }, playerStats: true },
          orderBy: { season: { startDate: "desc" } },
        },
      },
    }),
  );
  if (!a) notFound();
  const organizationId = a.organizationId;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.2em] text-info">Athlete career profile</p>
          <h1 className="mt-3 text-4xl font-bold">{a.firstName} {a.lastName}</h1>
          <p className="mt-2 text-text-2">{a.nationality ?? "Nationality not set"} · {a.dominantHand} hand</p>
        </div>
        <Link href={`/public/share/player/${a.id}`} className="rounded-lg border border-info/30 bg-info/[.06] px-3 py-1.5 text-xs font-bold text-info">Shareable Card</Link>
      </div>
      <h2 className="mt-10 text-2xl font-semibold">Season history</h2>
      <div className="mt-4 space-y-4">
        {a.registrations.map((p) => {
          const stats = p.playerStats.reduce(
            (x, y) => ({ points: x.points + y.points, rebounds: x.rebounds + y.rebounds, assists: x.assists + y.assists }),
            { points: 0, rebounds: 0, assists: 0 },
          );
          return (
            <article key={p.id} className="rounded-lg border border-line bg-ink-800 p-5">
              <h3 className="font-semibold">{p.season.name} · {p.seasonClub?.club.name ?? "Unassigned"}</h3>
              <p className="mt-2 text-sm text-text-2">{p.position} · {p.status} · {stats.points} PTS · {stats.rebounds} REB · {stats.assists} AST</p>
              <BestGameSection organizationId={organizationId} playerId={p.id} />
              <PlayerDnaSection organizationId={organizationId} seasonId={p.seasonId} playerId={p.id} photoUrl={a.photoUrl} />
              <MilestonesSection organizationId={organizationId} seasonId={p.seasonId} playerId={p.id} />
              <GameLogSection organizationId={organizationId} playerId={p.id} />
            </article>
          );
        })}
      </div>
    </main>
  );
}

async function BestGameSection({ organizationId, playerId }: { organizationId: string; playerId: string }) {
  const best = await withOrganizationContext(organizationId, (tx) => loadPlayerBestGame(playerId, tx));
  if (!best) return null;
  const fgPct = formatPercent(percent(best.fieldGoalsMade, best.fieldGoalsAttempted));
  return (
    <Link
      href={`/public/fixtures/${best.fixtureId}`}
      className="mt-4 block rounded-md border border-info/20 bg-info/[.04] p-4 transition hover:border-cyan-400/40"
    >
      <p className="text-xs font-bold uppercase tracking-[.15em] text-info">Best Game</p>
      <p className="mt-1 text-sm text-text-1">
        vs {best.opponentShortName} · {best.points} PTS · {best.rebounds} REB · {best.assists} AST · {best.steals} STL · {best.fieldGoalsMade ?? "—"}/{best.fieldGoalsAttempted ?? "—"} FG ({fgPct})
      </p>
    </Link>
  );
}

async function PlayerDnaSection({ organizationId, seasonId, playerId, photoUrl }: { organizationId: string; seasonId: string; playerId: string; photoUrl: string | null }) {
  const totals = await withOrganizationContext(organizationId, (tx) => loadSeasonPlayerTotals(seasonId, tx));
  const dnaByPlayer = computeLeaguePlayerDna(totals);
  const dna = dnaByPlayer.get(playerId);
  if (!dna) return null;
  const archetype = computePlayerArchetype(dna);
  const similar = findSimilarPlayers(playerId, dnaByPlayer);
  const byId = new Map(totals.map((t) => [t.playerId, t]));
  const ranks = topRankBadges(computePlayerRanks(playerId, totals));
  const identity = playerStatisticalIdentity(dna);
  const strengths = playerStrengths(dna);
  const developingAreas = playerDevelopingAreas(dna);
  const seasonClubShortName = byId.get(playerId)?.seasonClubShortName ?? "—";
  const dnaCard = buildPlayerDnaCard(dna, archetype.primary, photoUrl, seasonClubShortName, "BOX_SCORE_ONLY");

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-info">Player DNA</p>
        {dna.qualification !== "QUALIFIED" ? (
          <span className="rounded-full border border-white/[.15] px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-3">
            {SAMPLE_CONFIDENCE_LABEL[dna.qualification]} · {dna.gamesPlayed} game{dna.gamesPlayed === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {archetype.primary ? (
        <p className="mt-2 text-sm">
          <span className="font-bold text-white">{PLAYER_ARCHETYPE_LABEL[archetype.primary]}</span>
          {archetype.secondaryTrait ? <span className="text-text-3"> · Secondary: {PLAYER_DNA_DIMENSION_LABEL[archetype.secondaryTrait]}</span> : null}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-text-2">{identity}</p>
      {strengths.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-text-3">Strengths</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {strengths.map((s) => (
              <span key={s.dimension} className="rounded-lg border border-white/[.1] bg-white/[.03] px-2 py-1 text-xs text-text-1">
                {s.label} <span className="text-info">{s.index.toFixed(1)}×</span> league avg
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {developingAreas.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-text-3">Below Season Zero Average</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {developingAreas.map((s) => (
              <span key={s.dimension} className="rounded-lg border border-line bg-transparent px-2 py-1 text-xs text-text-3">
                {s.label}: {s.playerValue} <span className="text-text-3">(league {s.leagueAverage})</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {ranks.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ranks.map((r) => (
            <span key={r.metricId} className="rounded-lg border border-cyan-400/25 bg-info/[.06] px-2.5 py-1.5 text-xs">
              <span className="font-black text-info">#{r.rank}</span> <span className="text-text-2">{r.shortLabel} · {r.value}</span>
              <span className="ml-1 text-text-3">of {r.totalQualified}</span>
            </span>
          ))}
        </div>
      ) : null}
      <DevelopmentContextSection dna={dna} />
      <div className="mt-3 space-y-2">
        {dna.dimensions.map((d) => (
          <PlayerDnaBar key={d.key} dimension={d} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-text-3">Index is player rate ÷ league average rate for this season — 1.00 is exactly average. Archetype requires an established sample. 4PT/Ultra Time not shown — not captured for this season.</p>

      {dna.qualification === "QUALIFIED" ? (
        <div className="mt-4 max-w-xs">
          <AnalyticsCard card={dnaCard} />
        </div>
      ) : null}

      {similar.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-info">Similar Players</p>
          <div className="mt-2 space-y-2">
            {similar.map((m) => {
              const other = byId.get(m.playerId);
              if (!other) return null;
              return (
                <Link key={m.playerId} href={`/public/players/${other.athleteId}`} className="block rounded-md border border-line bg-ink-800 p-3 transition hover:border-cyan-400/40">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{other.name}</span>
                    <span className="text-xs text-info">{SIMILARITY_BAND_LABEL[m.band]}</span>
                  </div>
                  <p className="mt-1 text-xs text-text-3">
                    {m.mostSimilarDimension ? `Similar ${PLAYER_DNA_DIMENSION_LABEL[m.mostSimilarDimension].toLowerCase()}` : "Overlapping profile"}
                    {m.mostDifferentDimension ? `; ${other.name} differs most in ${PLAYER_DNA_DIMENSION_LABEL[m.mostDifferentDimension].toLowerCase()}` : ""}.
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DevelopmentContextSection({ dna }: { dna: PlayerDna }) {
  const ctx = buildPlayerDevelopmentContext(dna);
  if (ctx.status === "GATED") {
    return (
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wide text-text-3">Statistical Development Context</p>
        <p className="mt-1 text-xs text-text-3">More games required for development context.</p>
      </div>
    );
  }
  if (ctx.status === "NONE_BELOW_AVERAGE" || ctx.entries.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-wide text-text-3">Statistical Development Context</p>
      <div className="mt-1.5 space-y-1.5">
        {ctx.entries.map((e) => (
          <p key={e.dimension} className="text-xs text-text-3">{e.sentence}</p>
        ))}
      </div>
    </div>
  );
}

async function MilestonesSection({ organizationId, seasonId, playerId }: { organizationId: string; seasonId: string; playerId: string }) {
  const games = await withOrganizationContext(organizationId, (tx) => loadSeasonGameCores(seasonId, tx));
  const milestones = buildPlayerMilestonesForPlayer(games, playerId);
  if (milestones.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-info">Milestones</p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {milestones.map((m) => (
          <Link key={`${m.key}-${m.fixtureId}`} href={`/public/fixtures/${m.fixtureId}`} className="block transition hover:opacity-80">
            <AnalyticsCard card={buildPlayerMilestoneCard(m, "BOX_SCORE_ONLY")} />
          </Link>
        ))}
      </div>
    </div>
  );
}

const BEST_GAME_CATEGORIES: { id: BestGameCategory; label: string }[] = [
  { id: "HIGHEST_SCORING", label: "Highest Scoring Game" },
  { id: "BEST_REBOUNDING", label: "Best Rebounding Game" },
  { id: "BEST_PLAYMAKING", label: "Best Playmaking Game" },
];

async function GameLogSection({ organizationId, playerId }: { organizationId: string; playerId: string }) {
  const log = await withOrganizationContext(organizationId, (tx) => loadPlayerGameLog(playerId, tx));
  const active = log.filter((r) => !r.didNotPlay);
  if (log.length === 0) return null;

  const bestByCategory = BEST_GAME_CATEGORIES.map((c) => ({ ...c, game: selectBestGameByCategory(log, c.id) })).filter((c) => c.game);

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-info">Game Log</p>

      {bestByCategory.length > 1 ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {bestByCategory.map((c) => (
            <Link key={c.id} href={`/public/fixtures/${c.game!.fixtureId}`} className="rounded-lg border border-line bg-ink-800 p-2.5 transition hover:border-cyan-400/40">
              <p className="text-[9px] uppercase tracking-wide text-text-3">{c.label}</p>
              <p className="mt-0.5 text-sm font-bold text-text-1">
                {c.id === "HIGHEST_SCORING" ? `${c.game!.points} PTS` : c.id === "BEST_REBOUNDING" ? `${c.game!.rebounds} REB` : `${c.game!.assists} AST`}
              </p>
              <p className="text-[10px] text-text-3">vs {c.game!.opponentShortName}</p>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead>
            <tr className="border-b border-line text-text-3">
              <th className="px-2 py-2 font-semibold">Date</th>
              <th className="px-2 py-2 font-semibold">Opp</th>
              <th className="px-2 py-2 font-semibold">Result</th>
              <th className="px-2 py-2 font-semibold">MIN</th>
              <th className="px-2 py-2 font-semibold">PTS</th>
              <th className="px-2 py-2 font-semibold">REB</th>
              <th className="px-2 py-2 font-semibold">AST</th>
              <th className="px-2 py-2 font-semibold">STL</th>
              <th className="px-2 py-2 font-semibold">BLK</th>
              <th className="px-2 py-2 font-semibold">TOV</th>
              <th className="px-2 py-2 font-semibold">FG</th>
              <th className="px-2 py-2 font-semibold">3PT</th>
              <th className="px-2 py-2 font-semibold">FT</th>
              <th className="px-2 py-2 font-semibold">EFF</th>
            </tr>
          </thead>
          <tbody>
            {log.map((row) => (
              <tr key={row.fixtureId} className={`border-b border-white/[.04] last:border-0 ${row.didNotPlay ? "text-text-3" : ""}`}>
                <td className="px-2 py-2">
                  <Link href={`/public/fixtures/${row.fixtureId}`} className="text-info hover:underline">
                    {formatLagosDate(row.scheduledAt)}
                  </Link>
                </td>
                <td className="px-2 py-2">{row.opponentShortName}</td>
                <td className="px-2 py-2 font-bold">{row.result}</td>
                <td className="px-2 py-2">{row.didNotPlay ? "DNP" : row.minutesPlayed}</td>
                <td className="px-2 py-2 font-bold text-text-1">{row.points}</td>
                <td className="px-2 py-2">{row.rebounds}</td>
                <td className="px-2 py-2">{row.assists}</td>
                <td className="px-2 py-2">{row.steals}</td>
                <td className="px-2 py-2">{row.blocks}</td>
                <td className="px-2 py-2">{row.turnovers}</td>
                <td className="px-2 py-2">{row.fieldGoalsMade ?? "—"}/{row.fieldGoalsAttempted ?? "—"}</td>
                <td className="px-2 py-2">{row.threePointsMade ?? "—"}/{row.threePointsAttempted ?? "—"}</td>
                <td className="px-2 py-2">{row.freeThrowsMade ?? "—"}/{row.freeThrowsAttempted ?? "—"}</td>
                <td className="px-2 py-2">{row.efficiency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active.length === 0 ? <p className="mt-2 text-xs text-text-3">No games with recorded minutes yet.</p> : null}
    </div>
  );
}

function PlayerDnaBar({ dimension }: { dimension: PlayerDna["dimensions"][number] }) {
  const index = dimension.index;
  const widthPct = index != null ? Math.min(100, (index / 2) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-text-2">{PLAYER_DNA_DIMENSION_LABEL[dimension.key]}</span>
        <span className="text-text-3">{dimension.playerValue} <span className="text-text-3">(league {dimension.leagueAverage})</span></span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[.06]">
        {index != null ? <div className="h-full rounded-full bg-cyan-400" style={{ width: `${widthPct}%` }} /> : <div className="h-full w-full bg-white/[.03]" />}
      </div>
    </div>
  );
}
