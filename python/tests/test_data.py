import json, pytest, os, sys
from pathlib import Path
from httpx import AsyncClient, ASGITransport
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app

SAMPLE_GEOJSON = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [116.39, 39.91]},
        "properties": {"name": "Beijing"}
    }]
}


@pytest.mark.asyncio
async def test_import_geojson(tmp_path):
    f = tmp_path / "test.geojson"
    f.write_text(json.dumps(SAMPLE_GEOJSON))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with open(f, "rb") as fp:
            resp = await client.post(
                "/data/import",
                files={"file": ("test.geojson", fp, "application/json")}
            )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    assert body["features"][0]["properties"]["name"] == "Beijing"
