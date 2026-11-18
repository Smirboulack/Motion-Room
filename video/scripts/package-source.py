"""Package the editable film, rendered captures, local fonts and original music."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / "out" / "motion-room-remotion-source.zip"
excluded = {"node_modules", "out", "build", ".remotion", "__pycache__"}
files = sorted(path for path in root.rglob("*") if path.is_file()
               and not any(part in excluded for part in path.relative_to(root).parts)
               and path.suffix.lower() not in {".webm", ".wav", ".pyc", ".glb", ".fbx", ".log"})
with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for path in files:
        archive.write(path, path.relative_to(root).as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert {"package.json", "package-lock.json", "src/trailer.jsx", "public/footage/manifest.json", "public/footage/reframe.json", "public/ASSET_CREDITS.md", "public/audio/score-youtube.m4a", "public/audio/score-social.m4a"} <= names
print(f"Packaged {len(files)} files: {output} ({output.stat().st_size:,} bytes)")
