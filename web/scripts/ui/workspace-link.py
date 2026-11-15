"""Give signed-in operators a visible way into the workspace from the public site.

The public shell's only route into the admin side was a button labelled "Organize an Event" (which goes to /admin), and the workspace
sidebar itself only exists on /dashboard, /vision and the like. An admin sitting on the homepage therefore had no obvious way back to
the side panel - which is exactly what "I can't find the admin side panel" means.

Staff roles get a "Workspace" link, first in the signed-in group so it is where the eye lands.
"""
import pathlib

path = pathlib.Path("web/src/app/components/portal-shell.tsx")
source = path.read_text(encoding="utf-8")

if "Workspace" in source:
    print("workspace link already present")
    raise SystemExit(0)

# Roles that have a workspace shell to go back to.
source = source.replace(
    'const discoverLinks = [',
    '// Staff roles see a link into the organizer workspace; fans and guests do not, because /dashboard is not theirs.\n'
    'const STAFF_ROLES = ["SUPER_ADMIN", "LEAGUE_OPERATOR", "TOURNAMENT_DIRECTOR", "TEAM_MANAGER", "COACH", "SCORER", "STATISTICIAN"];\n\n'
    'const discoverLinks = [',
)

source = source.replace(
    """            {session?.user ? (
              <>
                <Link href="/account" className="shrink-0 text-brand-400 transition hover:text-brand-300">
                  My Account
                </Link>""",
    """            {session?.user ? (
              <>
                {(session.user.roles ?? []).some((role) => STAFF_ROLES.includes(role)) ? (
                  <Link
                    href="/dashboard"
                    className="shrink-0 rounded-md border border-brand-400/40 px-3 py-1.5 text-xs font-semibold text-brand-300 transition hover:bg-brand-400/10"
                  >
                    ← Workspace
                  </Link>
                ) : null}
                <Link href="/account" className="shrink-0 text-brand-400 transition hover:text-brand-300">
                  My Account
                </Link>""",
)

path.write_text(source, encoding="utf-8", newline="\n")
print("public shell: staff get a Workspace link")
