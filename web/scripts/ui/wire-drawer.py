"""Wire the animated drawer into the workspace shell (motion-prompt #050).

Below `lg`, the sidebar nav becomes a drawer and the shell shows a Menu button; the desktop sidebar is untouched.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHELL = ROOT / "src/app/components/workspace-shell.tsx"

IMPORT = 'import { WorkspaceDrawer } from "@/app/components/ui/workspace-drawer";'

OLD_NAV = """        <div className="min-w-0 flex-1">
          <WorkspaceNav sections={visibleSections} />
        </div>"""

NEW_NAV = """        <div className="min-w-0 flex-1">
          {/* Below lg the nav is a drawer (motion-prompt #050); on desktop it stays in the sidebar. */}
          <div className="px-5 pb-3 lg:hidden">
            <WorkspaceDrawer sections={visibleSections} workspaceName={workspaceName} />
          </div>
          <div className="hidden lg:block">
            <WorkspaceNav sections={visibleSections} />
          </div>
        </div>"""

source = SHELL.read_text(encoding="utf-8")
if "WorkspaceDrawer" in source:
    print("already wired")
else:
    source = source.replace(
        'import { WorkspaceNav } from "@/app/components/ui/workspace-nav";',
        'import { WorkspaceNav } from "@/app/components/ui/workspace-nav";\n' + IMPORT,
    )
    if OLD_NAV not in source:
        raise SystemExit("nav block not found - shell layout changed")
    source = source.replace(OLD_NAV, NEW_NAV)
    SHELL.write_text(source, encoding="utf-8", newline="\n")
    print("workspace shell: drawer wired")
