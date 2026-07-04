# python/tests/test_pbf.py
import sys, os
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import osmium
from fastapi.testclient import TestClient
from main import app
from services.pbf import pbf_to_layers


def _write_fixture(path: str) -> None:
    """Tiny extract: 1 tagged node, 1 building (closed way), 1 road (open way)."""
    w = osmium.SimpleWriter(path)
    w.add_node(osmium.osm.mutable.Node(
        id=1, location=(116.40, 39.90), tags={"amenity": "school", "name": "Test School"}))
    w.add_node(osmium.osm.mutable.Node(id=2, location=(116.41, 39.90)))
    w.add_node(osmium.osm.mutable.Node(id=3, location=(116.41, 39.91)))
    w.add_node(osmium.osm.mutable.Node(id=4, location=(116.40, 39.91)))
    w.add_way(osmium.osm.mutable.Way(
        id=10, nodes=[2, 3, 4, 2], tags={"building": "yes", "name": "Test Building"}))
    w.add_way(osmium.osm.mutable.Way(
        id=11, nodes=[2, 3], tags={"highway": "primary", "name": "Test Road"}))
    w.close()


def test_pbf_to_layers_groups_by_geometry(tmp_path):
    path = str(tmp_path / "fixture.osm.pbf")
    _write_fixture(path)
    result = pbf_to_layers(path)

    assert result["truncated"] is False
    names = {l["name"]: l["geojson"] for l in result["layers"]}
    assert set(names) == {"fixture 面要素", "fixture 线要素", "fixture 点要素"}

    point = names["fixture 点要素"]["features"][0]
    assert point["geometry"]["type"] == "Point"
    assert point["properties"]["name"] == "Test School"
    assert "设施" in point["properties"]["_feature_label"]

    line = names["fixture 线要素"]["features"][0]
    assert line["geometry"]["type"] == "LineString"
    assert line["properties"]["highway"] == "primary"

    poly = names["fixture 面要素"]["features"][0]
    assert poly["geometry"]["type"] == "MultiPolygon"
    assert poly["properties"]["building"] == "yes"
    assert poly["properties"]["_osm_type"] == "way"


def test_pbf_rejects_bad_input(tmp_path):
    with pytest.raises(ValueError):
        pbf_to_layers(str(tmp_path / "missing.osm.pbf"))
    junk = tmp_path / "junk.osm.pbf"
    junk.write_bytes(b"not a pbf at all")
    with pytest.raises(ValueError):
        pbf_to_layers(str(junk))


def test_pbf_import_endpoint(tmp_path):
    path = str(tmp_path / "api.osm.pbf")
    _write_fixture(path)
    with TestClient(app) as client:
        resp = client.post("/data/import/pbf", json={"path": path})
        assert resp.status_code == 200
        data = resp.json()
        assert data["truncated"] is False
        assert len(data["layers"]) == 3

        bad = client.post("/data/import/pbf", json={"path": str(tmp_path / "no.pbf")})
        assert bad.status_code == 400
