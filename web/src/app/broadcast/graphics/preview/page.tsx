import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { GameResultCardView } from "@/components/analytics/cards/GameResultCardView";
import { TeamDnaCardView } from "@/components/analytics/cards/TeamDnaCardView";
import { MatchupCardView } from "@/components/analytics/cards/MatchupCardView";
import { SocialCopyBlock } from "@/components/analytics/cards/SocialCopyBlock";
import { buildGameStarCard, buildPlayerBestGameCard, buildPlayerDnaCard, buildPlayerSpotlightCard } from "@/lib/analytics/cards/player-cards";
import { buildTeamBestPerformanceCard, buildTeamDnaCard, buildTeamProfileCard } from "@/lib/analytics/cards/team-cards";
import { buildGameResultCard, buildPlayerMatchupCard, buildMatchupCard, buildWhyTheyWonCard } from "@/lib/analytics/cards/game-cards";
import { buildCategoryLeaderCard, buildPlayerMilestoneCard, buildRecordCard, buildTeamMilestoneCard } from "@/lib/analytics/cards/leaderboard-cards";
import { toSocialCopy, type CardBase, type CardFormat } from "@/lib/analytics/cards/types";
import { loadGameCoreByFixture, loadPlayerBestGame, loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { computeSeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import { computeLeaguePlayerDna } from "@/lib/analytics/player-dna";
import { computeLeagueTeamDna } from "@/lib/analytics/team-dna";
import { computePlayerArchetype } from "@/lib/analytics/player-archetype";
import { computePlayerRanks, computeTeamRanks, topRankBadges } from "@/lib/analytics/rank-context";
import { buildPlayerLeaderboard, type LeaderboardEntry } from "@/lib/analytics/league-analytics";
import { buildTeamGameLog, selectBestTeamPerformance } from "@/lib/analytics/team-game-log";
import { buildPlayerMilestonesForPlayer, buildTeamMilestonesForClub } from "@/lib/analytics/milestones";
import { buildGameRecords, buildPlayerSeasonRecords, buildPlayerSingleGameRecords, buildTeamRecords } from "@/lib/analytics/records";
import { comparePlayers, type PlayerIdentity } from "@/lib/analytics/player-comparison";
import { compareTeams } from "@/lib/analytics/team-comparison";
import { classifyGameStory } from "@/lib/analytics/game-story";
import { rankWhyTheyWon } from "@/lib/analytics/why-they-won";
import { selectTopPerformers } from "@/lib/analytics/player-analytics";
import { getGameAnalyticsCapability } from "@/lib/game-data-capability";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { web: "WEB", square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };
const FORMATS: { key: string; label: string }[] = [
  { key: "web", label: "Web" },
  { key: "square", label: "Square" },
  { key: "portrait", label: "Portrait" },
  { key: "broadcast", label: "Broadcast 16:9" },
];

type Query = { subject?: string; id?: string; key?: string; category?: string; card?: string; format?: string; a?: string; b?: string };

export default async function GraphicsPreview({ searchParams }: { searchParams: Promise<Query> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/broadcast/graphics");

  const q = await searchParams;
  const format = FORMAT_MAP[q.format ?? ""] ?? "WEB";

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) notFound();

  const built = await buildPreviewCard(q, season.id);
  if (!built) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/broadcast/graphics" className="text-xs text-cyan-400 hover:underline">&larr; Back to Graphics Gallery</Link>
        <h1 className="mt-3 text-2xl font-bold">{built.card.title}</h1>

        <nav className="mt-4 flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <Link
              key={f.key}
              href={`/broadcast/graphics/preview?${new URLSearchParams({ ...cleanQuery(q), format: f.key }).toString()}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${FORMAT_MAP[f.key] === format ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300" : "border-white/[.12] text-zinc-400 hover:border-white/[.25]"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6">{built.render(format)}</div>

        <div className="mt-6 max-w-md">
          <SocialCopyBlock copy={toSocialCopy(built.card)} />
        </div>

        {built.shareUrl ? (
          <Link href={built.shareUrl} className="mt-4 inline-block rounded-lg border border-cyan-400/30 bg-cyan-400/[.06] px-3 py-1.5 text-xs font-bold text-cyan-300">
            Open Public Share View
          </Link>
        ) : null}
      </main>
    </OperationsShell>
  );
}

function cleanQuery(q: Query): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) if (v && k !== "format") out[k] = v;
  return out;
}

type Built = { card: CardBase; render: (format: CardFormat) => React.ReactNode; shareUrl: string | null };

async function buildPreviewCard(q: Query, seasonId: string): Promise<Built | null> {
  const capability = "BOX_SCORE_ONLY" as const;

  if (q.subject === "player" && q.id) {
    const totals = await loadSeasonPlayerTotals(seasonId);
    const target = totals.find((t) => t.playerId === q.id);
    if (!target) return null;
    const athlete = await prisma.athlete.findUnique({ where: { id: target.athleteId }, select: { photoUrl: true } });
    const photoUrl = athlete?.photoUrl ?? null;

    if (q.card === "spotlight") {
      const ranks = topRankBadges(computePlayerRanks(target.playerId, totals));
      const card = buildPlayerSpotlightCard(target, ranks, photoUrl, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: `/public/share/player/${target.athleteId}` };
    }
    if (q.card === "dna") {
      const dna = computeLeaguePlayerDna(totals).get(target.playerId);
      if (!dna) return null;
      const archetype = computePlayerArchetype(dna);
      const card = buildPlayerDnaCard(dna, archetype.primary, photoUrl, target.seasonClubShortName, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
    if (q.card === "bestgame") {
      const best = await loadPlayerBestGame(target.playerId);
      if (!best) return null;
      const card = buildPlayerBestGameCard(best, target.name, target.seasonClubShortName, photoUrl, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
    if (q.card === "milestone") {
      const games = await loadSeasonGameCores(seasonId);
      const [m] = buildPlayerMilestonesForPlayer(games, target.playerId);
      if (!m) return null;
      const card = buildPlayerMilestoneCard(m, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
    if (q.card === "leader") {
      const ranks = computePlayerRanks(target.playerId, totals);
      const top = ranks.find((r) => r.rank === 1);
      if (!top) return null;
      const entries = buildPlayerLeaderboard(totals, top.metricId as Parameters<typeof buildPlayerLeaderboard>[1]);
      const entry = entries.find((e) => e.playerId === target.playerId);
      if (!entry) return null;
      const card = buildCategoryLeaderCard(top.label, entry, photoUrl, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
  }

  if (q.subject === "team" && q.id) {
    const games = await loadSeasonGameCores(seasonId);
    const totalsByTeam = computeSeasonTeamTotals(games);
    const target = totalsByTeam.get(q.id);
    if (!target) return null;
    const seasonClub = await prisma.seasonClub.findUnique({ where: { id: q.id }, select: { clubId: true, club: { select: { logoUrl: true } } } });
    const logoUrl = seasonClub?.club.logoUrl ?? null;

    if (q.card === "profile") {
      const dna = computeLeagueTeamDna(games).get(q.id) ?? null;
      const ranks = topRankBadges(computeTeamRanks(q.id, [...totalsByTeam.values()]));
      const card = buildTeamProfileCard(target, dna, logoUrl, ranks, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: seasonClub?.clubId ? `/public/share/team/${seasonClub.clubId}` : null };
    }
    if (q.card === "dna") {
      const dna = computeLeagueTeamDna(games).get(q.id);
      if (!dna) return null;
      const card = buildTeamDnaCard(dna, target.name, logoUrl, capability);
      return { card, render: (f) => <TeamDnaCardView card={card} format={f} />, shareUrl: null };
    }
    if (q.card === "bestperf") {
      const log = buildTeamGameLog(games, q.id);
      const best = selectBestTeamPerformance(log);
      if (!best) return null;
      const card = buildTeamBestPerformanceCard(best.row, target.name, target.shortName, logoUrl, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
    if (q.card === "milestone") {
      const [m] = buildTeamMilestonesForClub(games, q.id);
      if (!m) return null;
      const card = buildTeamMilestoneCard(m, capability);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
  }

  if (q.subject === "game" && q.id) {
    const game = await loadGameCoreByFixture(q.id);
    if (!game || game.status !== "FINAL") return null;
    const cap = getGameAnalyticsCapability(game.dataCapability);

    if (q.card === "result") {
      const tags = classifyGameStory(game);
      const factors = rankWhyTheyWon(game);
      const keyStat = factors[0] ? { label: factors[0].label, value: `${factors[0].winnerValue} vs ${factors[0].loserValue}` } : null;
      const card = buildGameResultCard(game, tags, keyStat, cap);
      return { card, render: (f) => <GameResultCardView card={card} format={f} />, shareUrl: `/public/share/game/${game.fixtureId}` };
    }
    if (q.card === "star") {
      const gameStar = selectTopPerformers(game).find((p) => p.category === "GAME_STAR");
      if (!gameStar) return null;
      const opponent = gameStar.player.side === "HOME" ? game.away.shortName : game.home.shortName;
      const card = buildGameStarCard(gameStar, opponent, cap);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
    if (q.card === "whytheywon") {
      const factors = rankWhyTheyWon(game);
      if (factors.length === 0) return null;
      const winner = game.home.score >= game.away.score ? game.home : game.away;
      const card = buildWhyTheyWonCard(winner.shortName, factors, cap);
      return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
    }
  }

  if (q.subject === "leader" && q.category) {
    const totals = await loadSeasonPlayerTotals(seasonId);
    const entries = buildPlayerLeaderboard(totals, q.category as Parameters<typeof buildPlayerLeaderboard>[1]);
    const entry: LeaderboardEntry | undefined = entries[0];
    if (!entry) return null;
    const card = buildCategoryLeaderCard(q.category, entry, null, capability);
    return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: null };
  }

  if (q.subject === "record" && q.key) {
    const games = await loadSeasonGameCores(seasonId);
    const players = await loadSeasonPlayerTotals(seasonId);
    const decodedKey = decodeURIComponent(q.key);
    const all = [...buildPlayerSingleGameRecords(games), ...buildPlayerSeasonRecords(players), ...buildTeamRecords(games), ...buildGameRecords(games)];
    const record = all.find((r) => r.key === decodedKey);
    if (!record) return null;
    const card = buildRecordCard(record, capability);
    return { card, render: (f) => <AnalyticsCard card={card} format={f} />, shareUrl: `/public/share/record/${encodeURIComponent(record.key)}` };
  }

  if (q.subject === "matchup-player" && q.a && q.b) {
    const totals = await loadSeasonPlayerTotals(seasonId);
    const totalsA = totals.find((t) => t.playerId === q.a);
    const totalsB = totals.find((t) => t.playerId === q.b);
    if (!totalsA || !totalsB) return null;
    const [identityA, identityB] = await Promise.all([loadPlayerIdentity(q.a), loadPlayerIdentity(q.b)]);
    if (!identityA || !identityB) return null;
    const dnaByPlayer = computeLeaguePlayerDna(totals);
    const result = comparePlayers(identityA, identityB, totalsA, totalsB, dnaByPlayer.get(q.a) ?? null, dnaByPlayer.get(q.b) ?? null);
    if (result.edges.length === 0) return null;
    const card = buildPlayerMatchupCard(result, capability);
    return { card, render: (f) => <MatchupCardView card={card} format={f} />, shareUrl: null };
  }

  if (q.subject === "matchup-team" && q.a && q.b) {
    const games = await loadSeasonGameCores(seasonId);
    const totalsByTeam = computeSeasonTeamTotals(games);
    const totalsA = totalsByTeam.get(q.a);
    const totalsB = totalsByTeam.get(q.b);
    if (!totalsA || !totalsB) return null;
    const dnaByTeam = computeLeagueTeamDna(games);
    const result = compareTeams(totalsA, totalsB, dnaByTeam.get(q.a) ?? null, dnaByTeam.get(q.b) ?? null);
    if (result.edges.length === 0) return null;
    const card = buildMatchupCard(result, capability);
    return { card, render: (f) => <MatchupCardView card={card} format={f} />, shareUrl: null };
  }

  return null;
}

async function loadPlayerIdentity(playerId: string): Promise<PlayerIdentity | null> {
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
