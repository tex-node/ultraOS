import Link from "next/link";
import { PortalBottomNav } from "@/app/components/ui/portal-bottom-nav";

// Fan portal shell (product roadmap F1, restyled D1). Guest-safe by construction: every
// link here is a public route, and this shell never imports anything from the organizer
// workspace.
const discoverLinks = [
  { href: "/public/events", label: "Events" },
  { href: "/public/clubs", label: "Clubs" },
  { href: "/public/fixtures", label: "Fixtures" },
  { href: "/public/players", label: "Players" },
  { href: "/public/standings", label: "Standings" },
  { href: "/public/stats", label: "Stats" },
  { href: "/public/tickets", label: "Tickets" },
  { href: "/public/orders", label: "My Orders" },
  { href: "/public/celebrations", label: "Celebrations" },
  { href: "/live", label: "Live Center" },
];

const accountLinks = [
  { href: "/apply", label: "Apply" },
  { href: "/account", label: "My Account" },
  { href: "/signup", label: "Sign up" },
  { href: "/login", label: "Login" },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-900 text-text-1">
      <header className="border-b border-line">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="font-display font-bold tracking-tight">
              NEON ULTRA
            </Link>
            <Link
              href="/admin"
              className="rounded-md border border-brand-400/40 px-3 py-2 text-xs font-semibold text-brand-300 transition hover:bg-brand-400/10"
            >
              Organize an Event
            </Link>
          </div>
          <nav className="mt-3 flex gap-4 overflow-x-auto whitespace-nowrap pb-1 text-sm text-text-2 [scrollbar-width:thin]">
            {discoverLinks.map((link) => (
              <Link key={link.href} className="shrink-0 transition hover:text-white" href={link.href}>
                {link.label}
              </Link>
            ))}
            {accountLinks.map((link) => (
              <Link key={link.href} className="shrink-0 text-brand-400 transition hover:text-brand-300" href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="pb-16 md:pb-0">{children}</div>
      <PortalBottomNav />
    </div>
  );
}
