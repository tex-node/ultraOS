"use client";

import { useRouter } from "next/navigation";

// Exit control for the capture viewport.
//
// Why a confirm and not a link: this screen has no navigation at all, on purpose, so the exit is the only way out and the only
// way to lose a session's flow. A misplaced thumb should not end a quarter. The confirmation is the browser's own, which keeps
// the capture shell free of animation at the exact moment a scorer is least able to wait for it.
export function ExitConsole({ href = "/admin" }: { href?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm("Leave the console? Anything already recorded is saved.")) {
          router.push(href);
        }
      }}
      className="fixed right-3 top-3 z-50 rounded-md border border-white/25 bg-black/70 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur transition hover:border-white/50 hover:text-white"
      aria-label="Exit the capture console"
    >
      Exit console
    </button>
  );
}
