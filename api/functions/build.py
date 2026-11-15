"""Assemble the deployable Azure Functions app into api/functions/dist/.

Static Web Apps deploys exactly one folder as the API. That folder must contain
function_app.py, host.json and requirements.txt at its root, so this script copies
in only what the API needs at runtime: the three backend modules and the four
processed data files. Archived code, raw rasters, offline processing scripts,
unused images and tests stay out of the package.

    python api/functions/build.py            # -> api/functions/dist/
    python api/functions/build.py OUT_DIR    # custom output folder
"""
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BLINDSPOTS = HERE.parent / "mars-blindspots"

FILES = {
    # Functions app skeleton
    HERE / "function_app.py": "function_app.py",
    HERE / "host.json": "host.json",
    HERE / "requirements.txt": "requirements.txt",
    # Runtime code (Allison's routing + the API service)
    BLINDSPOTS / "backend" / "__init__.py": "backend/__init__.py",
    BLINDSPOTS / "backend" / "api_service.py": "backend/api_service.py",
    BLINDSPOTS / "backend" / "routing.py": "backend/routing.py",
    # Processed Deuteronilus data actually read by api_service.Site
    BLINDSPOTS / "data" / "deuteronilus" / "metadata.json": "data/deuteronilus/metadata.json",
    BLINDSPOTS / "data" / "deuteronilus" / "data_grid.json": "data/deuteronilus/data_grid.json",
    BLINDSPOTS / "data" / "deuteronilus" / "zones.json": "data/deuteronilus/zones.json",
    BLINDSPOTS / "data" / "deuteronilus" / "hillshade.png": "data/deuteronilus/hillshade.png",
}


def build(out: Path) -> Path:
    out = out.resolve()
    if out.exists():
        shutil.rmtree(out)
    for src, rel in FILES.items():
        if not src.is_file():
            raise FileNotFoundError(f"missing build input: {src}")
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
    return out


if __name__ == "__main__":
    target = build(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "dist")
    size = sum(p.stat().st_size for p in target.rglob("*") if p.is_file())
    print(f"Built {target} ({len(FILES)} files, {size / 1e6:.1f} MB)")
