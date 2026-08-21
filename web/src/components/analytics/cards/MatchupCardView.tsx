import { GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL } from "@/lib/game-data-capability";
import type { MatchupCard } from "@/lib/analytics/cards/game-cards";
import type { CardFormat, SponsorSlot } from "@/lib/analytics/cards/types";
import { CardCapabilityBadge, InsightCardShell } from "./InsightCardShell";

export function MatchupCardView({ card, format = "WEB", sponsorSlot }: { card: MatchupCard; format?: CardFormat; sponsorSlot?: SponsorSlot }) {
  return (
    <InsightCardShell format={format} sponsorSlot={sponsorSlot}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-400">Matchup</p>
        <CardCapabilityBadge label={GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL[card.capability]} />
      </div>
      <h3 className="mt-2 text-center text-lg font-black text-white">{card.teamA} vs {card.teamB}</h3>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {card.edges.slice(0, 6).map((e) => (
          <div key={e.label} className="rounded-lg border border-white/[.08] bg-black/20 p-2 text-center">
            <p className="text-[9px] uppercase tracking-wide text-zinc-600">{e.label}</p>
            <p className={`mt-0.5 text-xs font-bold ${e.leader === "Even" || e.leader === "—" ? "text-zinc-500" : "text-cyan-300"}`}>{e.leader}</p>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-3 text-center text-[9px] text-zinc-700">Descriptive, not a prediction · Season Zero</p>
    </InsightCardShell>
  );
}
