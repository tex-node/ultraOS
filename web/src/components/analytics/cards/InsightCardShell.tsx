import type { CardFormat, SponsorSlot } from "@/lib/analytics/cards/types";

// The one reusable frame every card format renders inside. Percentage-based padding keeps the
// safe-area margin proportional at every aspect ratio, so broadcast/social exports never clip
// text against the edge and a lower-third/scorebug always has clear space to sit below a
// BROADCAST_16_9 card. Web embeds don't need a fixed aspect ratio — WEB renders as a normal
// flow card instead of a locked box.

const ASPECT_CLASS: Record<CardFormat, string> = {
  WEB: "",
  BROADCAST_16_9: "aspect-video",
  SOCIAL_SQUARE: "aspect-square",
  SOCIAL_PORTRAIT: "aspect-[4/5]",
};

const MAX_WIDTH_CLASS: Record<CardFormat, string> = {
  WEB: "max-w-md",
  BROADCAST_16_9: "max-w-2xl",
  SOCIAL_SQUARE: "max-w-md",
  SOCIAL_PORTRAIT: "max-w-sm",
};

export function InsightCardShell({
  format,
  accentColor = "#22d3ee",
  sponsorSlot,
  children,
}: {
  format: CardFormat;
  accentColor?: string;
  sponsorSlot?: SponsorSlot;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-2xl border ${ASPECT_CLASS[format]} ${MAX_WIDTH_CLASS[format]}`}
      style={{ borderColor: `${accentColor}30`, background: `linear-gradient(150deg, ${accentColor}0f, #050807 70%)` }}
    >
      {/* 6% safe-area padding on every side — overscan/lower-third-safe at broadcast scale, and generous enough on web/social too */}
      <div className="flex h-full flex-col p-[6%]">{children}</div>
      {sponsorSlot ? (
        <div className="absolute bottom-[4%] right-[5%] flex items-center gap-1.5 opacity-80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sponsorSlot.logoUrl} alt={sponsorSlot.label} className="h-5 w-auto object-contain" />
        </div>
      ) : null}
    </div>
  );
}

export function CardCapabilityBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/[.12] bg-black/30 px-2 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">
      {label}
    </span>
  );
}
