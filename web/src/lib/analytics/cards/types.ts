import type { GameAnalyticsCapability } from "@/lib/game-data-capability";

// Shared shape for every broadcast/share/web card view model. A view model is the ONLY thing a
// visual card component may consume — it is built once from already-computed canonical analytics
// (Player/Team DNA, rank context, records, milestones, game story, etc.) and is plain, serializable
// data: no Prisma types, no React, no formatting logic left for the component to invent. The same
// view model powers the web embed, the broadcast composition, and the share route — one
// calculation, three renderers.

export type CardMetric = { label: string; value: string };

export type CardProvenance = { source: string; qualification: string };

export type CardBase = {
  title: string;
  eyebrow: string;
  subject: string;
  subjectImage: string | null;
  club: string | null;
  primaryMetric: CardMetric;
  supportingMetrics: CardMetric[];
  rankContext: string | null;
  provenance: CardProvenance;
  capability: GameAnalyticsCapability;
};

export type CardFormat = "WEB" | "BROADCAST_16_9" | "SOCIAL_SQUARE" | "SOCIAL_PORTRAIT";

export type SponsorSlot = { label: string; logoUrl: string } | undefined;

export type SocialCopy = { headline: string; subject: string; stat: string };

// Deterministic structured captions for social posting — never auto-posted anywhere, and never
// freeform/LLM-generated. A caller (a social media tool, a manual copy-paste flow) formats these
// three fields however it needs; this function only guarantees they're always derived from the
// same card view model shown on the page, so the caption can never drift from what's displayed.
export function toSocialCopy(card: CardBase): SocialCopy {
  return { headline: card.eyebrow, subject: card.subject, stat: `${card.primaryMetric.label}: ${card.primaryMetric.value}` };
}
