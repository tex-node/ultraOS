import Link from "next/link";
import { signOut } from "@/auth";
import { PersonaSwitcher } from "@/app/components/persona-switcher";
import { WorkspaceNav } from "@/app/components/ui/workspace-nav";
import { WorkspaceDrawer } from "@/app/components/ui/workspace-drawer";
import { WorkspaceBottomNav } from "@/app/components/ui/workspace-bottom-nav";
import { resolveViewport } from "@/lib/workspace/session";
import { sectionsForPersona, type NavSection } from "@/lib/workspace/nav";

export type WorkspaceUser = {
  name?: string | null;
  role: string;
  roles?: string[];
  /** The league this session belongs to (streak v23). Optional so tests and legacy call sites keep compiling. */
  organizationName?: string | null;
  organizationSlug?: string | null;
};

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
export async function WorkspaceShell({
  children,
  user,
  organizationName,
  organizationContext,
}: {
  children: React.ReactNode;
  user: WorkspaceUser;
  // Which league this workspace belongs to. The sidebar used to print "Neon Ultra" and "Season Zero · 2026" for EVERY
  // tenant - a multi-tenancy branding leak the multi-tenant auth spec caught (streak v22). Pages that know their
  // organization pass it; everything else keeps the platform default until it is swept.
  organizationName?: string;
  organizationContext?: string | null;
}) {
  // Streak v23 sweep: the session now carries the user's own league name, so the default is THEIR league rather than the
  // platform's demo competition. The prop still wins when a page knows better (e.g. a dashboard for a different slug).
  const workspaceName = organizationName ?? user.organizationName ?? "Neon Ultra";
  const workspaceContext = organizationContext ?? (user.organizationSlug ? null : "Season Zero · 2026");
  // v36: the sidebar is the ACTIVE viewport's tools, resolved on the server from the session's roles and the switcher cookie.
  // A coach no longer sees Vendors/Audit; an operator no longer sees the courtside-only links they would never use.
  const viewport = await resolveViewport();
  const visibleSections: NavSection[] = sectionsForPersona(viewport.active).map((section) => ({
    label: section.label,
    links: section.links.map((link) => ({ href: link.href, label: link.label })),
    personas: section.personas,
  }));

  return (
    <div className="min-h-screen bg-ink-900 text-text-1 lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="border-b border-line bg-ink-800/95 lg:flex lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link className="font-display font-semibold tracking-tight" href="/admin">
              {workspaceName}
            </Link>
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400">Organizer workspace</p>
            {/* Season/competition context chip (handoff shells §Workspace). */}
            <p className="mt-1 inline-block rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-2">
              {workspaceContext}
            </p>
            <div className="mt-2">
              <PersonaSwitcher active={viewport.active} available={viewport.available} />
            </div>
          </div>
          <form
            className="m-0 shrink-0"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              className="cursor-pointer rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
        <div className="min-w-0 flex-1">
          {/* Below lg the nav is a drawer (motion-prompt #050); on desktop it stays in the sidebar. */}
          <div className="px-5 pb-3 lg:hidden">
            <WorkspaceDrawer sections={visibleSections} workspaceName={workspaceName} />
          </div>
          <div className="hidden lg:block">
            <WorkspaceNav sections={visibleSections} />
          </div>
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
        {/* The footer names the league too (streak v23 sweep): a tenant-facing page should not end with the platform's demo
            competition, which is what every workspace used to do. */}
        <footer className="mx-auto mt-10 max-w-6xl px-4 pb-6 text-[11px] text-text-3 sm:px-6">
          {workspaceName} · running on UltraLeagueOS
        </footer>
        <WorkspaceBottomNav />
      </div>
    </div>
  );
}
