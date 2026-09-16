import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { computeSeasonTeamTotals, type SeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import type { SeasonPlayerTotals } from "@/lib/analytics/league-analytics";
import { computeLeagueTeamDna, type TeamDna } from "@/lib/analytics/team-dna";
import { computeLeaguePlayerDna, type PlayerDna } from "@/lib/analytics/player-dna";
import { computePlayerRanks } from "@/lib/analytics/rank-context";
import { buildPlayerLeaderboard } from "@/lib/analytics/league-analytics";
import { buildPlayerMilestones, buildTeamMilestones, type PlayerMilestone, type TeamMilestone } from "@/lib/analytics/milestones";
import { buildGameRecords, buildPlayerSeasonRecords, buildPlayerSingleGameRecords, buildTeamRecords, type RecordEntry } from "@/lib/analytics/records";
import { selectTopPerformers } from "@/lib/analytics/player-analytics";
import { rankWhyTheyWon } from "@/lib/analytics/why-they-won";
import type { GameCore } from "@/lib/analytics/types";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABS = ["players", "teams", "games", "leaders", "records", "milestones", "matchups"] as const;
type Tab = (typeof TABS)[number];

const CATEGORY_LEADERS: { key: Parameters<typeof buildPlayerLeaderboard>[1]; label: string }[] = [
  { key: "PPG", label: "Scoring Leader" },
  { key: "RPG", label: "Rebounding Leader" },
  { key: "APG", label: "Assist Leader" },
  { key: "FG_PCT", label: "FG% Leader" },
  { key: "THREE_PCT", label: "3PT% Leader" },
];

export default async function BroadcastGraphics({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/broadcast/graphics");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "players";

  const season = await withOrganizationContext(organizationId, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-6xl px-6 py-10"><p>No active season.</p></main>
      </OperationsShell>
    );
  }

  // One shared season load — every tab below derives from these same in-memory calculations,
  // never a per-card independent Prisma query (see performance note in the operator guide).
  const [games, playerTotals, seasonClubs] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    loadSeasonGameCores(season.id, tx),
    loadSeasonPlayerTotals(season.id, tx),
    tx.seasonClub!.findMany({ where: { seasonId: season.id }, select: { id: true, clubId: true, club: { select: { name: true } } } }),
  ]));
  const clubIdBySeasonClubId = new Map(seasonClubs.map((sc) => [sc.id, sc.clubId]));
  const teamTotalsByClub = computeSeasonTeamTotals(games);
  const teamTotals = [...teamTotalsByClub.values()];
  const dnaByTeam = computeLeagueTeamDna(games);
  const dnaByPlayer = computeLeaguePlayerDna(playerTotals);
  const playerMilestones = buildPlayerMilestones(games);
  const teamMilestones = buildTeamMilestones(games);
  const records: RecordEntry[] = [
    ...buildPlayerSingleGameRecords(games),
    ...buildPlayerSeasonRecords(playerTotals),
    ...buildTeamRecords(games),
    ...buildGameRecords(games),
  ];

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-cyan-400">{season.name} · Media Production</p>
        <h1 className="mt-2 text-3xl font-bold">Broadcast Graphics</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Every graphic here is generated from the same verified analytics engine as the public website — pick a subject, pick a card, pick a format.
        </p>

        <nav className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/broadcast/graphics?tab=${t}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${t === tab ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300" : "border-white/[.12] text-zinc-400 hover:border-white/[.25]"}`}
            >
              {t}
            </Link>
          ))}
        </nav>

        {tab === "players" ? <PlayersTab playerTotals={playerTotals} dnaByPlayer={dnaByPlayer} playerMilestones={playerMilestones} /> : null}
        {tab === "teams" ? <TeamsTab teamTotals={teamTotals} dnaByTeam={dnaByTeam} teamMilestones={teamMilestones} clubIdBySeasonClubId={clubIdBySeasonClubId} /> : null}
        {tab === "games" ? <GamesTab games={games} /> : null}
        {tab === "leaders" ? <LeadersTab playerTotals={playerTotals} /> : null}
        {tab === "records" ? <RecordsTab records={records} /> : null}
        {tab === "milestones" ? <MilestonesTab playerMilestones={playerMilestones} teamMilestones={teamMilestones} clubIdBySeasonClubId={clubIdBySeasonClubId} /> : null}
        {tab === "matchups" ? <MatchupsTab playerTotals={playerTotals} teamTotals={teamTotals} clubIdBySeasonClubId={clubIdBySeasonClubId} /> : null}
      </main>
    </OperationsShell>
  );
}

function CardButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-md border border-white/[.12] bg-black/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300 hover:border-cyan-400/40">
      {label}
    </Link>
  );
}

function SubjectRow({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
      <p className="text-sm font-bold text-zinc-200">{title}</p>
      {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PlayersTab({
  playerTotals,
  dnaByPlayer,
  playerMilestones,
}: {
  playerTotals: SeasonPlayerTotals[];
  dnaByPlayer: Map<string, PlayerDna>;
  playerMilestones: PlayerMilestone[];
}) {
  const active = playerTotals.filter((p) => p.gamesPlayed > 0).sort((a, b) => a.name.localeCompare(b.name));
  const milestoneCountByPlayer = new Map<string, number>();
  for (const m of playerMilestones) milestoneCountByPlayer.set(m.playerId, (milestoneCountByPlayer.get(m.playerId) ?? 0) + 1);

  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {active.map((p) => {
        const dna = dnaByPlayer.get(p.playerId);
        const ranks = computePlayerRanks(p.playerId, playerTotals);
        const isLeader = ranks.some((r) => r.rank === 1);
        const hasMilestone = (milestoneCountByPlayer.get(p.playerId) ?? 0) > 0;
        return (
          <SubjectRow key={p.playerId} title={p.name} subtitle={p.seasonClubShortName}>
            <CardButton href={`/broadcast/graphics/preview?subject=player&id=${p.playerId}&card=spotlight`} label="Spotlight" />
            {dna && dna.qualification === "QUALIFIED" ? <CardButton href={`/broadcast/graphics/preview?subject=player&id=${p.playerId}&card=dna`} label="DNA" /> : null}
            <CardButton href={`/broadcast/graphics/preview?subject=player&id=${p.playerId}&card=bestgame`} label="Best Game" />
            {hasMilestone ? <CardButton href={`/broadcast/graphics/preview?subject=player&id=${p.playerId}&card=milestone`} label="Milestone" /> : null}
            {isLeader ? <CardButton href={`/broadcast/graphics/preview?subject=player&id=${p.playerId}&card=leader`} label="Season Leader" /> : null}
          </SubjectRow>
        );
      })}
    </section>
  );
}

function TeamsTab({
  teamTotals,
  dnaByTeam,
  teamMilestones,
  clubIdBySeasonClubId,
}: {
  teamTotals: SeasonTeamTotals[];
  dnaByTeam: Map<string, TeamDna>;
  teamMilestones: TeamMilestone[];
  clubIdBySeasonClubId: Map<string, string>;
}) {
  const milestoneCountByTeam = new Map<string, number>();
  for (const m of teamMilestones) milestoneCountByTeam.set(m.seasonClubId, (milestoneCountByTeam.get(m.seasonClubId) ?? 0) + 1);

  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {teamTotals.map((t) => {
        const dna = dnaByTeam.get(t.seasonClubId);
        const hasMilestone = (milestoneCountByTeam.get(t.seasonClubId) ?? 0) > 0;
        const clubId = clubIdBySeasonClubId.get(t.seasonClubId);
        return (
          <SubjectRow key={t.seasonClubId} title={t.name} subtitle={`${t.wins}-${t.losses}`}>
            <CardButton href={`/broadcast/graphics/preview?subject=team&id=${t.seasonClubId}&card=profile`} label="Team Profile" />
            {dna && dna.qualification === "QUALIFIED" ? <CardButton href={`/broadcast/graphics/preview?subject=team&id=${t.seasonClubId}&card=dna`} label="Team DNA" /> : null}
            <CardButton href={`/broadcast/graphics/preview?subject=team&id=${t.seasonClubId}&card=bestperf`} label="Best Performance" />
            {hasMilestone ? <CardButton href={`/broadcast/graphics/preview?subject=team&id=${t.seasonClubId}&card=milestone`} label="Milestone" /> : null}
            {clubId ? <Link href={`/public/clubs/${clubId}`} className="rounded-md border border-white/[.08] px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:border-white/[.2]">View Page</Link> : null}
          </SubjectRow>
        );
      })}
    </section>
  );
}

function GamesTab({ games }: { games: GameCore[] }) {
  const finalGames = games.filter((g) => g.status === "FINAL").sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2">
      {finalGames.map((g) => {
        const hasGameStar = selectTopPerformers(g).some((p) => p.category === "GAME_STAR");
        const hasWhyTheyWon = rankWhyTheyWon(g).length > 0;
        return (
          <SubjectRow key={g.fixtureId} title={`${g.home.shortName} vs ${g.away.shortName}`} subtitle={`${g.home.score} – ${g.away.score}`}>
            <CardButton href={`/broadcast/graphics/preview?subject=game&id=${g.fixtureId}&card=result`} label="Game Result" />
            {hasGameStar ? <CardButton href={`/broadcast/graphics/preview?subject=game&id=${g.fixtureId}&card=star`} label="Game Star" /> : null}
            {hasWhyTheyWon ? <CardButton href={`/broadcast/graphics/preview?subject=game&id=${g.fixtureId}&card=whytheywon`} label="Why They Won" /> : null}
            <Link href={`/public/fixtures/${g.fixtureId}`} className="rounded-md border border-white/[.08] px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:border-white/[.2]">Full Story</Link>
          </SubjectRow>
        );
      })}
    </section>
  );
}

function LeadersTab({ playerTotals }: { playerTotals: SeasonPlayerTotals[] }) {
  const boards = CATEGORY_LEADERS.map((c) => ({ ...c, entries: buildPlayerLeaderboard(playerTotals, c.key) })).filter((b) => b.entries.length > 0);
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((b) => (
        <SubjectRow key={b.key} title={b.label} subtitle={`${b.entries[0].name} · ${b.entries[0].value}`}>
          <CardButton href={`/broadcast/graphics/preview?subject=leader&category=${b.key}&card=leader`} label="View Card" />
        </SubjectRow>
      ))}
    </section>
  );
}

function RecordsTab({ records }: { records: RecordEntry[] }) {
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((r) => (
        <SubjectRow key={r.key} title={r.title} subtitle={`${r.holderName} · ${r.value}`}>
          <CardButton href={`/broadcast/graphics/preview?subject=record&key=${encodeURIComponent(r.key)}&card=record`} label="View Card" />
          <Link href={`/public/share/record/${encodeURIComponent(r.key)}`} className="rounded-md border border-white/[.08] px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:border-white/[.2]">Share View</Link>
        </SubjectRow>
      ))}
    </section>
  );
}

function MilestonesTab({
  playerMilestones,
  teamMilestones,
  clubIdBySeasonClubId,
}: {
  playerMilestones: PlayerMilestone[];
  teamMilestones: TeamMilestone[];
  clubIdBySeasonClubId: Map<string, string>;
}) {
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {playerMilestones.slice(-12).reverse().map((m) => (
        <SubjectRow key={`p-${m.key}-${m.fixtureId}-${m.playerId}`} title={`${m.playerName} — ${m.label}`} subtitle={`${m.value} vs ${m.opponentShortName}`}>
          <CardButton href={`/broadcast/graphics/preview?subject=player&id=${m.playerId}&card=milestone`} label="View Card" />
        </SubjectRow>
      ))}
      {teamMilestones.slice(-12).reverse().map((m) => (
        <SubjectRow key={`t-${m.key}-${m.fixtureId}-${m.seasonClubId}`} title={`${m.teamName} — ${m.label}`} subtitle={`${m.value} vs ${m.opponentShortName}`}>
          <CardButton href={`/broadcast/graphics/preview?subject=team&id=${m.seasonClubId}&card=milestone`} label="View Card" />
          {clubIdBySeasonClubId.get(m.seasonClubId) ? null : null}
        </SubjectRow>
      ))}
    </section>
  );
}

function MatchupsTab({
  playerTotals,
  teamTotals,
}: {
  playerTotals: SeasonPlayerTotals[];
  teamTotals: SeasonTeamTotals[];
  clubIdBySeasonClubId: Map<string, string>;
}) {
  const players = [...playerTotals].sort((a, b) => a.name.localeCompare(b.name));
  const teams = [...teamTotals].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="mt-6 grid gap-6 sm:grid-cols-2">
      <form action="/broadcast/graphics/preview" className="rounded-xl border border-white/[.08] bg-[#0b100e] p-4">
        <input type="hidden" name="subject" value="matchup-player" />
        <input type="hidden" name="card" value="matchup" />
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-400">Player vs Player</p>
        <select name="a" className="mt-2 w-full rounded-lg border border-white/[.12] bg-black/30 px-3 py-2 text-sm [color-scheme:dark]" required>
          <option value="" disabled>Select Player A</option>
          {players.map((p) => <option key={p.playerId} value={p.playerId}>{p.name} · {p.seasonClubShortName}</option>)}
        </select>
        <select name="b" className="mt-2 w-full rounded-lg border border-white/[.12] bg-black/30 px-3 py-2 text-sm [color-scheme:dark]" required>
          <option value="" disabled>Select Player B</option>
          {players.map((p) => <option key={p.playerId} value={p.playerId}>{p.name} · {p.seasonClubShortName}</option>)}
        </select>
        <button type="submit" className="mt-3 w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">Generate Matchup Card</button>
      </form>

      <form action="/broadcast/graphics/preview" className="rounded-xl border border-white/[.08] bg-[#0b100e] p-4">
        <input type="hidden" name="subject" value="matchup-team" />
        <input type="hidden" name="card" value="matchup" />
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-400">Team vs Team</p>
        <select name="a" className="mt-2 w-full rounded-lg border border-white/[.12] bg-black/30 px-3 py-2 text-sm [color-scheme:dark]" required>
          <option value="" disabled>Select Team A</option>
          {teams.map((t) => <option key={t.seasonClubId} value={t.seasonClubId}>{t.name}</option>)}
        </select>
        <select name="b" className="mt-2 w-full rounded-lg border border-white/[.12] bg-black/30 px-3 py-2 text-sm [color-scheme:dark]" required>
          <option value="" disabled>Select Team B</option>
          {teams.map((t) => <option key={t.seasonClubId} value={t.seasonClubId}>{t.name}</option>)}
        </select>
        <button type="submit" className="mt-3 w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">Generate Matchup Card</button>
      </form>
    </section>
  );
}
