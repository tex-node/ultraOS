"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

// Fan portal mobile bottom nav (handoff shells §Fan portal): 5 items, 64px, active green.
// Desktop/tablet use the header nav; this renders below md only.
const ITEMS = [
  { href: "/", label: "Home" },
  { href: "/public/events", label: "Events" },
  { href: "/live", label: "Live" },
  { href: "/public/standings", label: "Tables" },
  { href: "/account", label: "Account" },
];

export function PortalBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-ink-900/95 backdrop-blur md:hidden"
      aria-label="Main"
    >
      {ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : item.href === "/public/events" ? pathname.startsWith("/public/events") : pathname.startsWith(item.href);
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