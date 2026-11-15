"""Make the vision pages reachable from the app's own navigation (Prompt 5c-vii follow-up).

`/vision`, `/vision/upload` and `/vision/videos` all existed and returned 200 for a SUPER_ADMIN session — verified against production
with a minted session — but there was no link to any of them in the workspace sidebar. "It does not exist" is what a user says when
the only way in is typing a URL they were told.

Also switches `/vision/upload` from `notFound()` to `requirePermissionOrRedirect`, matching every other vision page: a 404 tells a
signed-in non-admin that the page is missing, when the truth is that they lack the permission.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
nav = ROOT / "web/src/lib/workspace/nav.ts"
source = nav.read_text(encoding="utf-8")

if "/vision/upload" in source:
    print("vision nav entries already present")
    raise SystemExit(0)

anchor = """  {
    label: "Coach hub","""
insert = """  {
    // AI Vision (G.21). Admin-only: the review pages confirm observations, which is a league-operator responsibility.
    label: "AI Vision",
    personas: ["admin"],
    links: [
      { href: "/vision", label: "Vision dashboard" },
      { href: "/vision/upload", label: "Process video locally" },
      { href: "/vision/videos", label: "Video & court setup" },
    ],
  },
  {
    label: "Coach hub","""

if anchor not in source:
    raise SystemExit("nav anchor not found")
source = source.replace(anchor, insert, 1)
nav.write_text(source, encoding="utf-8", newline="\n")

page = ROOT / "web/src/app/(workspace)/vision/upload/page.tsx"
text = page.read_text(encoding="utf-8")
text = text.replace(
    "import { MissingOrganizationContextError } from \"@/lib/authorization\";",
    "import { MissingOrganizationContextError, requirePermissionOrRedirect } from \"@/lib/authorization\";",
)
text = text.replace(
    """  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/vision/upload");
  if (!hasPermission(session.user.roles, "vision:manage")) notFound();""",
    """  // Redirect rather than 404: a signed-in user without vision:manage should be told they lack access, not that the page is missing.
  const session = await requirePermissionOrRedirect("vision:manage", "/vision/upload");""",
)
page.write_text(text, encoding="utf-8", newline="\n")
print("nav section added; upload page redirects instead of 404ing")
