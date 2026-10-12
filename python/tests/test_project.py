import pytest
from pathlib import Path
from urllib.parse import quote

from fastapi.testclient import TestClient

from main import app
from services import layer_store


@pytest.fixture(autouse=True)
def _tmp_store(tmp_path, monkeypatch):
    monkeypatch.setattr(layer_store, 'STORE_DIR', tmp_path)

client = TestClient(app)


class TestFileRoundTrip:
    def test_write_then_read(self, tmp_path):
        p = tmp_path / "demo.files" / "abc.geojson"
        body = b'{"type":"FeatureCollection","features":[]}'
        resp = client.post(f"/project/file?path={quote(str(p))}", content=body)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True, "bytes": len(body)}

        got = client.get(f"/project/file?path={quote(str(p))}")
        assert got.status_code == 200
        assert got.content == body

    def test_write_creates_nested_dirs_and_replaces(self, tmp_path):
        p = tmp_path / "a" / "b" / "c.geojson"
        client.post(f"/project/file?path={quote(str(p))}", content=b"1")
        client.post(f"/project/file?path={quote(str(p))}", content=b"22")
        got = client.get(f"/project/file?path={quote(str(p))}")
        assert got.content == b"22"
        # temp files must not linger after replace
        assert list(p.parent.glob("*.tmp")) == []

    def test_read_missing_404(self, tmp_path):
        resp = client.get(f"/project/file?path={quote(str(tmp_path / 'nope.geojson'))}")
        assert resp.status_code == 404


class TestCleanup:
    def test_removes_orphans_keeps_referenced(self, tmp_path):
        d = tmp_path / "demo.files"
        d.mkdir()
        keep = d / "keep.geojson"
        orphan = d / "orphan.geojson"
        other = d / "metadata.json"
        keep.write_text("{}")
        orphan.write_text("{}")
        other.write_text("{}")

        resp = client.post("/project/cleanup", json={"dir": str(d), "keep": ["keep.geojson"]})
        assert resp.status_code == 200
        assert resp.json() == {"removed": 1}
        assert keep.exists()
        assert not orphan.exists()
        # non-.geojson files are never touched
        assert other.exists()

    def test_missing_dir_is_noop(self, tmp_path):
        resp = client.post("/project/cleanup", json={"dir": str(tmp_path / "nope"), "keep": []})
        assert resp.status_code == 200
        assert resp.json() == {"removed": 0}


class TestCopyFromStore:
    def _big(self, n):
        return {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [i, i]}, "properties": {}}
                for i in range(n)
            ],
        }

    def test_copies_store_entry_to_dest(self, tmp_path):
        digest = layer_store.put(self._big(3), force=True)
        dest = tmp_path / "proj.files" / "layer.geojson"
        resp = client.post("/project/copy", json={"hash": digest, "path": str(dest)})
        assert resp.status_code == 200
        assert dest.read_text() == layer_store.path_of(digest).read_text()

    def test_unknown_hash_404(self, tmp_path):
        resp = client.post(
            "/project/copy",
            json={"hash": "nosuch", "path": str(tmp_path / "x.geojson")},
        )
        assert resp.status_code == 404
