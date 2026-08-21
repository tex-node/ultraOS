import { GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL } from "@/lib/game-data-capability";
import type { TeamDnaCard } from "@/lib/analytics/cards/team-cards";
import type { CardFormat, SponsorSlot } from "@/lib/analytics/cards/types";
import { CardCapabilityBadge, InsightCardShell } from "./InsightCardShell";

// Broadcast composition prefers horizontal trait bars over a radar chart at card scale (see
// buildTeamDnaCard's comment) — the web-page club view still uses the full radar-adjacent bar
// list; this is the compact 3-5-bar broadcast/social version of the same underlying dimensions.

export function TeamDnaCardView({ card, format = "WEB", sponsorSlot }: { card: TeamDnaCard; format?: CardFormat; sponsorSlot?: SponsorSlot }) {
  return (
    <InsightCardShell format={format} sponsorSlot={sponsorSlot}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-400">{card.eyebrow}</p>
        <CardCapabilityBadge label={GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL[card.capability]} />
      </div>
      <h3 className="mt-2 text-lg font-black text-white">{card.subject}</h3>
      {card.club ? <p className="text-xs text-zinc-500">{card.club}</p> : null}
      <div className="mt-4 space-y-2.5">
        {card.bars.map((b) => (
          <div key={b.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-400">{b.label}</span>
            <span className="font-bold text-cyan-300">{b.value} league</span>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-3 text-[9px] text-zinc-700">Team DNA · Season Zero</p>
    </InsightCardShell>
  );
}
