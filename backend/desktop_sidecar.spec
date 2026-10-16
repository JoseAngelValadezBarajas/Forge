# PyInstaller onedir input for the authenticated Forge desktop sidecar.
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

spec_path = Path(SPECPATH).resolve()
spec_directory = spec_path.parent if spec_path.is_file() else spec_path
root = spec_directory.parent
backend = root / "backend"
migrations = backend / "migrations"
hidden_imports = []
for package in ("app", "alembic", "uvicorn.protocols", "uvicorn.lifespan", "sqlalchemy.dialects.sqlite"):
    hidden_imports.extend(
        name
        for name in collect_submodules(package)
        if not name.startswith("alembic.testing")
    )

migration_datas = [
    (
        str(source),
        str(Path("migrations") / source.relative_to(migrations).parent),
    )
    for source in migrations.rglob("*")
    if source.is_file() and "__pycache__" not in source.parts and source.suffix != ".pyc"
]

a = Analysis(
    [str(backend / "desktop_sidecar.py")],
    pathex=[str(backend)],
    binaries=[],
    datas=[
        *migration_datas,
        (str(root / "alembic.ini"), "."),
    ],
    hiddenimports=sorted(set(hidden_imports)),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tests", "IPython", "notebook"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="forge-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="forge-sidecar",
)
