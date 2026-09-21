import Link from "next/link";
import { GameClock } from "@/app/games/game-clock";
import type { LivePresentationModel } from "@/lib/live-presentation-model";
import type { computeSnapshotHealth } from "@/lib/system-health";

// The one live-game card, shared by the public `/live` route and the authenticated
// `/rehearsal/live/[fixtureId]` route (G.19 Part IV) - a rehearsal operator sees exactly the
// same rendering a spectator would see, never a second implementation that could quietly drift.
// Mobile hierarchy per G.19 Part XLV: score -> clock -> Ultra Time -> leaders -> story -> pulse
// -> team comparison -> moments, so the page doesn't grow tall before the essentials appear.
export function LiveGameHero({
  fixture,
  model,
  href,
  rehearsal = false,
  staleness,
}: {
  fixture: { id: string; homeSeasonClub: { club: { name: string; shortName: string; logoUrl: string | null } }; awaySeasonClub: { club: { name: string; shortName: string; logoUrl: string | null } } };
  model: LivePresentationModel;
  href: string;
  rehearsal?: boolean;
  staleness?: ReturnType<typeof computeSnapshotHealth>;
}) {
  return (
    <Link href={href} className="block">
      <section className={`rounded-lg border p-6 ${rehearsal ? "border-accent-purple/40 bg-[#120a14]" : "border-brand-400/30 bg-ink-800"}`}>
        {rehearsal ? (
          <p className="mb-3 text-center text-[10px] font-black uppercase tracking-[.3em] text-accent-purple">Rehearsal — not public</p>
        ) : null}
        {staleness && (staleness.freshness === "DELAYED" || staleness.freshness === "STALE") ? (
          <p className={`mb-3 text-center text-xs font-bold uppercase tracking-wide ${staleness.freshness === "STALE" ? "text-danger" : "text-warn"}`}>
            LIVE DATA DELAYED · last updated {staleness.ageSeconds}s ago
          </p>
        ) : null}
        {model.ultraTime.phase === "ACTIVE" ? (
          <p className="mb-3 text-center text-sm font-black tracking-wide text-warn">⚡ ULTRA TIME — ALL POINTS ×2</p>
        ) : model.ultraTime.phase === "APPROACHING" ? (
          <p className="mb-3 text-center text-xs font-bold text-warn">ULTRA TIME IN 00:{model.ultraTime.secondsUntilStart.toString().padStart(2, "0")}</p>
        ) : null}

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <p className="text-lg font-semibold">{fixture.homeSeasonClub!.club.name}</p>
          <p className="font-mono text-5xl font-black tabular-nums">{model.score.home} — {model.score.away}</p>
          <p className="text-lg font-semibold">{fixture.awaySeasonClub!.club.name}</p>
        </div>
        <p className="mt-3 text-center text-sm text-text-3">
          {model.periodLabel} · <GameClock seconds={model.clock.remainingSeconds} status={model.clock.running ? "LIVE" : "PAUSED"} startedAt={null} />
          {" · shot clock "}
          <GameClock seconds={model.shotClock.remainingSeconds} status={model.shotClock.running ? "LIVE" : "PAUSED"} startedAt={null} />
        </p>

        {model.leaders.length > 0 ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[10px] uppercase tracking-wider text-text-3">Game leaders</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {model.leaders.filter((l) => ["POINTS", "REBOUNDS", "ASSISTS"].includes(l.category)).map((l) => (
                <span key={l.category} className="text-text-1">{l.category.slice(0, 3)} <span className="font-semibold text-white">{l.value}</span></span>
              ))}
            </div>
          </div>
        ) : null}

        {model.gameStory ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[10px] uppercase tracking-wider text-text-3">
              {model.gameStory.provisional ? "Live Game Story · Provisional" : "Game Story"}
            </p>
            <p className="mt-1 text-sm font-semibold text-text-1">{model.gameStory.tags[0]?.replaceAll("_", " ")}</p>
            {model.gameStory.facts[0] ? <p className="mt-1 text-xs text-text-2">{model.gameStory.facts[0]}</p> : null}
          </div>
        ) : null}

        {model.gamePulse.leadChanges > 0 || model.gamePulse.largestLead ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-text-3">
            <span>{model.gamePulse.leadChanges} lead changes</span>
            {model.gamePulse.largestLead ? (
              <span>Largest lead: {model.gamePulse.largestLead.team === "HOME" ? fixture.homeSeasonClub!.club.shortName : fixture.awaySeasonClub!.club.shortName} by {model.gamePulse.largestLead.margin}</span>
            ) : null}
            {model.gamePulse.currentRun && model.gamePulse.currentRun.points >= 4 ? (
              <span className="text-warn">{model.gamePulse.currentRun.team === "HOME" ? fixture.homeSeasonClub!.club.shortName : fixture.awaySeasonClub!.club.shortName} on a {model.gamePulse.currentRun.points}–0 run</span>
            ) : null}
          </div>
        ) : null}

        {model.fourPoint.home || model.fourPoint.away ? (
          <div className="mt-4 flex justify-center gap-6 text-xs text-accent-purple">
            <span>4PT {fixture.homeSeasonClub!.club.shortName} {model.fourPoint.home?.made ?? 0}</span>
            <span>4PT {fixture.awaySeasonClub!.club.shortName} {model.fourPoint.away?.made ?? 0}</span>
          </div>
        ) : null}

        {model.teamComparison.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[10px] uppercase tracking-wider text-text-3">Team comparison</p>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-text-2">
              {model.teamComparison.map((row) => (
                <span key={row.label}>{row.home} <span className="text-text-3">{row.label}</span> {row.away}</span>
              ))}
            </div>
          </div>
        ) : null}

        {model.momentFeed.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3 text-xs text-text-3">
            <p className="text-text-1">{model.momentFeed[0].clockLabel} — {model.momentFeed[0].text}</p>
          </div>
        ) : null}
      </section>
    </Link>
  );
}
