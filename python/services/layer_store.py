"""Content-addressed layer store.

Big GeoJSON feature collections produced by the Python backend (file import,
WFS/OGC fetch, OSM extract, analysis, SQL) are written here keyed by a hash
of their serialized bytes. Consumers:

- SQL layer registration reads the file directly (no renderer -> backend
  re-upload of the payload, no temp files).
- Project save copies the file into the sidecar directory server-side
  (POST /project/copy) — the renderer ships zero bytes.

Entries are pure cache: any file may be deleted at any time, callers fall
back to the upload path. GC keeps total size under control by mtime.
"""

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path

STORE_DIR = Path.home() / '.yutugis' / 'layers'

# Mirror the renderer's INLINE_FEATURE_MAX — smaller layers are inlined in
# project files and cheap to register; not worth a store entry.
MIN_FEATURES = 2000

# GC thresholds: when the store exceeds MAX_BYTES, delete oldest files
# (mtime) until it is back under LOW_BYTES.
MAX_BYTES = 2 * 1024**3
LOW_BYTES = 1 * 1024**3


def _hash_path(digest: str) -> Path:
    return STORE_DIR / f'{digest}.geojson'

def put(fc: dict, force: bool = False) -> str | None:
    """Serialize a FeatureCollection into the store, return its content hash.

    Returns None for small collections (<= MIN_FEATURES) unless force=True
    (SQL registration stores every payload to unify the ST_Read path).
    Same content → same hash → idempotent overwrite.
    """
    if not force and len(fc.get('features') or []) <= MIN_FEATURES:
        return None
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    fd, tmp = tempfile.mkstemp(dir=STORE_DIR, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            # iterencode streams — no giant string in memory
            for chunk in json.JSONEncoder(ensure_ascii=False).iterencode(fc):
                digest.update(chunk.encode('utf-8'))
                f.write(chunk)
        result = digest.hexdigest()[:16]
        os.replace(tmp, _hash_path(result))
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise
    return result


def path_of(content_hash: str) -> Path | None:
    p = _hash_path(content_hash)
    return p if p.is_file() else None


def copy_out(content_hash: str, dest: str) -> None:
    """Atomically copy a store entry to dest (project sidecar)."""
    src = path_of(content_hash)
    if src is None:
        raise ValueError(f'图层库中没有该内容：{content_hash}')
    target = Path(dest)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix='.tmp')
    os.close(fd)
    Path(tmp).unlink()
    try:
        shutil.copyfile(src, tmp)
        os.replace(tmp, target)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise


def gc() -> int:
    """Delete oldest files until the store is under LOW_BYTES.

    Returns the number of removed files. Called once at import time.
    """
    if not STORE_DIR.is_dir():
        return 0
    entries = []
    total = 0
    for p in STORE_DIR.iterdir():
        if not p.is_file():
            continue
        st = p.stat()
        entries.append((st.st_mtime, st.st_size, p))
        total += st.st_size
    if total <= MAX_BYTES:
        return 0
    entries.sort()
    removed = 0
    for _, size, p in entries:
        if total <= LOW_BYTES:
            break
        p.unlink(missing_ok=True)
        total -= size
        removed += 1
    return removed


gc()
