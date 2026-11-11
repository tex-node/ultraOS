import Link from "next/link";
import { buildSquadDevelopmentPlans } from "@/lib/coaching/player-development";
import { squadNeedsPositions } from "@/lib/coaching/squad-setup";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { Banner, Card, formatDate, Num, SectionTitle } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function CoachingClubHome({ params }: { params: Promise<{ seasonClubId: string }> }) {
  const { seasonClubId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);

  const plans = buildSquadDevelopmentPlans(data.games, seasonClubId, data.meta);
  const assessed = plans.filter((p) => p.status === "OK");
  const withFocus = assessed.filter((p) => p.focusAreas.length > 0);
  const base = `/coaching/${seasonClubId}`;

  const next = data.upcoming[0];
  const clubName = (id: string) => data.clubs.find((c) => c.seasonClubId === id)?.name ?? "Opponent";
  const played = data.games
    .filter((g) => g.home.seasonClubId === seasonClubId || g.away.seasonClubId === seasonClubId)
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-1">{scope.clubName}</h1>
      {squadNeedsPositions(data.roster) ? (
        <div className="mt-3"><Banner>Positions are not set for most of the squad. <Link href={`${base}/squad/setup`} className="font-semibold text-info underline">Set up the squad</Link></Banner></div>
      ) : null}

      <SectionTitle>Squad</SectionTitle>
      <Link href={`${base}/squad`}>
        <Card>
          <p className="text-sm text-text-1"><Num>{withFocus.length}</Num> of <Num>{assessed.length}</Num> assessed players have focus areas</p>
          <p className="mt-1 text-xs text-text-3"><Num>{plans.length - assessed.length}</Num> more need more games before they can be assessed.</p>
        </Card>
      </Link>

      <SectionTitle>Training</SectionTitle>
      <Link href={`${base}/training`}>
        <Card>
          <p className="text-sm text-text-1">Training week</p>
          <p className="mt-1 text-xs text-text-3">Assign an adopted plan to a session, log completion and the target metric.</p>
        </Card>
      </Link>

      <SectionTitle>Next opponent</SectionTitle>
      {next ? (
        <Link href={`${base}/opponents/${next.opponent.seasonClubId}`}>
          <Card>
            <p className="text-base font-semibold text-text-1">{next.isHome ? "vs" : "at"} {next.opponent.name}</p>
            <p className="text-xs text-text-3">{formatDate(next.scheduledAt)}</p>
          </Card>
        </Link>
      ) : (
        <Card quiet>
          <p data-state="no-fixture" className="text-sm text-text-2">No fixture scheduled. Pick an opponent to plan for.</p>
          <Link href={`${base}/opponents`} className="mt-1 inline-block text-xs text-info">All opponents</Link>
        </Card>
      )}

      <SectionTitle>Recent reviews</SectionTitle>
      {played.length > 0 ? (
        <ul className="space-y-2">
          {played.slice(0, 3).map((g) => {
            const isHome = g.home.seasonClubId === seasonClubId;
            const opp = isHome ? g.away : g.home;
            const mine = isHome ? g.home.score : g.away.score;
            const theirs = isHome ? g.away.score : g.home.score;
            return (
              <li key={g.gameId}>
                <Link href={`${base}/review/${g.gameId}`}>
                  <Card className="text-sm"><span className="text-text-1">vs {clubName(opp.seasonClubId)}</span> <span className="text-xs text-text-3">· {formatDate(g.scheduledAt)} · <Num>{mine}-{theirs}</Num></span></Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-3">No finished games yet.</p>
      )}
    </div>
  );
}
