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
      <p className="mt-1 text-[10px] text-text-3">
        Public iframe · no key needed · shows the score and clock for {fixtureId.slice(0, 8)}…
      </p>
    </div>
  );
}
