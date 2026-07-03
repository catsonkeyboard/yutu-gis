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
