import Link from "next/link";
import type { LivePresentationModel } from "@/lib/live-presentation-model";
import { buildGraphicSuggestions } from "@/lib/broadcast-suggestions";

// G.18 Part XVIII-XX, extended G.19 Part XLIV: the commentator's "understand the game within
// seconds" surface, and the same card the authenticated `/rehearsal/broadcast/[fixtureId]` route
// renders for a rehearsal fixture (G.19 Part IV) - one implementation, never two. Every number
// here comes from the same LivePresentationModel the public Game Center renders; nothing is
// calculated locally. Informational only - it links to, but does not embed, the Broadcast
// Control Panel (Part XLIV: "do not turn commentator dashboard into broadcast-control UI").
export function CommentatorCommandCenter({
  fixture,
  model,
  rehearsal = false,
}: {
  fixture: { id: string; homeSeasonClub: { club: { name: string; shortName: string } }; awaySeasonClub: { club: { name: string; shortName: string } } };
  model: LivePresentationModel;
  rehearsal?: boolean;
}) {
  const suggestions = buildGraphicSuggestions(model);
  return (
    <section className={`mt-6 rounded-2xl border p-5 ${rehearsal ? "border-fuchsia-400/40 bg-fuchsia-400/[.04]" : "border-amber-400/40 bg-amber-400/[.04]"}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${rehearsal ? "text-fuchsia-400" : "text-amber-400"}`}>
        {rehearsal ? "Rehearsal · Commentator Command Center" : "Live now · Commentator Command Center"}
      </p>
      <p className="mt-2 text-2xl font-black">
        {fixture.homeSeasonClub.club.shortName} {model.score.home} — {model.score.away} {fixture.awaySeasonClub.club.shortName}
      </p>
      <p className="text-sm text-zinc-500">
        {model.periodLabel} · {Math.floor(model.clock.remainingSeconds / 60)}:{(model.clock.remainingSeconds % 60).toString().padStart(2, "0")} · shot clock {model.shotClock.remainingSeconds}
        {model.ultraTime.phase === "ACTIVE" ? <span className="ml-2 font-bold text-amber-400">⚡ ULTRA TIME ×2</span> : null}
        {model.ultraTime.phase === "APPROACHING" ? <span className="ml-2 text-amber-300">Ultra Time in {model.ultraTime.secondsUntilStart}s</span> : null}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">Game leaders</p>
          <div className="mt-1 space-y-0.5 text-sm">
            {model.leaders.map((l) => <p key={l.category} className="text-zinc-300">{l.category} — <span className="font-semibold text-white">{l.value}</span></p>)}
            {model.leaders.length === 0 ? <p className="text-zinc-600">No statistician events yet.</p> : null}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">Team comparison</p>
          <table className="mt-1 w-full text-sm">
            <tbody>
              {model.teamComparison.map((row) => (
                <tr key={row.label}><td className="text-zinc-500">{row.label}</td><td className="text-right text-zinc-300">{row.home}</td><td className="text-right text-zinc-300">{row.away}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {model.dataCapability === "FULL_ULTRA" ? (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">Ultra Intelligence</p>
          <div className="mt-1 flex gap-6 text-sm">
            <span>4PT MAKES — {fixture.homeSeasonClub.club.shortName} {model.fourPoint.home?.made ?? 0} · {fixture.awaySeasonClub.club.shortName} {model.fourPoint.away?.made ?? 0}</span>
          </div>
        </div>
      ) : null}

      {model.gameStory ? (
        <div className="mt-4 border-t border-white/[.08] pt-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">
            {model.gameStory.provisional ? "Live Game Story · Provisional" : "Game Story"}
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">{model.gameStory.tags.map((t) => t.replaceAll("_", " ")).join(" · ")}</p>
          {model.gameStory.facts.map((f, i) => <p key={i} className="text-xs text-zinc-400">{f}</p>)}
        </div>
      ) : null}

      {model.gamePulse.leadChanges > 0 || model.gamePulse.largestLead || model.gamePulse.currentRun ? (
        <div className="mt-4 border-t border-white/[.08] pt-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">Game Pulse</p>
          <p className="mt-1 text-sm text-zinc-300">
            {model.gamePulse.leadChanges} lead changes · {model.gamePulse.ties} ties
            {model.gamePulse.largestLead ? ` · largest lead ${model.gamePulse.largestLead.team === "HOME" ? fixture.homeSeasonClub.club.shortName : fixture.awaySeasonClub.club.shortName} +${model.gamePulse.largestLead.margin}` : ""}
            {model.gamePulse.currentRun ? ` · current run ${model.gamePulse.currentRun.team === "HOME" ? fixture.homeSeasonClub.club.shortName : fixture.awaySeasonClub.club.shortName} ${model.gamePulse.currentRun.points}–0` : ""}
          </p>
        </div>
      ) : null}

      {model.talkingPoints.length > 0 ? (
        <div className="mt-4 border-t border-white/[.08] pt-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">Talking points</p>
          <ul className="mt-1 space-y-1 text-sm text-zinc-300">
            {model.talkingPoints.map((p, i) => <li key={i}>• {p}</li>)}
          </ul>
        </div>
      ) : null}

      {model.recordWatches.length > 0 ? (
        <div className="mt-4 rounded-lg border border-violet-400/30 bg-violet-400/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300">Record watch — provisional</p>
          {model.recordWatches.map((w) => (
            <p key={w.recordKey} className="text-sm text-violet-200">{w.recordTitle}: {w.liveValue} ({w.status.replace("_", " ")})</p>
          ))}
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/[.06] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">Graphics suggestions</p>
          <ul className="mt-1 space-y-1 text-sm text-cyan-100">
            {suggestions.map((s, i) => <li key={i}>{s.reason}</li>)}
          </ul>
          <Link href={rehearsal ? `/broadcast/control?rehearsal=${fixture.id}` : "/broadcast/control"} className="mt-2 inline-block text-xs font-bold text-cyan-400 hover:underline">
            Open Broadcast Control →
          </Link>
        </div>
      ) : null}

      <Link href={rehearsal ? `/rehearsal/live/${fixture.id}` : `/public/fixtures/${fixture.id}`} className="mt-4 inline-block text-xs text-cyan-400">
        {rehearsal ? "Open rehearsal public view →" : "Open public game page →"}
      </Link>
    </section>
  );
}
