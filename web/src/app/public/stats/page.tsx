import Link from "next/link";
import { emergingPerformerHeadline, findEmergingPerformers } from "@/lib/analytics/emerging-performers";
import { loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { buildLeaguePulse, buildPlayerLeaderboard, LEADERBOARD_MIN_ATTEMPTS_NOTE, type LeaderboardEntry, type LeaguePulseCard } from "@/lib/analytics/league-analytics";
import { computeLeaguePlayerDna } from "@/lib/analytics/player-dna";
import { SAMPLE_CONFIDENCE_LABEL } from "@/lib/analytics/qualification";
import { buildSeasonStoryCards, type SeasonStoryCard } from "@/lib/analytics/season-story-cards";
import { computeLeagueTeamDna, TEAM_DNA_DIMENSION_LABEL, topTeamByDimension } from "@/lib/analytics/team-dna";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { buildCategoryLeaderCard } from "@/lib/analytics/cards/leaderboard-cards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CATEGORY_LEADERS: { key: Parameters<typeof buildPlayerLeaderboard>[1]; label: string }[] = [
  { key: "PPG", label: "Scoring Leaders" },
  { key: "RPG", label: "Rebounding Leaders" },
  { key: "APG", label: "Playmaking Leaders" },
  { key: "DEF_ACTIVITY", label: "Defensive Activity" },
  { key: "FG_PCT", label: "Shooting Efficiency" },
  { key: "EFF", label: "All-Round Impact" },
];

const MORE_LEADERBOARDS: { key: Parameters<typeof buildPlayerLeaderboard>[1]; label: string }[] = [
  { key: "SPG", label: "Steals Per Game" },
  { key: "BPG", label: "Blocks Per Game" },
  { key: "THREE_PCT", label: "Three-Point %" },
  { key: "FT_PCT", label: "Free Throw %" },
];

const NAV_LINKS = [
  { href: "/public/stats", label: "Overview" },
  { href: "/public/stats/players", label: "Players" },
  { href: "/public/clubs", label: "Teams" },
  { href: "/public/fixtures", label: "Games" },
  { href: "/public/stats/compare/players", label: "Compare Players" },
  { href: "/public/stats/compare/teams", label: "Compare Teams" },
  { href: "/public/stats/records", label: "Record Book" },
];

const TEAM_PULSE_DIMENSIONS = ["SCORING", "REBOUNDING", "PLAYMAKING", "SHOOTING"] as const;

function pick(cards: LeaguePulseCard[], keys: string[]): LeaguePulseCard[] {
  return keys.map((k) => cards.find((c) => c.key === k)).filter((c): c is LeaguePulseCard => c != null);
}

export default async function SeasonStats() {
  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-4xl font-bold">Season Zero Pulse</h1>
        <p className="mt-6 text-zinc-400">No active season right now — stats will appear once a season is underway.</p>
      </main>
    );
  }

  const [games, players] = await Promise.all([
    loadSeasonGameCores(season.id),
    loadSeasonPlayerTotals(season.id),
  ]);

  if (games.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-cyan-400">{season.name}</p>
        <h1 className="mt-2 text-4xl font-bold">Season Pulse</h1>
        <p className="mt-6 text-zinc-400">No completed games yet — stats will appear once the season is underway.</p>
      </main>
    );
  }

  const pulse = buildLeaguePulse(games);
  const storyCards = buildSeasonStoryCards(games);
  const dnaByTeam = computeLeagueTeamDna(games);
  const dnaByPlayer = computeLeaguePlayerDna(players);
  const categoryLeaders = CATEGORY_LEADERS.map((lb) => ({ ...lb, entries: buildPlayerLeaderboard(players, lb.key) })).filter((lb) => lb.entries.length > 0);
  const boards = MORE_LEADERBOARDS.map((lb) => ({ ...lb, entries: buildPlayerLeaderboard(players, lb.key) })).filter((lb) => lb.entries.length > 0);
  const totalsById = new Map(players.map((p) => [p.playerId, p]));
  const emerging = findEmergingPerformers(dnaByPlayer, totalsById);

  const seasonSnapshot = pick(pulse, ["gamesPlayed", "totalPoints", "avgGameScore", "otGames"]);
  const gameExtremes = pick(pulse, ["highestScoring", "closestGame", "biggestWin", "mostLeadChanges", "biggestRun"]);
  const playerPulse = pick(pulse, ["topScoring", "topEfficiency", "topRebounding", "topAssists"]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <nav className="flex flex-wrap gap-2 text-xs">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-full border border-white/[.12] px-3 py-1 text-zinc-400 transition hover:border-cyan-400/40 hover:text-cyan-300">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="mt-6 text-xs font-bold uppercase tracking-[.3em] text-cyan-400">{season.name}</p>
      <h1 className="mt-2 text-3xl font-black sm:text-4xl">Season Zero Pulse</h1>

      <PulseSection title="Season Snapshot" cards={seasonSnapshot} />
      <PulseSection title="Game Extremes" cards={gameExtremes} />

      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Team Pulse</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TEAM_PULSE_DIMENSIONS.map((dim) => {
            const top = topTeamByDimension(dnaByTeam, dim);
            if (!top) return null;
            const value = top.dimensions.find((d) => d.key === dim)!;
            return (
              <div key={dim} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-4">
                <p className="text-[10px] uppercase tracking-[.15em] text-zinc-500">{TEAM_DNA_DIMENSION_LABEL[dim]} Leader</p>
                <p className="mt-1 text-xl font-black text-cyan-300">{top.shortName}</p>
                <p className="mt-1 text-xs text-zinc-500">{value.teamValue} (league {value.leagueAverage})</p>
              </div>
            );
          })}
        </div>
      </section>

      <PulseSection title="Player Pulse" cards={playerPulse} />

      {storyCards.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Season Story Cards</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {storyCards.map((card) => (
              <StoryCard key={card.key} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      {categoryLeaders.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Category Leaders</h2>
          <p className="mt-1 text-xs text-zinc-600">Who dominated each category. {LEADERBOARD_MIN_ATTEMPTS_NOTE}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categoryLeaders.map((board) => (
              <AnalyticsCard key={board.key} card={buildCategoryLeaderCard(board.label, board.entries[0], null, "BOX_SCORE_ONLY")} />
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryLeaders.map((board) => (
              <LeaderboardCard key={board.key} label={board.label} entries={board.entries} />
            ))}
          </div>
        </section>
      ) : null}

      {emerging.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Emerging Performers</h2>
          <p className="mt-1 text-xs text-zinc-600">Strong single-game showings that haven&apos;t yet reached the games-played floor for the leaderboards above — performance discovery, not a prediction.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {emerging.map((p) => (
              <div key={p.playerId} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.name}</span>
                  <span className="rounded-full border border-white/[.15] px-2 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500">{SAMPLE_CONFIDENCE_LABEL.DEVELOPING_PROFILE}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{p.seasonClubShortName}</p>
                <p className="mt-2 text-sm text-cyan-300">{emergingPerformerHeadline(p)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {boards.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">More Leaderboards</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {boards.map((board) => (
              <LeaderboardCard key={board.key} label={board.label} entries={board.entries} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function PulseSection({ title, cards }: { title: string; cards: LeaguePulseCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-4">
            <p className="text-[10px] uppercase tracking-[.15em] text-zinc-500">{card.label}</p>
            <p className="mt-1 text-xl font-black text-cyan-300 sm:text-2xl">{card.value}</p>
            {card.detail ? <p className="mt-1 text-xs text-zinc-500">{card.detail}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function StoryCard({ card }: { card: SeasonStoryCard }) {
  return (
    <Link href={`/public/fixtures/${card.fixtureId}`} className="block rounded-2xl border border-white/[.08] bg-[#0b100e] p-4 transition hover:border-cyan-400/40">
      <p className="text-[10px] uppercase tracking-[.15em] text-cyan-400">{card.title}</p>
      <p className="mt-1 text-lg font-black">{card.value}</p>
      <p className="mt-1 text-xs text-zinc-500">{card.detail}</p>
    </Link>
  );
}

function LeaderboardCard({ label, entries }: { label: string; entries: LeaderboardEntry[] }) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-4">
      <p className="text-sm font-bold text-cyan-400">{label}</p>
      <ol className="mt-2 space-y-1.5 text-sm">
        {entries.map((e, i) => (
          <li key={e.playerId} className="flex items-center justify-between gap-2 border-b border-white/[.04] py-1 last:border-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-zinc-600">{i + 1}</span>
              <span className="truncate">{e.name}</span>
              <span className="shrink-0 text-xs text-zinc-600">{e.seasonClubShortName}</span>
            </span>
            <span className="shrink-0 font-bold text-zinc-200">{e.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
