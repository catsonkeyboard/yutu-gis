import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds

from services import geotiff_sources


@pytest.fixture()
def rgb_tif(tmp_path):
    """Small RGB GeoTIFF around Beijing (EPSG:4326)."""
    path = tmp_path / 'rgb.tif'
    width = height = 64
    transform = from_bounds(116.0, 39.5, 117.0, 40.5, width, height)
    data = np.random.randint(0, 255, (3, height, width), dtype=np.uint8)
    with rasterio.open(
        path, 'w', driver='GTiff', width=width, height=height, count=3,
        dtype='uint8', crs='EPSG:4326', transform=transform,
    ) as dst:
        dst.write(data)
    return str(path)


@pytest.fixture()
def nocrs_tif(tmp_path):
    path = tmp_path / 'nocrs.tif'
    with rasterio.open(
        path, 'w', driver='GTiff', width=8, height=8, count=1, dtype='uint8',
    ) as dst:
        dst.write(np.zeros((1, 8, 8), dtype=np.uint8))
    return str(path)


def test_register_returns_metadata(rgb_tif):
    info = geotiff_sources.register(rgb_tif)
    assert info['name'] == 'rgb'
    w, s, e, n = info['bounds']
    assert w == pytest.approx(116.0, abs=0.01)
    assert n == pytest.approx(40.5, abs=0.01)
    assert info['band_count'] == 3
    assert info['minzoom'] == 0
    # 64 px per degree ≈ 1.3 km/px → native zoom around 7
    assert 6 <= info['maxzoom'] <= 9


def test_register_is_idempotent(rgb_tif):
    a = geotiff_sources.register(rgb_tif)
    b = geotiff_sources.register(rgb_tif)
    assert a['id'] == b['id']


def test_register_rejects_missing_crs(nocrs_tif):
    with pytest.raises(ValueError):
        geotiff_sources.register(nocrs_tif)


def test_render_tile_returns_png(rgb_tif):
    info = geotiff_sources.register(rgb_tif)
    src = geotiff_sources.get(info['id'])
    # zoom 8 tile covering Beijing (lon 116.4 lat 40 → x≈210, y≈97 at z8)
    data = geotiff_sources.render_tile(src, 8, 210, 97)
    assert data is not None
    assert data[:8] == b'\x89PNG\r\n\x1a\n'


def test_render_tile_outside_bounds_is_none(rgb_tif):
    info = geotiff_sources.register(rgb_tif)
    src = geotiff_sources.get(info['id'])
    assert geotiff_sources.render_tile(src, 8, 0, 0) is None
