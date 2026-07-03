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


import sqlite3
import json
from services.tiles import MBTilesWriter, DirectoryWriter

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def test_mbtiles_writer_roundtrip(tmp_path):
    path = str(tmp_path / "t.mbtiles")
    w = MBTilesWriter(path, "test")
    assert not w.has_tile(10, 843, 387)
    w.write_tile(10, 843, 387, PNG)
    assert w.has_tile(10, 843, 387)
    w.close((39.8, 116.2, 40.0, 116.6), 10, 10)

    conn = sqlite3.connect(path)
    # MBTiles 规范：tiles 表使用 TMS 行号，XYZ y=387 在 z10 → row = 1024-387-1 = 636
    row = conn.execute(
        "SELECT tile_data FROM tiles WHERE zoom_level=10 AND tile_column=843 AND tile_row=636"
    ).fetchone()
    assert row is not None and bytes(row[0]) == PNG
    meta = dict(conn.execute("SELECT name, value FROM metadata").fetchall())
    assert meta["format"] == "png"
    assert meta["bounds"] == "116.2,39.8,116.6,40.0"
    assert meta["minzoom"] == "10" and meta["maxzoom"] == "10"
    conn.close()


def test_mbtiles_writer_resume_keeps_existing(tmp_path):
    path = str(tmp_path / "t.mbtiles")
    w1 = MBTilesWriter(path, "test")
    w1.write_tile(10, 1, 2, PNG)
    w1.close((0, 0, 1, 1), 10, 10)
    # 重新打开同一文件：已有瓦片可被 has_tile 识别（断点续传）
    w2 = MBTilesWriter(path, "test")
    assert w2.has_tile(10, 1, 2)
    w2.close((0, 0, 1, 1), 10, 10)


def test_directory_writer_roundtrip(tmp_path):
    root = str(tmp_path / "tiles")
    w = DirectoryWriter(root, "test")
    assert not w.has_tile(10, 843, 387)
    w.write_tile(10, 843, 387, PNG)
    assert w.has_tile(10, 843, 387)
    w.close((39.8, 116.2, 40.0, 116.6), 10, 10)

    tile_file = tmp_path / "tiles" / "10" / "843" / "387.png"
    assert tile_file.read_bytes() == PNG
    meta = json.loads((tmp_path / "tiles" / "metadata.json").read_text())
    assert meta["format"] == "png"
    assert meta["scheme"] == "xyz"
    assert meta["bounds"] == "116.2,39.8,116.6,40.0"
