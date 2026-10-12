from pathlib import Path

import pytest

from services import layer_store


def fc(n: int) -> dict:
    return {
        'type': 'FeatureCollection',
        'features': [
            {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [i, i]}, 'properties': {'i': i}}
            for i in range(n)
        ],
    }


@pytest.fixture(autouse=True)
def _tmp_store(tmp_path, monkeypatch):
    monkeypatch.setattr(layer_store, 'STORE_DIR', tmp_path)


class TestPut:
    def test_small_collection_returns_none(self):
        assert layer_store.put(fc(5)) is None
        assert layer_store.put({'type': 'FeatureCollection', 'features': []}) is None

    def test_big_collection_returns_hash_and_file(self):
        digest = layer_store.put(fc(2001))
        assert digest is not None
        p = layer_store.path_of(digest)
        assert p is not None and p.is_file()

    def test_same_content_dedupes(self):
        a = layer_store.put(fc(2001))
        b = layer_store.put(fc(2001))
        assert a == b
        files = list(layer_store.STORE_DIR.glob('*.geojson'))
        assert len(files) == 1

    def test_force_stores_small_payload(self):
        assert layer_store.put(fc(1), force=True) is not None

    def test_no_tmp_files_left_behind(self):
        layer_store.put(fc(2001))
        assert list(layer_store.STORE_DIR.glob('*.tmp')) == []


class TestCopyOut:
    def test_roundtrip(self, tmp_path):
        digest = layer_store.put(fc(2001), force=True)
        dest = tmp_path / 'nested' / 'out' / 'layer.geojson'
        layer_store.copy_out(digest, str(dest))
        assert dest.read_text() == layer_store.path_of(digest).read_text()

    def test_unknown_hash_raises(self, tmp_path):
        with pytest.raises(ValueError):
            layer_store.copy_out('deadbeefdeadbeef', str(tmp_path / 'x.geojson'))



class TestGc:
    def _seed(self, name: str, size: int, mtime: float):
        import os

        p = layer_store.STORE_DIR / name
        p.write_bytes(b'x' * size)
        os.utime(p, (mtime, mtime))

    def test_evicts_oldest_until_under_low_water(self, monkeypatch):
        monkeypatch.setattr(layer_store, 'MAX_BYTES', 3000)
        monkeypatch.setattr(layer_store, 'LOW_BYTES', 1500)
        layer_store.STORE_DIR.mkdir(parents=True, exist_ok=True)
        self._seed('o1.geojson', 1000, 1000.0)
        self._seed('o2.geojson', 1000, 2000.0)
        self._seed('o3.geojson', 1000, 3000.0)
        self._seed('o4.geojson', 1000, 4000.0)
        removed = layer_store.gc()
        assert removed == 3  # 4000 → evict oldest until <= 1500
        assert (layer_store.STORE_DIR / 'o4.geojson').exists()
        assert not (layer_store.STORE_DIR / 'o1.geojson').exists()

    def test_under_cap_is_noop(self, monkeypatch):
        monkeypatch.setattr(layer_store, 'MAX_BYTES', 10**9)
        layer_store.STORE_DIR.mkdir(parents=True, exist_ok=True)
        self._seed('keep.geojson', 10, 1.0)
        assert layer_store.gc() == 0
