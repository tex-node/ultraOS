import { GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL } from "@/lib/game-data-capability";
import type { CardBase, CardFormat, SponsorSlot } from "@/lib/analytics/cards/types";
import { CardCapabilityBadge, InsightCardShell } from "./InsightCardShell";

// Generic renderer for any CardBase-shaped view model — Player Spotlight, Game Star, Player DNA,
// Team Profile, Category Leader, Record, and Milestone all share this exact layout. A card that
// needs a genuinely different shape (score display, DNA bars, matchup edges) gets its own small
// wrapper (see GameResultCardView / TeamDnaCardView / MatchupCardView) rather than growing this
// component's branching logic.

export function AnalyticsCard({ card, format = "WEB", sponsorSlot }: { card: CardBase; format?: CardFormat; sponsorSlot?: SponsorSlot }) {
  return (
    <InsightCardShell format={format} sponsorSlot={sponsorSlot}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-400">{card.eyebrow}</p>
        <CardCapabilityBadge label={GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL[card.capability]} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        {card.subjectImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.subjectImage} alt={`${card.subject} photo`} className="h-14 w-14 rounded-xl object-cover" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-xl border border-white/[.12] text-sm font-black text-zinc-500" aria-hidden="true">
            {card.subject.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <h3 className="text-lg font-black leading-tight text-white">{card.subject}</h3>
          {card.club ? <p className="text-xs text-zinc-500">{card.club}</p> : null}
        </div>
      </div>

      <dl className="mt-4">
        <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{card.primaryMetric.label}</dt>
        <dd className="text-3xl font-black text-white">{card.primaryMetric.value}</dd>
      </dl>

      {card.supportingMetrics.length > 0 ? (
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {card.supportingMetrics.map((m) => (
            <div key={m.label}>
              <dt className="inline text-[10px] uppercase tracking-wide text-zinc-600">{m.label}: </dt>
              <dd className="inline text-sm font-semibold text-zinc-300">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {card.rankContext ? <p className="mt-3 text-xs font-bold text-cyan-300">{card.rankContext}</p> : null}

      <p className="mt-auto pt-3 text-[9px] text-zinc-700">{card.title} · Season Zero</p>
    </InsightCardShell>
  );
}
