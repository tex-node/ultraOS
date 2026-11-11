"use client";

import { useState } from "react";

// "Embed code" for the capture console (streak v11, Prompt 4).
//
// The snippet is generated from the current origin rather than a hardcoded domain, so staging embeds point at
// staging and production at production. Copying falls back to a selectable textarea when the Clipboard API is
// unavailable (an http origin that is not localhost, or a browser that refuses the permission) - a button that
// silently does nothing is worse than one that shows the code.
export function EmbedCodeButton({ orgSlug, fixtureId }: { orgSlug: string; fixtureId: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const snippet = `<iframe src="${typeof window === "undefined" ? "" : window.location.origin}/embed/live/${orgSlug}/${fixtureId}" width="420" height="128" style="border:0;border-radius:12px;overflow:hidden" title="Live score" loading="lazy"></iframe>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={copy}
        className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-bold text-text-2 transition hover:border-brand-400/40 hover:text-white"
      >
        {copied ? "Copied" : failed ? "Copy failed - select below" : "Embed code"}
      </button>
      {failed ? (
        <textarea
          readOnly
          value={snippet}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 h-20 w-full rounded-lg border border-line bg-ink-900 p-2 font-mono text-[10px] text-text-2"
        />
      ) : null}
      <ObsUrlButton organizationSlug={orgSlug} fixtureId={fixtureId} />
      <p className="mt-1 text-[10px] text-text-3">
        Public iframe · no key needed · shows the score and clock for {fixtureId.slice(0, 8)}…
      </p>
    </div>
  );
}

/**
 * Copy the OBS Browser Source URL (streak v16, Prompt 4).
 *
 * Kept next to the embed button because they are the same question from two audiences: a partner wants an iframe on
 * their page, a streamer wants a transparent source in OBS. The URL is generated from the current origin so staging
 * links never leak into a production stream.
 */
export function ObsUrlButton({ organizationSlug, fixtureId }: { organizationSlug: string; fixtureId: string }) {
  const [copied, setCopied] = useState(false);
  // Multi-tenant overlay URL (streak v17, Prompt 4): /broadcast/overlay/<organizationSlug>/<fixtureId>.
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/broadcast/overlay/${organizationSlug}/${fixtureId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy the OBS Browser Source URL", url);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="mt-2 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-bold text-text-2 transition hover:border-brand-400/40 hover:text-white"
    >
      {copied ? "OBS URL copied" : "Copy OBS URL"}
    </button>
  );
}