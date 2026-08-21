import type { SocialCopy } from "@/lib/analytics/cards/types";

// Deterministic structured caption text, shown for copy-paste — never auto-posted.
export function SocialCopyBlock({ copy }: { copy: SocialCopy }) {
  return (
    <div className="w-full max-w-md rounded-xl border border-white/[.08] bg-[#0b100e] p-3 text-xs text-zinc-400">
      <p className="text-[9px] uppercase tracking-wide text-zinc-600">Suggested Caption</p>
      <p className="mt-1"><span className="font-bold text-zinc-200">{copy.headline}</span> — {copy.subject} · {copy.stat}</p>
    </div>
  );
}
