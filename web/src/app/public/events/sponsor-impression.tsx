"use client";

import { useEffect } from "react";

export function SponsorImpression({ campaignId }: { campaignId: string }) {
  useEffect(() => {
    void fetch(`/api/sponsor-impressions/${campaignId}`, {
      method: "POST",
      keepalive: true,
    });
  }, [campaignId]);
  return null;
}
