"""External HTTP services migrated from the Electron main process:
OpenSky Network, adsb.fi open data, and Nominatim/Photon geocoding.

Migration notes (2026-09-24, docs/plans/2026-09-24-main-process-network-migration.md):
- All requests go through httpx with system-proxy mounts (netutil.PROXY_MOUNTS),
  which the previous Node `https` implementation did NOT honor — this migration
  fixes flight tracking / location search on machines behind corporate proxies.
- OpenSky tokens are cached server-side per client_id (expiry minus 60 s),
  eliminating the renderer's token bookkeeping and the TOKEN_EXPIRED race.
"""

import time
from typing import Any

import httpx

from services.netutil import PROXY_MOUNTS as _PROXY_MOUNTS

OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)
OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"

ADSBFI_URL = "https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{dist}"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
GEOCODING_TIMEOUT = 10.0

# client_id → { access_token, expires_at (unix ts) }
_token_cache: dict[str, dict[str, Any]] = {}


def _client(timeout: float = 20.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout, mounts=_PROXY_MOUNTS or None)


def clear_token_cache() -> None:
    """Drop cached OpenSky tokens (tests / credential rotation)."""
    _token_cache.clear()


# ═══════════════════════════════════════════════════════════════════════════════
# OpenSky Network
# ═══════════════════════════════════════════════════════════════════════════════


async def fetch_opensky_token(client_id: str, client_secret: str) -> dict:
    """Exchange client credentials for an access token (with in-memory cache)."""
    cached = _token_cache.get(client_id)
    if cached and cached["expires_at"] > time.time():
        return {
            "access_token": cached["access_token"],
            "expires_in": int(cached["expires_at"] - time.time()),
            "cached": True,
        }

    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    async with _client() as client:
        resp = await client.post(
            OPENSKY_TOKEN_URL,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise ValueError(f"Token 获取失败 ({resp.status_code}): {resp.text}")

    token = resp.json()
    expires_in = int(token.get("expires_in", 3600))
    _token_cache[client_id] = {
        "access_token": token["access_token"],
        "expires_at": time.time() + expires_in - 60,
    }
    return {"access_token": token["access_token"], "expires_in": expires_in, "cached": False}


async def fetch_opensky_states(
    lamin: float, lomin: float, lamax: float, lomax: float,
    client_id: str = "", client_secret: str = "",
) -> dict:
    """State vectors for a bbox. Credentials are optional (anonymous mode).

    When credentials are supplied, a cached token is reused or fetched first.
    """
    headers: dict[str, str] = {}
    if client_id and client_secret:
        token = await fetch_opensky_token(client_id, client_secret)
        headers["Authorization"] = f"Bearer {token['access_token']}"

    params = {"lamin": lamin, "lomin": lomin, "lamax": lamax, "lomax": lomax, "extended": 1}
    async with _client() as client:
        resp = await client.get(OPENSKY_STATES_URL, params=params, headers=headers)

    if resp.status_code == 401:
        # The cached token went bad (rotated credentials, clock skew) — drop it
        # so the next call re-authenticates.
        _token_cache.pop(client_id, None)
        raise PermissionError("TOKEN_EXPIRED")
    if resp.status_code == 429:
        raise RuntimeError("API 配额已用尽，请稍后再试")
    if resp.status_code != 200:
        raise RuntimeError(f"OpenSky API 错误 ({resp.status_code}): {resp.text}")

    return resp.json()


# ════════════════════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════════════════
# adsb.fi open data
# ═══════════════════════════════════════════════════════════════════════════════


async def fetch_adsbfi(lat: float, lon: float, dist_nm: int) -> dict:
    """Aircraft within `dist_nm` nautical miles of (lat, lon). API caps dist at 250."""
    dist = min(250, max(1, int(dist_nm)))
    url = ADSBFI_URL.format(lat=f"{lat:.4f}", lon=f"{lon:.4f}", dist=dist)
    async with _client() as client:
        resp = await client.get(url)

    if resp.status_code == 429:
        raise RuntimeError("adsb.fi 请求频率超限（限制 1 次/秒），请稍后再试")
    if resp.status_code != 200:
        raise RuntimeError(f"adsb.fi API 错误 ({resp.status_code}): {resp.text}")

    return resp.json()


# ═══════════════════════════════════════════════════════════════════════════════
# Geocoding (Nominatim primary, Photon fallback)
# ═══════════════════════════════════════════════════════════════════════════════


def _nominatim_to_results(items: list[dict]) -> list[dict]:
    return [
        {
            "name": it.get("name") or (it.get("display_name", "").split(",")[0]),
            "displayName": it.get("display_name", ""),
            "lat": float(it["lat"]),
            "lon": float(it["lon"]),
            # Nominatim boundingbox order: [south, north, west, east]
            "bbox": [
                float(it["boundingbox"][0]),
                float(it["boundingbox"][1]),
                float(it["boundingbox"][2]),
                float(it["boundingbox"][3]),
            ],
            "type": it.get("type", ""),
            "importance": it.get("importance", 0.0),
        }
        for it in items
    ]


def _photon_to_results(features: list[dict], query: str) -> list[dict]:
    out: list[dict] = []
    for f in features:
        lon, lat = f["geometry"]["coordinates"]
        p = f.get("properties") or {}
        name = p.get("name") or query
        display = ", ".join(x for x in [p.get("name"), p.get("city"), p.get("state"), p.get("country")] if x)
        # Photon extent: [west, north, east, south] → Nominatim [south, north, west, east]
        pad = 0.02
        extent = p.get("extent")
        bbox = (
            [extent[3], extent[1], extent[0], extent[2]] if extent
            else [lat - pad, lat + pad, lon - pad, lon + pad]
        )
        out.append({
            "name": name,
            "displayName": display or name,
            "lat": lat,
            "lon": lon,
            "bbox": bbox,
            "type": p.get("osm_value") or "place",
            "importance": 0.0,
        })
    return out


async def _geocode_nominatim(query: str, limit: int) -> list[dict]:
    params = {"q": query, "format": "jsonv2", "limit": str(limit), "addressdetails": "0"}
    async with _client(timeout=GEOCODING_TIMEOUT) as client:
        resp = await client.get(
            NOMINATIM_URL, params=params,
            headers={"User-Agent": "YutuGIS/1.0"},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Nominatim 查询失败 ({resp.status_code}): {resp.text}")
    return _nominatim_to_results(resp.json())


async def _geocode_photon(query: str, limit: int) -> list[dict]:
    async with _client(timeout=GEOCODING_TIMEOUT) as client:
        resp = await client.get(PHOTON_URL, params={"q": query, "limit": str(limit)})
    if resp.status_code != 200:
        raise RuntimeError(f"Photon 查询失败 ({resp.status_code}): {resp.text}")
    return _photon_to_results(resp.json().get("features", []), query)


async def geocode_search(query: str, limit: int = 5) -> list[dict]:
    """Search a place by name. Nominatim first; on timeout/error fall back to Photon."""
    nominatim_error: Exception | None = None
    try:
        return await _geocode_nominatim(query, limit)
    except Exception as e:  # noqa: BLE001 — fallback is the point
        nominatim_error = e

    try:
        return await _geocode_photon(query, limit)
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(
            f"地名搜索失败 — Nominatim: {nominatim_error}；Photon: {e}"
        ) from e
