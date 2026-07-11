"""Serve local GeoTIFF/COG files as XYZ raster tiles.

register() opens the dataset, computes WGS-84 bounds, percentile stretch
statistics and a max zoom estimate; render_tile() warps a 256×256 window to
EPSG:3857 and encodes PNG (nodata → transparent). The registry is in-memory,
idempotent by absolute path (same scheme as tile_sources).
"""

import hashlib
import math
import threading
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

TILE_SIZE = 256
WEB_MERCATOR_EXTENT = 20037508.342789244

_registry: dict[str, 'GeoTiffSource'] = {}
# rasterio datasets are not thread-safe; tile rendering is serialized
_render_lock = threading.Lock()


@dataclass
class GeoTiffSource:
    source_id: str
    path: str
    name: str
    bounds: list  # [west, south, east, north] EPSG:4326
    band_count: int
    minzoom: int
    maxzoom: int
    has_overviews: bool
    stretch: list  # per displayed band: (low, high)
    dataset: object = field(default=None, repr=False)
    vrt: object = field(default=None, repr=False)

    def to_dict(self) -> dict:
        return {
            'id': self.source_id,
            'name': self.name,
            'bounds': self.bounds,
            'minzoom': self.minzoom,
            'maxzoom': self.maxzoom,
            'band_count': self.band_count,
            'has_overviews': self.has_overviews,
        }


def _estimate_maxzoom(dataset, bounds4326: list) -> int:
    """Zoom whose ground resolution matches the raster's native resolution."""
    west, south, east, north = bounds4326
    if east <= west:
        return 18
    deg_per_px = (east - west) / dataset.width
    meters_per_px = deg_per_px * 111320 * max(0.2, math.cos(math.radians((south + north) / 2)))
    if meters_per_px <= 0:
        return 18
    zoom = math.ceil(math.log2(156543.03 / meters_per_px))
    return max(2, min(22, zoom))


def _compute_stretch(dataset, band_indexes: list[int]) -> list:
    """2–98 percentile per band from a decimated read (≤512²)."""
    out_h = min(512, dataset.height)
    out_w = min(512, dataset.width)
    stretch = []
    for b in band_indexes:
        data = dataset.read(b, out_shape=(out_h, out_w), masked=True)
        values = data.compressed() if np.ma.isMaskedArray(data) else np.asarray(data).ravel()
        if values.size == 0:
            stretch.append((0.0, 255.0))
            continue
        low, high = np.percentile(values, (2, 98))
        if high <= low:
            high = low + 1
        stretch.append((float(low), float(high)))
    return stretch


def register(path: str) -> dict:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    from rasterio.warp import transform_bounds

    abspath = str(Path(path).resolve())
    source_id = hashlib.sha1(abspath.encode('utf-8')).hexdigest()[:12]
    existing = _registry.get(source_id)
    if existing is not None:
        return existing.to_dict()

    if not Path(abspath).is_file():
        raise ValueError(f'文件不存在：{path}')

    dataset = rasterio.open(abspath)
    if dataset.crs is None:
        dataset.close()
        raise ValueError('GeoTIFF 缺少坐标系信息（CRS），无法配准显示')

    bounds4326 = list(transform_bounds(dataset.crs, 'EPSG:4326', *dataset.bounds))
    band_indexes = [1, 2, 3] if dataset.count >= 3 else [1]
    stretch = _compute_stretch(dataset, band_indexes)
    has_overviews = any(dataset.overviews(b) for b in band_indexes)

    vrt = WarpedVRT(dataset, crs='EPSG:3857', resampling=Resampling.bilinear)

    src = GeoTiffSource(
        source_id=source_id,
        path=abspath,
        name=Path(abspath).stem,
        bounds=bounds4326,
        band_count=dataset.count,
        minzoom=0,
        maxzoom=_estimate_maxzoom(dataset, bounds4326),
        has_overviews=has_overviews,
        stretch=stretch,
        dataset=dataset,
        vrt=vrt,
    )
    _registry[source_id] = src
    return src.to_dict()


def get(source_id: str) -> GeoTiffSource | None:
    return _registry.get(source_id)


def _tile_bounds_3857(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 2 ** z
    size = 2 * WEB_MERCATOR_EXTENT / n
    west = -WEB_MERCATOR_EXTENT + x * size
    north = WEB_MERCATOR_EXTENT - y * size
    return west, north - size, west + size, north  # w, s, e, n


def render_tile(src: GeoTiffSource, z: int, x: int, y: int) -> bytes | None:
    from rasterio.io import MemoryFile
    from rasterio.windows import from_bounds as window_from_bounds

    w, s, e, n = _tile_bounds_3857(z, x, y)
    vrt = src.vrt

    band_indexes = [1, 2, 3] if src.band_count >= 3 else [1]

    with _render_lock:
        vw, vs, ve, vn = vrt.bounds  # type: ignore[attr-defined]
        if e <= vw or w >= ve or n <= vs or s >= vn:
            return None

        # WarpedVRT forbids boundless reads — read the intersection window
        # and paste it into the right spot of the 256×256 canvas
        iw, is_, ie, in_ = max(w, vw), max(s, vs), min(e, ve), min(n, vn)
        x0 = int(round((iw - w) / (e - w) * TILE_SIZE))
        x1 = int(round((ie - w) / (e - w) * TILE_SIZE))
        y0 = int(round((n - in_) / (n - s) * TILE_SIZE))
        y1 = int(round((n - is_) / (n - s) * TILE_SIZE))
        out_w, out_h = x1 - x0, y1 - y0
        if out_w <= 0 or out_h <= 0:
            return None

        window = window_from_bounds(iw, is_, ie, in_, transform=vrt.transform)  # type: ignore[attr-defined]
        data = vrt.read(  # type: ignore[attr-defined]
            indexes=band_indexes,
            window=window,
            out_shape=(len(band_indexes), out_h, out_w),
            masked=True,
        )

    if np.ma.isMaskedArray(data):
        sub_mask = np.ma.getmaskarray(data).any(axis=0)
        sub_arr = data.filled(0).astype('float64')
    else:
        sub_mask = np.zeros((out_h, out_w), dtype=bool)
        sub_arr = np.asarray(data, dtype='float64')

    arr = np.zeros((len(band_indexes), TILE_SIZE, TILE_SIZE), dtype='float64')
    mask = np.ones((TILE_SIZE, TILE_SIZE), dtype=bool)
    arr[:, y0:y1, x0:x1] = sub_arr
    mask[y0:y1, x0:x1] = sub_mask

    # Stretch each band to 0–255
    out = np.empty((len(band_indexes), TILE_SIZE, TILE_SIZE), dtype=np.uint8)
    for i in range(len(band_indexes)):
        low, high = src.stretch[i] if i < len(src.stretch) else (0.0, 255.0)
        out[i] = np.clip((arr[i] - low) / (high - low) * 255, 0, 255).astype(np.uint8)
    if len(band_indexes) == 1:
        out = np.repeat(out, 3, axis=0)

    alpha = np.where(mask, 0, 255).astype(np.uint8)[np.newaxis, :, :]
    rgba = np.concatenate([out, alpha], axis=0)

    with MemoryFile() as mem:
        with mem.open(
            driver='PNG', width=TILE_SIZE, height=TILE_SIZE, count=4, dtype='uint8',
        ) as dst:
            dst.write(rgba)
        return mem.read()
