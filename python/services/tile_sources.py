"""
Serve tiles from local MBTiles files or z/x/y tile directories.

register() validates a path and returns a TileSource with metadata;
read_tile() returns raw image bytes for one tile. The registry is
in-memory — layers are runtime state, re-registered on each import.
"""
import hashlib
import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

MEDIA_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}


@dataclass
class TileSource:
    source_id: str
    path: str
    kind: str  # "mbtiles" | "directory"
    name: str
    format: str  # png | jpg | webp
    bounds: list | None  # [west, south, east, north]
    minzoom: int
    maxzoom: int
    conn: sqlite3.Connection | None = field(default=None, repr=False)

    def to_dict(self) -> dict:
        return {
            "source_id": self.source_id,
            "name": self.name,
            "format": self.format,
            "bounds": self.bounds,
            "minzoom": self.minzoom,
            "maxzoom": self.maxzoom,
        }


_sources: dict[str, TileSource] = {}


def get(source_id: str) -> TileSource | None:
    return _sources.get(source_id)


def _parse_bounds(raw: str | None) -> list | None:
    if not raw:
        return None
    try:
        parts = [float(p) for p in raw.split(",")]
        return parts if len(parts) == 4 else None
    except ValueError:
        return None


def _register_mbtiles(path: Path, source_id: str) -> TileSource:
    conn = sqlite3.connect(str(path), check_same_thread=False)
    try:
        meta = dict(conn.execute("SELECT name, value FROM metadata").fetchall())
    except sqlite3.DatabaseError:
        meta = {}
    try:
        zrange = conn.execute("SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles").fetchone()
    except sqlite3.DatabaseError:
        conn.close()
        raise ValueError("不是有效的 MBTiles 文件（缺少 tiles 表）")
    if zrange[0] is None:
        conn.close()
        raise ValueError("MBTiles 文件中没有任何瓦片")

    return TileSource(
        source_id=source_id,
        path=str(path),
        kind="mbtiles",
        name=meta.get("name") or path.stem,
        format=meta.get("format", "png"),
        bounds=_parse_bounds(meta.get("bounds")),
        minzoom=int(meta.get("minzoom", zrange[0])),
        maxzoom=int(meta.get("maxzoom", zrange[1])),
        conn=conn,
    )


def _register_directory(path: Path, source_id: str) -> TileSource:
    meta: dict = {}
    meta_file = path / "metadata.json"
    if meta_file.is_file():
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            meta = {}

    zoom_dirs = sorted(int(p.name) for p in path.iterdir() if p.is_dir() and p.name.isdigit())
    if not zoom_dirs:
        raise ValueError("目录中没有 {z}/{x}/{y} 结构的瓦片")

    fmt = meta.get("format")
    if not fmt:
        # Sniff the extension of any one tile file
        for f in path.glob(f"{zoom_dirs[0]}/*/*.*"):
            fmt = f.suffix.lstrip(".")
            break
    if fmt not in MEDIA_TYPES:
        fmt = "png"

    return TileSource(
        source_id=source_id,
        path=str(path),
        kind="directory",
        name=meta.get("name") or path.name,
        format=fmt,
        bounds=_parse_bounds(meta.get("bounds")),
        minzoom=int(meta.get("minzoom", zoom_dirs[0])),
        maxzoom=int(meta.get("maxzoom", zoom_dirs[-1])),
    )


def register(path_str: str) -> TileSource:
    """Register an MBTiles file or tile directory; idempotent per path."""
    path = Path(path_str).expanduser().resolve()
    source_id = hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:12]
    existing = _sources.get(source_id)
    if existing is not None:
        return existing

    if path.is_file():
        src = _register_mbtiles(path, source_id)
    elif path.is_dir():
        src = _register_directory(path, source_id)
    else:
        raise ValueError(f"路径不存在：{path}")

    _sources[source_id] = src
    return src


def read_tile(src: TileSource, z: int, x: int, y: int) -> bytes | None:
    """Return raw image bytes for one XYZ tile, or None if absent."""
    if src.kind == "mbtiles":
        assert src.conn is not None
        row = (2 ** z) - y - 1
        cur = src.conn.execute(
            "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
            (z, x, row),
        )
        result = cur.fetchone()
        return bytes(result[0]) if result else None

    tile_path = Path(src.path) / str(z) / str(x) / f"{y}.{src.format}"
    try:
        return tile_path.read_bytes()
    except OSError:
        return None
