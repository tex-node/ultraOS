# PyInstaller spec for the desktop vision sidecar (5c-ii-c).
#
# One file, no database, no Celery, no boto3: the bundle is a compute node. The weights go in as data so the exe can run from an empty
# directory - `app/analyzer` looks for `yolov8n.pt` next to itself (or VISION_WEIGHTS_PATH), and PyInstaller's onefile runtime
# extracts the bundled copy to a temp directory at start.
#
# Build:  python -m PyInstaller sidecar.spec --noconfirm
# Verify: sha256sum of weights must match weights.sha256 BEFORE building (build-sidecar.ps1 does it).

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

hiddenimports = [
    "torch",
    "torchvision",
    "ultralytics",
    "cv2",
    "lap",
    "pydantic_settings",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]
hiddenimports += collect_submodules("ultralytics")

datas = [
    ("weights/yolov8n.pt", "."),
]
# Ultralytics ships YAML model configs and font assets that are read at import time.
datas += collect_data_files("ultralytics")

# scipy ships compiled extensions PyInstaller does not pick up on its own. Inside a one-file bundle the failure surfaces at the first
# inference call as "The scipy install you are using seems to be broken", which is a packaging bug wearing a dependency's clothes.
_scipy_datas, scipy_binaries, _scipy_hidden = collect_all("scipy")
datas += _scipy_datas
hiddenimports += _scipy_hidden

a = Analysis(
    ["app/sidecar_main.py"],
    pathex=["."],
    binaries=scipy_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "app.workers",
        "app.main",
        "app.api",
        "celery",
        "redis",
        "boto3",
        "botocore",
        "psycopg",
        "pytest",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="ultraos-vision-engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
