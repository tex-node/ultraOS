import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { formatPercent } from "@/lib/analytics/normalization";
import { SAMPLE_CONFIDENCE_LABEL } from "@/lib/analytics/qualification";
import { computeTeamRanks, topRankBadges } from "@/lib/analytics/rank-context";
import { teamBelowAverage, teamStatisticalIdentity, teamStrengths } from "@/lib/analytics/team-statistical-identity";
import { computeSeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import { buildTeamGameLog, selectBestTeamPerformance } from "@/lib/analytics/team-game-log";
import { computeLeagueTeamDna, TEAM_DNA_DIMENSION_LABEL, TEAM_DNA_MIN_GAMES_NOTE, TEAM_DNA_TAG_LABEL, type TeamDna } from "@/lib/analytics/team-dna";
import { findSimilarTeams, SIMILARITY_BAND_LABEL } from "@/lib/analytics/team-similarity";
import { buildTeamMilestonesForClub } from "@/lib/analytics/milestones";
import { TeamDnaCardView } from "@/components/analytics/cards/TeamDnaCardView";
import { buildTeamDnaCard } from "@/lib/analytics/cards/team-cards";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { buildTeamMilestoneCard } from "@/lib/analytics/cards/leaderboard-cards";
import type { GameCore } from "@/lib/analytics/types";
import { PublicResourceLocatorType } from "@/generated/prisma/enums";
import { formatLagosDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import {
  locatorMatchesResource,
  resolvePublicResourceLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

const FALLBACK_PRIMARY_COLOR = "#16F2B3";

export default async function PublicClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.CLUB,
    id,
  );
  if (!locator) notFound();
  const club = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.club.findUnique({
      where: { id: locator.resourceId },
      include: {
        sport: true,
        seasonClubs: {
          where: { status: "ACTIVE" },
          include: {
            assistantCoach: true,
            division: true,
            headCoach: true,
            players: { include: { athlete: true }, orderBy: { jerseyNumber: "asc" } },
            season: true,
            standing: true,
          },
        },
      },
    }),
  );
  if (!club || !locatorMatchesResource(locator, club)) notFound();
  const organizationId = locator.organizationId;

  const primarySeasonClub = club.seasonClubs[0];
  const displayPrimaryColor = club.primaryColor ?? FALLBACK_PRIMARY_COLOR;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="overflow-hidden rounded-3xl border p-8" style={{ borderColor: `${displayPrimaryColor}40`, background: `linear-gradient(135deg, ${displayPrimaryColor}12, #050807 65%)` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            {club.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`${club.name} logo`} className="h-28 w-28 rounded-3xl object-contain" src={club.logoUrl} />
            ) : (
              <div className="grid h-28 w-28 place-items-center rounded-3xl border text-2xl font-black" style={{ borderColor: `${displayPrimaryColor}55`, color: displayPrimaryColor }}>
                {club.shortName}
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-[.2em]" style={{ color: displayPrimaryColor }}>{primarySeasonClub?.division.name ?? club.sport.name}</p>
              <h1 className="mt-3 text-4xl font-black">{club.name}</h1>
              {club.officialSlogan ? <p className="mt-3 text-2xl font-semibold" style={{ color: displayPrimaryColor }}>{club.officialSlogan}</p> : null}
            </div>
          </div>
          <Link href={`/public/share/team/${club.id}`} className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-400/[.06] px-3 py-1.5 text-xs font-bold text-cyan-300">Shareable Card</Link>
        </div>
        {club.crowdChant ? <p className="mt-8 text-sm text-zinc-300"><span className="text-zinc-500">Crowd Chant:</span> <b>{club.crowdChant}</b></p> : null}
        {club.identityKeywords.length ? <p className="mt-3 text-sm text-zinc-300"><span className="text-zinc-500">Identity:</span> {club.identityKeywords.join(" • ")}</p> : null}
        {club.publicBio ? <p className="mt-6 max-w-3xl text-sm leading-6 text-zinc-300">{club.publicBio}</p> : null}
      </section>

      {club.seasonClubs.map((seasonClub) => (
        <section className="mt-8" key={seasonClub.id}>
          <h2 className="text-2xl font-semibold">{seasonClub.season.name} · {seasonClub.division.name}</h2>
          <p className="mt-2 text-zinc-400">Record {seasonClub.standing?.won ?? 0}-{seasonClub.standing?.lost ?? 0} · {seasonClub.standing?.leaguePoints ?? 0} points</p>
          <TeamDnaSection
            organizationId={organizationId}
            seasonId={seasonClub.seasonId}
            seasonClubId={seasonClub.id}
            accentColor={displayPrimaryColor}
            standing={seasonClub.standing}
            teamName={club.name}
            logoUrl={club.logoUrl}
          />
          <TeamGameLogSection organizationId={organizationId} seasonId={seasonClub.seasonId} seasonClubId={seasonClub.id} />
          {seasonClub.headCoach || seasonClub.assistantCoach ? (
            <div
              className="mt-4 flex flex-wrap gap-6 rounded-xl border p-4"
              style={{ background: `${displayPrimaryColor}14`, borderColor: `${displayPrimaryColor}30` }}
            >
              {seasonClub.headCoach ? (
                <div>
                  <p className="text-xs uppercase tracking-[.2em]" style={{ color: displayPrimaryColor }}>Head coach</p>
                  <p className="mt-1 font-semibold">{seasonClub.headCoach.name}</p>
                </div>
              ) : null}
              {seasonClub.assistantCoach ? (
                <div>
                  <p className="text-xs uppercase tracking-[.2em]" style={{ color: displayPrimaryColor }}>Assistant coach</p>
                  <p className="mt-1 font-semibold">{seasonClub.assistantCoach.name}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {seasonClub.players.map((player) => (
              <Link className="rounded-xl border border-white/[.08] bg-[#0b100e] p-4" href={`/public/players/${player.athlete.id}`} key={player.id}>
                <b>{player.athlete.firstName} {player.athlete.lastName}</b>
                <p className="text-xs text-zinc-500">#{player.jerseyNumber ?? "-"} · {player.position}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

async function TeamDnaSection({
  organizationId,
  seasonId,
  seasonClubId,
  accentColor,
  standing,
  teamName,
  logoUrl,
}: {
  organizationId: string;
  seasonId: string;
  seasonClubId: string;
  accentColor: string;
  standing: { won: number; lost: number; pointDifference: number } | null;
  teamName: string;
  logoUrl: string | null;
}) {
  const games = await withOrganizationContext(organizationId, (tx) => loadSeasonGameCores(seasonId, tx));
  if (games.length === 0) return null;
  const dnaByTeam = computeLeagueTeamDna(games);
  const dna = dnaByTeam.get(seasonClubId);
  if (!dna) return null;
  const similarTeams = findSimilarTeams(seasonClubId, dnaByTeam);
  const totalsByTeam = computeSeasonTeamTotals(games);
  const ranks = topRankBadges(computeTeamRanks(seasonClubId, [...totalsByTeam.values()]));
  const identity = teamStatisticalIdentity(dna);
  const strengths = teamStrengths(dna);
  const belowAverage = teamBelowAverage(dna);
  const dnaCard = buildTeamDnaCard(dna, teamName, logoUrl, "BOX_SCORE_ONLY");

  const byKey = (key: (typeof dna.dimensions)[number]["key"]) => dna.dimensions.find((d) => d.key === key)?.teamValue ?? "—";
  const summary = [
    { label: "Record", value: standing ? `${standing.won}-${standing.lost}` : "—" },
    { label: "PPG", value: byKey("SCORING") },
    { label: "Opp PPG", value: byKey("DEFENSE") },
    { label: "Diff", value: standing ? (standing.pointDifference > 0 ? `+${standing.pointDifference}` : String(standing.pointDifference)) : "—" },
    { label: "FG%", value: byKey("SHOOTING") },
    { label: "RPG", value: byKey("REBOUNDING") },
    { label: "APG", value: byKey("PLAYMAKING") },
    { label: "TOV/G", value: byKey("BALL_SECURITY") },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <div className="grid grid-cols-4 gap-3 border-b border-white/[.06] pb-4 sm:grid-cols-8">
        {summary.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-sm font-bold text-zinc-200">{s.value}</p>
            <p className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-600">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-[.15em]" style={{ color: accentColor }}>Team DNA</h3>
        {dna.qualification !== "QUALIFIED" ? (
          <span className="rounded-full border border-white/[.15] px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
            {SAMPLE_CONFIDENCE_LABEL[dna.qualification]} · {dna.gamesPlayed} game{dna.gamesPlayed === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {dna.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dna.tags.map((t) => (
            <span key={t} className="rounded-full border border-white/[.15] bg-white/[.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
              {TEAM_DNA_TAG_LABEL[t]}
            </span>
          ))}
        </div>
      ) : null}
      {ranks.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {ranks.map((r) => (
            <span key={r.metricId} className="rounded-lg border border-cyan-400/25 bg-cyan-400/[.06] px-2.5 py-1.5 text-xs">
              <span className="font-black text-cyan-300">#{r.rank}</span> <span className="text-zinc-400">{r.shortLabel} · {r.value}</span>
              <span className="ml-1 text-zinc-700">of {r.totalQualified}</span>
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-sm text-zinc-400">{identity}</p>
      {strengths.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">Category Strengths</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {strengths.map((s) => (
              <span key={s.dimension} className="rounded-lg border border-white/[.1] bg-white/[.03] px-2 py-1 text-xs text-zinc-300">
                {s.label} <span className="text-cyan-400">{s.index.toFixed(2)}×</span> league avg ({s.teamValue} vs {s.leagueAverage})
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {belowAverage.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">Below Season Zero Average</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {belowAverage.map((s) => (
              <span key={s.dimension} className="rounded-lg border border-white/[.08] bg-transparent px-2 py-1 text-xs text-zinc-500">
                {s.label}: {s.teamValue} <span className="text-zinc-600">(league {s.leagueAverage})</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 space-y-2.5">
        {dna.dimensions.map((d) => (
          <TeamDnaBar key={d.key} dimension={d} accentColor={accentColor} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-600">{TEAM_DNA_MIN_GAMES_NOTE} Index is team rate ÷ league average rate — 1.00 is exactly average.</p>

      {dna.qualification === "QUALIFIED" ? (
        <div className="mt-4 max-w-xs">
          <TeamDnaCardView card={dnaCard} />
        </div>
      ) : null}

      {similarTeams.length > 0 ? <SimilarTeams organizationId={organizationId} matches={similarTeams} /> : null}
    </div>
  );
}

async function SimilarTeams({ organizationId, matches }: { organizationId: string; matches: ReturnType<typeof findSimilarTeams> }) {
  const seasonClubs = await withOrganizationContext(organizationId, (tx) => tx.seasonClub!.findMany({
    where: { id: { in: matches.map((m) => m.seasonClubId) } },
    select: { id: true, club: { select: { id: true, name: true } } },
  }));
  const byId = new Map(seasonClubs.map((sc) => [sc.id, sc.club]));

  return (
    <div className="mt-4 border-t border-white/[.06] pt-4">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-cyan-400">Similar Team Profiles</p>
      <div className="mt-2 space-y-2">
        {matches.map((m) => {
          const club = byId.get(m.seasonClubId);
          if (!club) return null;
          return (
            <Link key={m.seasonClubId} href={`/public/clubs/${club.id}`} className="block rounded-xl border border-white/[.08] bg-[#0b100e] p-3 transition hover:border-cyan-400/40">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{club.name}</span>
                <span className="text-xs text-cyan-400">{SIMILARITY_BAND_LABEL[m.band]}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {m.mostSimilarDimension ? `Both relied on ${TEAM_DNA_DIMENSION_LABEL[m.mostSimilarDimension].toLowerCase()}` : "Overlapping profile"}
                {m.mostDifferentDimension ? `, but differed most in ${TEAM_DNA_DIMENSION_LABEL[m.mostDifferentDimension].toLowerCase()}` : ""}.
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function TeamGameLogSection({ organizationId, seasonId, seasonClubId }: { organizationId: string; seasonId: string; seasonClubId: string }) {
  const games = await withOrganizationContext(organizationId, (tx) => loadSeasonGameCores(seasonId, tx));
  const log = buildTeamGameLog(games, seasonClubId);
  if (log.length === 0) return null;
  const best = selectBestTeamPerformance(log);

  return (
    <div className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <p className="text-sm font-bold uppercase tracking-[.15em] text-cyan-400">Game Log</p>
      <p className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
        {log.map((r) => (
          <span key={r.fixtureId} className={`rounded px-1.5 py-0.5 font-bold ${r.result === "W" ? "bg-cyan-400/15 text-cyan-300" : "bg-white/[.06] text-zinc-500"}`}>
            {r.result}
          </span>
        ))}
        <span className="text-zinc-700">— season results, not a form prediction</span>
      </p>

      {best ? (
        <Link href={`/public/fixtures/${best.row.fixtureId}`} className="mt-3 block rounded-xl border border-cyan-400/20 bg-cyan-400/[.04] p-3 transition hover:border-cyan-400/40">
          <p className="text-[10px] uppercase tracking-wide text-cyan-400">Best Team Performance</p>
          <p className="mt-1 text-sm text-zinc-200">
            vs {best.row.opponentShortName} · {best.row.pointsFor}-{best.row.pointsAgainst} ({best.row.margin > 0 ? "+" : ""}{best.row.margin})
          </p>
        </Link>
      ) : null}

      <TeamMilestonesStrip games={games} seasonClubId={seasonClubId} />

      <div className="mt-3 overflow-x-auto rounded-xl border border-white/[.08]">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead>
            <tr className="border-b border-white/[.08] text-zinc-500">
              <th className="px-2 py-2 font-semibold">Date</th>
              <th className="px-2 py-2 font-semibold">Opp</th>
              <th className="px-2 py-2 font-semibold">Result</th>
              <th className="px-2 py-2 font-semibold">PF</th>
              <th className="px-2 py-2 font-semibold">PA</th>
              <th className="px-2 py-2 font-semibold">Margin</th>
              <th className="px-2 py-2 font-semibold">FG%</th>
              <th className="px-2 py-2 font-semibold">REB</th>
              <th className="px-2 py-2 font-semibold">AST</th>
              <th className="px-2 py-2 font-semibold">TOV</th>
              <th className="px-2 py-2 font-semibold">Paint</th>
              <th className="px-2 py-2 font-semibold">Bench</th>
            </tr>
          </thead>
          <tbody>
            {log.map((row) => (
              <tr key={row.fixtureId} className="border-b border-white/[.04] last:border-0">
                <td className="px-2 py-2">
                  <Link href={`/public/fixtures/${row.fixtureId}`} className="text-cyan-400 hover:underline">
                    {formatLagosDate(row.scheduledAt)}
                  </Link>
                </td>
                <td className="px-2 py-2">{row.opponentShortName}</td>
                <td className="px-2 py-2 font-bold">{row.result}</td>
                <td className="px-2 py-2 font-bold text-zinc-200">{row.pointsFor}</td>
                <td className="px-2 py-2">{row.pointsAgainst}</td>
                <td className="px-2 py-2">{row.margin > 0 ? `+${row.margin}` : row.margin}</td>
                <td className="px-2 py-2">{formatPercent(row.fieldGoalPct)}</td>
                <td className="px-2 py-2">{row.rebounds ?? "—"}</td>
                <td className="px-2 py-2">{row.assists}</td>
                <td className="px-2 py-2">{row.turnovers}</td>
                <td className="px-2 py-2">{row.pointsInPaint ?? "—"}</td>
                <td className="px-2 py-2">{row.benchPoints ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamMilestonesStrip({ games, seasonClubId }: { games: GameCore[]; seasonClubId: string }) {
  const milestones = buildTeamMilestonesForClub(games, seasonClubId);
  if (milestones.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {milestones.map((m) => (
        <Link key={`${m.key}-${m.fixtureId}`} href={`/public/fixtures/${m.fixtureId}`} className="block transition hover:opacity-80">
          <AnalyticsCard card={buildTeamMilestoneCard(m, "BOX_SCORE_ONLY")} />
        </Link>
      ))}
    </div>
  );
}

function TeamDnaBar({ dimension, accentColor }: { dimension: TeamDna["dimensions"][number]; accentColor: string }) {
  const index = dimension.index;
  const widthPct = index != null ? Math.min(100, (index / 2) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">{TEAM_DNA_DIMENSION_LABEL[dimension.key]}</span>
        <span className="text-zinc-500">{dimension.teamValue} <span className="text-zinc-700">(league {dimension.leagueAverage})</span></span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[.06]">
        {index != null ? (
          <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: accentColor }} />
        ) : (
          <div className="h-full w-full bg-white/[.03]" />
        )}
      </div>
    </div>
  );
}
