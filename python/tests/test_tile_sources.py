# python/tests/test_tile_sources.py
import sys, os
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from main import app
from services import tile_sources
from services.tiles import MBTilesWriter, DirectoryWriter

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _make_mbtiles(tmp_path, name="src.mbtiles"):
    path = str(tmp_path / name)
    w = MBTilesWriter(path, "test-src")
    w.write_tile(10, 843, 388, PNG)
    w.close((39.8, 116.2, 40.0, 116.6), 10, 10)
    return path


def _make_directory(tmp_path, name="tiles-dir"):
    root = str(tmp_path / name)
    w = DirectoryWriter(root, "test-dir")
    w.write_tile(10, 843, 388, PNG)
    w.close((39.8, 116.2, 40.0, 116.6), 10, 10)
    return root


def test_register_mbtiles_reads_metadata(tmp_path):
    src = tile_sources.register(_make_mbtiles(tmp_path))
    assert src.kind == "mbtiles"
    assert src.name == "test-src"
    assert src.format == "png"
    assert src.bounds == [116.2, 39.8, 116.6, 40.0]
    assert src.minzoom == 10 and src.maxzoom == 10


def test_register_is_idempotent(tmp_path):
    path = _make_mbtiles(tmp_path)
    a = tile_sources.register(path)
    b = tile_sources.register(path)
    assert a.source_id == b.source_id
    assert a is b


def test_read_tile_mbtiles_inverts_y(tmp_path):
    src = tile_sources.register(_make_mbtiles(tmp_path))
    assert tile_sources.read_tile(src, 10, 843, 388) == PNG
    assert tile_sources.read_tile(src, 10, 843, 387) is None


def test_register_directory_reads_metadata(tmp_path):
    src = tile_sources.register(_make_directory(tmp_path))
    assert src.kind == "directory"
    assert src.name == "test-dir"
    assert src.format == "png"
    assert src.bounds == [116.2, 39.8, 116.6, 40.0]
    assert src.minzoom == 10 and src.maxzoom == 10


def test_read_tile_directory(tmp_path):
    src = tile_sources.register(_make_directory(tmp_path))
    assert tile_sources.read_tile(src, 10, 843, 388) == PNG
    assert tile_sources.read_tile(src, 10, 0, 0) is None


def test_register_rejects_bad_paths(tmp_path):
    with pytest.raises(ValueError):
        tile_sources.register(str(tmp_path / "nope.mbtiles"))
    (tmp_path / "not-tiles").mkdir()
    with pytest.raises(ValueError):
        tile_sources.register(str(tmp_path / "not-tiles"))
    junk = tmp_path / "junk.mbtiles"
    junk.write_bytes(b"this is not sqlite")
    with pytest.raises(ValueError):
        tile_sources.register(str(junk))


def test_source_api_lifecycle(tmp_path):
    path = _make_mbtiles(tmp_path, "api.mbtiles")
    with TestClient(app) as client:
        resp = client.post("/tiles/sources", json={"path": path})
        assert resp.status_code == 200
        info = resp.json()
        sid = info["source_id"]
        assert info["format"] == "png"
        assert info["minzoom"] == 10

        tile = client.get(f"/tiles/sources/{sid}/10/843/388")
        assert tile.status_code == 200
        assert tile.content == PNG
        assert tile.headers["content-type"] == "image/png"

        assert client.get(f"/tiles/sources/{sid}/10/843/387").status_code == 404
        assert client.get("/tiles/sources/nope/1/2/3").status_code == 404

        bad = client.post("/tiles/sources", json={"path": str(tmp_path / "missing.mbtiles")})
        assert bad.status_code == 400
