"""Static proof that the bundled package cannot reach a database.

The desktop binary must never carry a Postgres connection string. A comment saying so is not a control; this test is. It walks every
module in `app/analyzer/` with `ast` and fails on an import of the DB layer.
"""

from __future__ import annotations

import ast
import pathlib

ANALYZER_DIR = pathlib.Path(__file__).parent.parent / "app" / "analyzer"

FORBIDDEN = ("core.db", "prisma", "psycopg", "sqlalchemy", "celery", "redis")


def _imported_modules(path: pathlib.Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            modules.append(node.module)
        elif isinstance(node, ast.Import):
            modules.extend(alias.name for alias in node.names)
    return modules


def test_analyzer_package_does_not_import_db():
    files = sorted(ANALYZER_DIR.rglob("*.py"))
    assert files, f"no python files under {ANALYZER_DIR}"
    for path in files:
        for module in _imported_modules(path):
            for forbidden in FORBIDDEN:
                assert forbidden not in module, f"{path} imports {module}"


def test_analyzer_exposes_a_path_in_path_out_api():
    """The contract the sidecar and the dispatcher both rely on: construct with a path, call run(), get dicts back."""
    from app.analyzer import Analyzer

    signature = Analyzer.__init__.__annotations__
    assert "video_path" in signature
    assert hasattr(Analyzer, "run")
    assert hasattr(Analyzer, "detect")
