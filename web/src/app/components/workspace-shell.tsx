import Link from "next/link";
import { signOut } from "@/auth";
import { WorkspaceNav } from "@/app/components/ui/workspace-nav";
import { WorkspaceBottomNav } from "@/app/components/ui/workspace-bottom-nav";

export type WorkspaceUser = {
  name?: string | null;
  role: string;
  roles?: string[];
};

type NavLink = { href: string; label: string; adminOnly?: boolean; roles?: string[] };
type NavSection = { label: string; links: NavLink[] };

// Organizer workspace navigation (product roadmap F1/F6). Sections mirror the workspace
// dashboard; every href is an existing route — this shell only reorganizes, never adds.
// adminOnly links additionally open to the listed extra roles (least privilege per F6);
// everyone else keeps exactly the visibility they had before.
const sections: NavSection[] = [
  {
    label: "Manage",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/competitions", label: "Tournaments", adminOnly: true, roles: ["TOURNAMENT_DIRECTOR"] },
      { href: "/events", label: "Events", adminOnly: true, roles: ["TOURNAMENT_DIRECTOR"] },
      { href: "/launch-readiness", label: "Launch", adminOnly: true },
    ],
  },
  {
    label: "Tournament",
    links: [
      { href: "/clubs", label: "Clubs" },
      { href: "/players", label: "Athletes" },
      { href: "/coaches", label: "Coaches" },
      { href: "/coaches/season-zero-selection", label: "Coach Selection", adminOnly: true },
      { href: "/fixtures", label: "Fixtures" },
      { href: "/standings", label: "Standings" },
      { href: "/leaders", label: "Leaders" },
      { href: "/drafts", label: "Drafts" },
      { href: "/draft-events", label: "Draft Day" },
      { href: "/applications", label: "Applications", adminOnly: true },
    ],
  },
  {
    label: "Live",
    links: [
      { href: "/gameday", label: "Game Day" },
      { href: "/broadcast", label: "Broadcast" },
      { href: "/novelty-matches", label: "Exhibition" },
    ],
  },
  {
    label: "Commerce",
    links: [
      { href: "/vendors", label: "Vendors", adminOnly: true, roles: ["VENDOR_MANAGER"] },
      { href: "/orders", label: "Orders", adminOnly: true, roles: ["VENDOR_MANAGER"] },
      { href: "/check-in", label: "Gate Scanner" },
      { href: "/qr-operations", label: "QR Ops", adminOnly: true },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/operations", label: "Operations", adminOnly: true },
      { href: "/access", label: "Access", adminOnly: true },
      { href: "/content", label: "Content", adminOnly: true, roles: ["TOURNAMENT_DIRECTOR"] },
      { href: "/media", label: "Media", adminOnly: true },
      { href: "/imports", label: "Imports", adminOnly: true },
      { href: "/audit", label: "Audit", adminOnly: true },
      { href: "/data-readiness", label: "Data", adminOnly: true },
      { href: "/participants/search", label: "Search", adminOnly: true },
      { href: "/training", label: "Training", adminOnly: true },
      { href: "/announcements", label: "Announcements", adminOnly: true, roles: ["TOURNAMENT_DIRECTOR"] },
    ],
  },
];

function isAdmin(user: WorkspaceUser) {
  return (
    user.roles?.includes("SUPER_ADMIN") ||
    user.roles?.includes("LEAGUE_OPERATOR") ||
    user.role === "SUPER_ADMIN" ||
    user.role === "LEAGUE_OPERATOR"
  );
}

// Organizer workspace shell: sidebar navigation on desktop, compact top bar below lg.
// Same props contract as the legacy operations header so pages adopt it unchanged.
export function WorkspaceShell({ children, user }: { children: React.ReactNode; user: WorkspaceUser }) {
  const admin = Boolean(isAdmin(user));
  const roles = user.roles?.length ? user.roles : [user.role];
  const visible = (link: NavLink) => !link.adminOnly || admin || (link.roles ?? []).some((role) => roles.includes(role));
  const visibleSections = sections
    .map((section) => ({ label: section.label, links: section.links.filter(visible) }))
    .filter((section) => section.links.length > 0);

  return (
    <div className="min-h-screen bg-ink-900 text-text-1 lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="border-b border-line bg-ink-800/95 lg:flex lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link className="font-display font-semibold tracking-tight" href="/admin">
              Neon Ultra
            </Link>
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400">Organizer workspace</p>
            {/* Season/competition context chip (handoff shells §Workspace). */}
            <p className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-2">
              Season Zero · 2026
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
        <div className="min-w-0 flex-1">
          <WorkspaceNav sections={visibleSections} />
        </div>
        <div className="mt-auto hidden px-5 py-4 lg:block">
          <Link href="/profile" className="block transition hover:opacity-80">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-text-3">
              {(user.roles?.length ? user.roles : [user.role]).join(" · ")}
            </p>
          </Link>
          <Link href="/public" className="mt-2 block text-xs text-brand-400">
            ← Back to fan portal
          </Link>
        </div>
      </aside>
      <div className="min-w-0 pb-16 lg:pb-0">
        {children}
        <WorkspaceBottomNav />
      </div>
    </div>
  );
}
