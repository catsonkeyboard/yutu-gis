"""
Map tile download support: tile math and output writers (MBTiles / directory).
"""
import json
import math
import sqlite3
from pathlib import Path

MAX_LAT = 85.05112878  # Web Mercator latitude limit


def deg2num(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    """WGS-84 lat/lon → XYZ tile (column, row) at the given zoom."""
    lat = max(min(lat, MAX_LAT), -MAX_LAT)
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_range(
    south: float, west: float, north: float, east: float, zoom: int
) -> tuple[int, int, int, int]:
    """bbox → inclusive (x_min, y_min, x_max, y_max). North edge has the smaller y."""
    x_min, y_min = deg2num(north, west, zoom)
    x_max, y_max = deg2num(south, east, zoom)
    return x_min, y_min, x_max, y_max


def count_tiles(
    south: float, west: float, north: float, east: float, min_zoom: int, max_zoom: int
) -> int:
    total = 0
    for z in range(min_zoom, max_zoom + 1):
        x_min, y_min, x_max, y_max = tile_range(south, west, north, east, z)
        total += (x_max - x_min + 1) * (y_max - y_min + 1)
    return total


def iter_tiles(
    south: float, west: float, north: float, east: float, min_zoom: int, max_zoom: int
):
    """Yield (z, x, y) for every tile of the bbox across the zoom range."""
    for z in range(min_zoom, max_zoom + 1):
        x_min, y_min, x_max, y_max = tile_range(south, west, north, east, z)
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                yield z, x, y


def detect_format(data: bytes) -> str:
    """Sniff image format from magic bytes; tile servers lie in Content-Type."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return "png"


class MBTilesWriter:
    """Write tiles into an MBTiles (SQLite) file.

    MBTiles stores rows in TMS scheme, so XYZ y is inverted on write.
    Re-opening an existing file resumes it: has_tile() sees prior tiles.
    Single event-loop thread writes only — no locking needed.
    """

    def __init__(self, path: str, name: str):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.format: str | None = None
        cur = self.conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS metadata (name text, value text)")
        cur.execute(
            "CREATE TABLE IF NOT EXISTS tiles "
            "(zoom_level integer, tile_column integer, tile_row integer, tile_data blob)"
        )
        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles "
            "(zoom_level, tile_column, tile_row)"
        )
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS metadata_name ON metadata (name)")
        self._set_meta("name", name)
        self._set_meta("type", "baselayer")
        self._set_meta("version", "1")
        self.conn.commit()

    def _set_meta(self, key: str, value) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)", (key, str(value))
        )

    def has_tile(self, z: int, x: int, y: int) -> bool:
        row = (2 ** z) - y - 1
        cur = self.conn.execute(
            "SELECT 1 FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1",
            (z, x, row),
        )
        return cur.fetchone() is not None

    def write_tile(self, z: int, x: int, y: int, data: bytes) -> None:
        if self.format is None:
            self.format = detect_format(data)
        row = (2 ** z) - y - 1
        self.conn.execute(
            "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) "
            "VALUES (?, ?, ?, ?)",
            (z, x, row, sqlite3.Binary(data)),
        )

    def close(self, bounds: tuple, min_zoom: int, max_zoom: int) -> None:
        south, west, north, east = bounds
        if self.format is None:
            # Resume run where every tile was skipped — keep the existing format
            row = self.conn.execute("SELECT value FROM metadata WHERE name='format'").fetchone()
            self.format = row[0] if row else "png"
        self._set_meta("format", self.format)
        self._set_meta("bounds", f"{west},{south},{east},{north}")
        self._set_meta("center", f"{(west + east) / 2},{(south + north) / 2},{min_zoom}")
        self._set_meta("minzoom", min_zoom)
        self._set_meta("maxzoom", max_zoom)
        self.conn.commit()
        self.conn.close()


class DirectoryWriter:
    """Write tiles as <root>/{z}/{x}/{y}.<ext> plus a metadata.json."""

    def __init__(self, root: str, name: str):
        self.root = Path(root)
        self.name = name
        self.format: str | None = None
        self.root.mkdir(parents=True, exist_ok=True)

    def _tile_path(self, z: int, x: int, y: int) -> Path:
        return self.root / str(z) / str(x) / f"{y}.{self.format or 'png'}"

    def has_tile(self, z: int, x: int, y: int) -> bool:
        # format 未知（本次尚未写入任何瓦片）时按 png 猜测路径，猜不中就重新下载，无害
        return self._tile_path(z, x, y).exists()

    def write_tile(self, z: int, x: int, y: int, data: bytes) -> None:
        if self.format is None:
            self.format = detect_format(data)
        path = self._tile_path(z, x, y)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def close(self, bounds: tuple, min_zoom: int, max_zoom: int) -> None:
        south, west, north, east = bounds
        meta = {
            "name": self.name,
            "format": self.format or "png",
            "bounds": f"{west},{south},{east},{north}",
            "minzoom": min_zoom,
            "maxzoom": max_zoom,
            "scheme": "xyz",
            "tilesize": 256,
            "profile": "mercator",
        }
        (self.root / "metadata.json").write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
        )
