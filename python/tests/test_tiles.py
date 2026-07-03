# python/tests/test_tiles.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.tiles import deg2num, tile_range, count_tiles, iter_tiles, detect_format


def test_deg2num_origin_zoom0():
    assert deg2num(0.0, 0.0, 0) == (0, 0)


def test_deg2num_known_beijing_z10():
    # 北京 (39.9093, 116.3974) 在 z10 对应 OSM 瓦片 10/843/388
    assert deg2num(39.9093, 116.3974, 10) == (843, 388)


def test_deg2num_clamps_polar_latitude():
    # 超出 Web Mercator 纬度极限时收敛到边界瓦片，不越界
    x, y = deg2num(89.9, 0.0, 2)
    assert y == 0
    x, y = deg2num(-89.9, 0.0, 2)
    assert y == 3


def test_tile_range_orders_min_max():
    x_min, y_min, x_max, y_max = tile_range(39.8, 116.2, 40.0, 116.6, 10)
    assert x_min <= x_max and y_min <= y_max


def test_count_tiles_matches_iter():
    args = (39.8, 116.2, 40.0, 116.6, 8, 10)
    assert count_tiles(*args) == len(list(iter_tiles(*args)))
    assert count_tiles(*args) > 0


def test_detect_format():
    assert detect_format(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8) == "png"
    assert detect_format(b"\xff\xd8\xff\xe0" + b"\x00" * 8) == "jpg"
    assert detect_format(b"RIFF\x00\x00\x00\x00WEBP") == "webp"
    assert detect_format(b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00") == "png"
