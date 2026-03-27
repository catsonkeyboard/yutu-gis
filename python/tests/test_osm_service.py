# python/tests/test_osm_service.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.osm import overpass_extract, _way_to_geometry, _feature_label

OVERPASS_RESPONSE = {
    "elements": [
        {
            "type": "way", "id": 111,
            "tags": {"building": "school", "name": "Test School"},
            "geometry": [
                {"lat": 1.0, "lon": 1.0}, {"lat": 1.0, "lon": 1.1},
                {"lat": 1.1, "lon": 1.1}, {"lat": 1.0, "lon": 1.0}
            ]
        },
        {
            "type": "way", "id": 222,
            "tags": {"highway": "primary", "name": "Main Road"},
            "geometry": [
                {"lat": 2.0, "lon": 2.0}, {"lat": 2.1, "lon": 2.1}
            ]
        },
        {
            "type": "node", "id": 333,
            "lat": 3.0, "lon": 3.0,
            "tags": {"amenity": "school", "name": "Gate"}
        },
    ]
}


def test_way_to_geometry_closed_is_polygon():
    nodes = [{"lat": 0.0, "lon": 0.0}, {"lat": 0.0, "lon": 1.0},
             {"lat": 1.0, "lon": 1.0}, {"lat": 0.0, "lon": 0.0}]
    geom = _way_to_geometry(nodes)
    assert geom["type"] == "Polygon"
    assert geom["coordinates"][0][0] == [0.0, 0.0]


def test_way_to_geometry_open_is_linestring():
    nodes = [{"lat": 0.0, "lon": 0.0}, {"lat": 1.0, "lon": 1.0}]
    geom = _way_to_geometry(nodes)
    assert geom["type"] == "LineString"
    assert geom["coordinates"] == [[0.0, 0.0], [1.0, 1.0]]


def test_feature_label_building():
    assert "建筑" in _feature_label({"building": "school", "name": "X"})
    assert "X" in _feature_label({"building": "school", "name": "X"})


def test_feature_label_highway():
    label = _feature_label({"highway": "primary", "name": "Main Road"})
    assert "道路" in label
    assert "Main Road" in label


def test_feature_label_amenity_no_name():
    label = _feature_label({"amenity": "cafe"})
    assert "设施" in label
    assert "cafe" in label


@pytest.mark.asyncio
async def test_overpass_extract_returns_feature_collection():
    mock_resp = MagicMock()
    mock_resp.json.return_value = OVERPASS_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("services.osm.httpx.AsyncClient", return_value=mock_client):
        result = await overpass_extract(1.0, 1.0, 1.2, 1.2)

    assert result["type"] == "FeatureCollection"
    features = result["features"]
    assert len(features) == 3

    building = next(f for f in features if f["properties"]["_osm_id"] == 111)
    assert building["geometry"]["type"] == "Polygon"
    assert "建筑" in building["properties"]["_feature_label"]

    road = next(f for f in features if f["properties"]["_osm_id"] == 222)
    assert road["geometry"]["type"] == "LineString"

    node = next(f for f in features if f["properties"]["_osm_id"] == 333)
    assert node["geometry"]["type"] == "Point"
    assert node["geometry"]["coordinates"] == [3.0, 3.0]


@pytest.mark.asyncio
async def test_overpass_extract_deduplicates():
    duplicate_response = {
        "elements": [
            {
                "type": "way", "id": 999,
                "tags": {"building": "yes"},
                "geometry": [
                    {"lat": 0.0, "lon": 0.0}, {"lat": 0.0, "lon": 1.0}, {"lat": 0.0, "lon": 0.0}
                ]
            },
            {
                "type": "way", "id": 999,
                "tags": {"building": "yes"},
                "geometry": [
                    {"lat": 0.0, "lon": 0.0}, {"lat": 0.0, "lon": 1.0}, {"lat": 0.0, "lon": 0.0}
                ]
            },
        ]
    }
    mock_resp = MagicMock()
    mock_resp.json.return_value = duplicate_response
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("services.osm.httpx.AsyncClient", return_value=mock_client):
        result = await overpass_extract(0.0, 0.0, 1.0, 1.0)

    assert len(result["features"]) == 1
