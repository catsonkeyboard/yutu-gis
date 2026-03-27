# python/tests/test_osm_endpoint.py
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app

MOCK_FC = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [110.0, 20.0]},
            "properties": {"_osm_id": 1, "_osm_type": "node", "_feature_label": "设施 (cafe)"}
        }
    ]
}


@pytest.mark.asyncio
async def test_osm_extract_endpoint():
    with patch("routers.data.osm_service.overpass_extract", new=AsyncMock(return_value=MOCK_FC)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/data/osm/extract", json={"lat": 20.0, "lon": 110.0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    assert body["features"][0]["properties"]["_feature_label"] == "设施 (cafe)"


@pytest.mark.asyncio
async def test_osm_extract_endpoint_error():
    with patch("routers.data.osm_service.overpass_extract",
               new=AsyncMock(side_effect=Exception("timeout"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/data/osm/extract", json={"lat": 20.0, "lon": 110.0})
    assert resp.status_code == 400
    assert "timeout" in resp.json()["detail"]
