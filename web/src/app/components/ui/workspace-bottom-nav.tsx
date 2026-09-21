"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

// Workspace mobile bottom nav (handoff shells §Workspace): 4 items, 64px, active green.
const ITEMS = [
  { href: "/admin", label: "Home" },
  { href: "/competitions", label: "Tournaments" },
  { href: "/gameday", label: "Live" },
  { href: "/operations", label: "More" },
];

export function WorkspaceBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-ink-900/95 backdrop-blur lg:hidden"
      aria-label="Workspace"
    >
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide transition ${
              active ? "text-brand-400" : "text-text-2 hover:text-white"
            }`}
          >
            <span aria-hidden className="text-base leading-none">{active ? "●" : "○"}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}