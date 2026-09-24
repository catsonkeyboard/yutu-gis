"""Tests for the external-services endpoints (OpenSky / adsb.fi / geocoding).

All upstream HTTP is mocked following the test_wfs.py convention
(patch services.<mod>.httpx.AsyncClient with AsyncMock).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

from main import app
from services import external as svc


def _mock_client(responses: list):
    """Build a mocked httpx.AsyncClient whose .get/.post consume `responses` in order."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    def _make(item):
        r = MagicMock()
        r.status_code = item.get("status", 200)
        r.text = item.get("text", "")
        r.json = MagicMock(return_value=item.get("json", {}))
        return r

    async def get(url, **kwargs):
        return _make(responses.pop(0) if responses else {"status": 500, "text": ""})

    async def post(url, **kwargs):
        return _make(responses.pop(0) if responses else {"status": 500, "text": ""})

    mock_client.get = get
    mock_client.post = post
    return mock_client


@pytest.fixture(autouse=True)
def _fresh_token_cache():
    svc.clear_token_cache()
    yield
    svc.clear_token_cache()


@pytest.mark.asyncio
async def test_opensky_token_ok_and_cached():
    responses = [{"status": 200, "json": {"access_token": "tok1", "expires_in": 3600}}]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r1 = await client.post("/external/opensky/token", json={"client_id": "a", "client_secret": "b"})
            assert r1.status_code == 200
            assert r1.json()["access_token"] == "tok1"
            assert r1.json()["cached"] is False

            # Second call must hit the cache — no HTTP responses left to consume
            r2 = await client.post("/external/opensky/token", json={"client_id": "a", "client_secret": "b"})
            assert r2.status_code == 200
            assert r2.json()["cached"] is True
            assert r2.json()["access_token"] == "tok1"


@pytest.mark.asyncio
async def test_opensky_token_missing_credentials():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post("/external/opensky/token", json={"client_id": "", "client_secret": ""})
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_opensky_token_upstream_error():
    responses = [{"status": 401, "text": "invalid credentials"}]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/external/opensky/token", json={"client_id": "a", "client_secret": "bad"})
            assert r.status_code == 400
            assert "Token 获取失败" in r.json()["detail"]


@pytest.mark.asyncio
async def test_opensky_states_anonymous():
    responses = [{"status": 200, "json": {"time": 123, "states": [["abc", "CALL", "CN", None, None, 116.0, 39.9] + [None] * 11]}}]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/opensky/states", params={
                "lamin": 39, "lomin": 116, "lamax": 40, "lomax": 117,
            })
            assert r.status_code == 200
            assert r.json()["states"][0][0] == "abc"


@pytest.mark.asyncio
async def test_opensky_states_token_expired_clears_cache():
    # Prime the cache, then make the states call return 401
    svc._token_cache["a"] = {"access_token": "stale", "expires_at": 1e12}
    responses = [{"status": 401, "text": "expired"}]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/opensky/states", params={
                "lamin": 39, "lomin": 116, "lamax": 40, "lomax": 117,
                "client_id": "a", "client_secret": "b",
            })
            assert r.status_code == 401
            assert r.json()["detail"] == "TOKEN_EXPIRED"
    assert "a" not in svc._token_cache  # cache dropped for self-healing retry


@pytest.mark.asyncio
async def test_opensky_states_429_wording():
    responses = [{"status": 429, "text": "rate limited"}]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/opensky/states", params={
                "lamin": 39, "lomin": 116, "lamax": 40, "lomax": 117,
            })
            assert r.status_code == 502
            assert "配额已用尽" in r.json()["detail"]


@pytest.mark.asyncio
async def test_adsbfi_caps_dist_at_250():
    responses = [{"status": 200, "json": {"ac": [], "msg": "", "now": 1, "total": 0, "ctime": 0, "ptime": 0}}]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)) as ctor:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/adsbfi/locations", params={"lat": 47.5, "lon": 8.5, "dist_nm": 999})
            assert r.status_code == 422  # router-level le=250 rejects first


@pytest.mark.asyncio
async def test_adsbfi_ok():
    responses = [{"status": 200, "json": {"ac": [{"hex": "abc", "lat": 47.5, "lon": 8.5}], "msg": "", "now": 1, "total": 1, "ctime": 0, "ptime": 0}}]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/adsbfi/locations", params={"lat": 47.5, "lon": 8.5, "dist_nm": 25})
            assert r.status_code == 200
            assert r.json()["ac"][0]["hex"] == "abc"


@pytest.mark.asyncio
async def test_geocode_nominatim_primary():
    responses = [{
        "status": 200,
        "json": [{
            "place_id": 1, "name": "Beijing", "display_name": "Beijing, China",
            "lat": "39.9", "lon": "116.4",
            "boundingbox": ["39.4", "40.4", "115.9", "116.9"],
            "type": "city", "importance": 0.9,
        }],
    }]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/geocode", params={"q": "Beijing", "limit": 5})
            assert r.status_code == 200
            body = r.json()
            assert body[0]["name"] == "Beijing"
            assert body[0]["bbox"] == [39.4, 40.4, 115.9, 116.9]  # [s, n, w, e] preserved


@pytest.mark.asyncio
async def test_geocode_falls_back_to_photon():
    # First response (Nominatim) fails; second (Photon) succeeds
    responses = [
        {"status": 503, "text": "overloaded"},
        {"status": 200, "json": {"features": [{
            "geometry": {"coordinates": [116.4, 39.9]},
            "properties": {"name": "北京", "city": "北京市", "country": "中国",
                           "osm_value": "city", "extent": [115.9, 40.4, 116.9, 39.4]},
        }]}},
    ]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/geocode", params={"q": "北京", "limit": 5})
            assert r.status_code == 200
            body = r.json()
            assert body[0]["name"] == "北京"
            # Photon extent [w, n, e, s] → [s, n, w, e]
            assert body[0]["bbox"] == [39.4, 40.4, 115.9, 116.9]


@pytest.mark.asyncio
async def test_geocode_both_fail_merges_errors():
    responses = [
        {"status": 503, "text": "nominatim down"},
        {"status": 503, "text": "photon down"},
    ]
    with patch("services.external.httpx.AsyncClient", return_value=_mock_client(responses)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/external/geocode", params={"q": "nowhere", "limit": 5})
            assert r.status_code == 502
            detail = r.json()["detail"]
            assert "Nominatim" in detail and "Photon" in detail
