import { ImageResponse } from "next/og";
import { GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL } from "@/lib/game-data-capability";
import type { CardBase, CardFormat } from "./types";

// Server-side PNG rendering for any CardBase-shaped view model, via next/og's built-in
// ImageResponse (Satori + resvg) — already bundled with Next.js, no new dependency added. This
// consumes the exact same card view model the web/broadcast/social HTML renderers use; nothing
// here recomputes a number, and nothing here prints an internal filename, database ID, or PII —
// only the same public-safe fields already shown on the card (see CardBase.provenance for the
// public-safe source label; the underlying calculation/DB id is never included in the image).

const DIMENSIONS: Record<CardFormat, { width: number; height: number }> = {
  WEB: { width: 1200, height: 630 },
  SOCIAL_SQUARE: { width: 1080, height: 1080 },
  SOCIAL_PORTRAIT: { width: 1080, height: 1350 },
  BROADCAST_16_9: { width: 1920, height: 1080 },
};

export function cardPngDimensions(format: CardFormat) {
  return DIMENSIONS[format];
}

export function renderCardPng(card: CardBase, format: CardFormat = "SOCIAL_SQUARE") {
  const { width, height } = DIMENSIONS[format];
  const pad = Math.round(Math.min(width, height) * 0.07);

  return new ImageResponse(
    (
      <div
        style={{
          width, height, display: "flex", flexDirection: "column", padding: pad,
          background: "linear-gradient(150deg, #0b100e 0%, #050807 70%)",
          color: "#ffffff", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#22d3ee" }}>
            {card.eyebrow}
          </div>
          <div style={{ display: "flex", fontSize: 20, textTransform: "uppercase", letterSpacing: 2, color: "#a1a1aa", border: "2px solid rgba(255,255,255,0.15)", borderRadius: 999, padding: "6px 16px" }}>
            {GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL[card.capability]}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 900, lineHeight: 1.05 }}>{card.subject}</div>
          {card.club ? <div style={{ display: "flex", fontSize: 28, color: "#71717a", marginTop: 8 }}>{card.club}</div> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
          <div style={{ display: "flex", fontSize: 22, textTransform: "uppercase", letterSpacing: 2, color: "#71717a" }}>{card.primaryMetric.label}</div>
          <div style={{ display: "flex", fontSize: 120, fontWeight: 900, lineHeight: 1 }}>{card.primaryMetric.value}</div>
        </div>

        {card.supportingMetrics.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 32 }}>
            {card.supportingMetrics.slice(0, 5).map((m) => (
              <div key={m.label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 18, textTransform: "uppercase", letterSpacing: 1, color: "#52525b" }}>{m.label}</div>
                <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#e4e4e7" }}>{m.value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {card.rankContext ? (
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#22d3ee", marginTop: 32 }}>{card.rankContext}</div>
        ) : null}

        <div style={{ display: "flex", flexGrow: 1 }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#3f3f46", letterSpacing: 1, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>{card.title} · Season Zero</div>
          <div style={{ display: "flex" }}>Ultra Basketball</div>
        </div>
      </div>
    ),
    { width, height },
  );
}
