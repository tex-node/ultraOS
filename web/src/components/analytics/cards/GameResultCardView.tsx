import { GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL } from "@/lib/game-data-capability";
import type { GameResultCard } from "@/lib/analytics/cards/game-cards";
import type { CardFormat, SponsorSlot } from "@/lib/analytics/cards/types";
import { CardCapabilityBadge, InsightCardShell } from "./InsightCardShell";

export function GameResultCardView({ card, format = "WEB", sponsorSlot }: { card: GameResultCard; format?: CardFormat; sponsorSlot?: SponsorSlot }) {
  const [homeShortName, awayShortName] = card.subject.split(" vs ");
  return (
    <InsightCardShell format={format} sponsorSlot={sponsorSlot}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-400">{card.title}</p>
        <CardCapabilityBadge label={GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL[card.capability]} />
      </div>
      <div className="mt-4 flex items-center justify-center gap-6 text-center">
        <div>
          <p className="text-sm font-bold text-zinc-300">{homeShortName}</p>
          <p className="text-4xl font-black text-white">{card.homeScore}</p>
        </div>
        <p className="text-zinc-700">–</p>
        <div>
          <p className="text-sm font-bold text-zinc-300">{awayShortName}</p>
          <p className="text-4xl font-black text-white">{card.awayScore}</p>
        </div>
      </div>
      {card.storyTag ? <p className="mt-3 text-center text-xs font-bold uppercase tracking-wide text-cyan-300">{card.storyTag}</p> : null}
      {card.supportingMetrics.length > 0 ? (
        <p className="mt-3 text-center text-xs text-zinc-500">
          {card.supportingMetrics.map((m) => `${m.label}: ${m.value}`).join(" · ")}
        </p>
      ) : null}
      <p className="mt-auto pt-3 text-center text-[9px] text-zinc-700">Season Zero</p>
    </InsightCardShell>
  );
}
