"""
Live monitoring data sources: earthquakes (USGS), typhoons (温州台风网 istrongcloud),
precipitation radar (RainViewer), wildfires (NASA FIRMS), disaster alerts (GDACS),
air quality (WAQI). FIRMS and WAQI need a free key/token; the rest are open.
"""
import csv
import io
from datetime import datetime
from typing import Any

import httpx

from services.netutil import PROXY_MOUNTS as _PROXY_MOUNTS

TIMEOUT = 20.0

USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson"
USGS_FEEDS = {"all_hour", "all_day", "2.5_day", "4.5_day", "2.5_week", "4.5_week"}

TYPHOON_YEAR_URL = "https://data.istrongcloud.com/v2/data/complex/{year}.json"
TYPHOON_DETAIL_URL = "https://data.istrongcloud.com/v2/data/complex/{tfbh}.json"

RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json"

# VIIRS S-NPP near-real-time fire detections, worldwide, last 24 h
FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/world/1"
MAX_FIRES = 20000

GDACS_URL = "https://www.gdacs.org/xml/gdacs.geojson"

WAQI_BOUNDS_URL = "https://api.waqi.info/v2/map/bounds"


def _client(timeout: float = TIMEOUT) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout, verify=False, mounts=_PROXY_MOUNTS or None)


async def fetch_earthquakes(feed: str) -> dict:
    """Fetch a USGS earthquake summary feed and slim it down to the properties we render."""
    if feed not in USGS_FEEDS:
        raise ValueError(f"unknown feed: {feed}")
    async with _client() as client:
        resp = await client.get(USGS_URL.format(feed=feed))
        resp.raise_for_status()
        data = resp.json()

    features: list[dict] = []
    for f in data.get("features", []):
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        props = f.get("properties") or {}
        if props.get("mag") is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [coords[0], coords[1]]},
            "properties": {
                "mag": props.get("mag"),
                "place": props.get("place") or "",
                "time": props.get("time"),
                "depth": round(coords[2], 1) if len(coords) > 2 and coords[2] is not None else None,
                "url": props.get("url") or "",
            },
        })
    return {"type": "FeatureCollection", "features": features}


def _ty_point_props(p: dict, name: str, tfbh: str, kind: str, sets: str = "") -> dict:
    return {
        "kind": kind,
        "name": name,
        "tfbh": tfbh,
        "time": p.get("time") or "",
        "strong": p.get("strong") or "",
        "power": p.get("power"),
        "speed": p.get("speed"),
        "pressure": p.get("pressure"),
        "move_dir": p.get("move_dir") or "",
        "move_speed": p.get("move_speed"),
        "sets": sets,
    }


def _ty_coord(p: dict) -> list[float] | None:
    try:
        return [float(p["lng"]), float(p["lat"])]
    except (KeyError, TypeError, ValueError):
        return None


def _typhoon_features(detail: dict) -> list[dict]:
    """Convert one typhoon detail record into track/point/forecast/label features."""
    name = f"{detail.get('name') or ''} {detail.get('ename') or ''}".strip()
    tfbh = str(detail.get("tfbh") or detail.get("ident") or "")
    is_current = bool(detail.get("is_current"))
    points = detail.get("points") or []

    features: list[dict] = []
    track: list[list[float]] = []
    for p in points:
        coord = _ty_coord(p)
        if not coord:
            continue
        track.append(coord)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coord},
            "properties": _ty_point_props(p, name, tfbh, "point"),
        })

    if len(track) >= 2:
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": track},
            "properties": {"kind": "track", "name": name, "tfbh": tfbh, "active": is_current},
        })

    if track:
        # Name label anchored at the latest known position
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": track[-1]},
            "properties": {"kind": "label", "name": name, "tfbh": tfbh},
        })

    # Forecast track from the last actual point (prefer the 中国 agency)
    forecasts = (points[-1].get("forecast") or []) if points else []
    chosen = next((f for f in forecasts if f.get("sets") == "中国"), forecasts[0] if forecasts else None)
    if chosen and track:
        sets = chosen.get("sets") or ""
        fline: list[list[float]] = [track[-1]]
        for p in chosen.get("points") or []:
            coord = _ty_coord(p)
            if not coord:
                continue
            fline.append(coord)
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coord},
                "properties": _ty_point_props(p, name, tfbh, "forecast-point", sets),
            })
        if len(fline) >= 2:
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": fline},
                "properties": {"kind": "forecast", "name": name, "tfbh": tfbh, "sets": sets},
            })

    return features


async def fetch_typhoons() -> dict:
    """Fetch typhoon tracks for the current year.

    Active typhoons (is_current) are returned; if none are active, the most
    recent typhoon of the year is returned so the layer is never empty.
    Falls back to the previous year when the current year has no data yet.
    """
    async with _client() as client:
        year = datetime.now().year
        listing: list[dict] = []
        for y in (year, year - 1):
            try:
                resp = await client.get(TYPHOON_YEAR_URL.format(year=y))
                resp.raise_for_status()
                listing = resp.json() or []
                if listing:
                    break
            except httpx.HTTPStatusError:
                continue

        targets = [t for t in listing if t.get("is_current")] or listing[:1]

        features: list[dict] = []
        for t in targets:
            tfbh = t.get("tfbh") or t.get("ident")
            if not tfbh:
                continue
            resp = await client.get(TYPHOON_DETAIL_URL.format(tfbh=tfbh))
            resp.raise_for_status()
            detail = resp.json()
            if isinstance(detail, list):
                detail = detail[0] if detail else {}
            detail.setdefault("is_current", t.get("is_current"))
            features.extend(_typhoon_features(detail))

    return {"type": "FeatureCollection", "features": features}


async def fetch_fires(map_key: str) -> dict:
    """NASA FIRMS VIIRS fire detections (last 24 h, worldwide) as GeoJSON points.

    Low-confidence detections are dropped; the result is capped at MAX_FIRES
    (highest fire-radiative-power first) and flagged `truncated` in that case.
    """
    # Worldwide daily CSV is tens of MB — allow extra time
    async with _client(timeout=90.0) as client:
        resp = await client.get(FIRMS_URL.format(key=map_key))
        resp.raise_for_status()
        text = resp.text

    first_line = text.split("\n", 1)[0].lower()
    if "latitude" not in first_line:
        # FIRMS reports errors (e.g. invalid MAP_KEY) as plain text with HTTP 200
        raise RuntimeError(text.strip()[:200])

    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        if (row.get("confidence") or "").lower() == "l":
            continue
        try:
            lat, lon = float(row["latitude"]), float(row["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        try:
            frp = float(row.get("frp") or 0)
        except ValueError:
            frp = 0.0
        rows.append((lat, lon, frp, row))

    truncated = len(rows) > MAX_FIRES
    if truncated:
        rows.sort(key=lambda r: r[2], reverse=True)
        rows = rows[:MAX_FIRES]

    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "frp": frp,
                "brightness": row.get("bright_ti4"),
                "confidence": row.get("confidence"),
                "acq": f"{row.get('acq_date', '')} {row.get('acq_time', '')} UTC".strip(),
                "daynight": row.get("daynight"),
            },
        }
        for lat, lon, frp, row in rows
    ]
    return {"type": "FeatureCollection", "features": features, "truncated": truncated}


async def fetch_gdacs() -> dict:
    """GDACS current disaster alerts as GeoJSON points (one marker per event)."""
    # The GDACS feed is several MB and its server is slow — allow extra time
    async with _client(timeout=60.0) as client:
        resp = await client.get(GDACS_URL)
        resp.raise_for_status()
        data = resp.json()

    seen: set = set()
    features: list[dict] = []
    for f in data.get("features", []):
        geom = f.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        props = f.get("properties") or {}
        key = (props.get("eventtype"), props.get("eventid"))
        if key in seen:
            continue
        seen.add(key)
        description = props.get("description") or ""
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "eventtype": props.get("eventtype") or "",
                "alertlevel": props.get("alertlevel") or "Green",
                "name": props.get("eventname") or props.get("name") or "",
                "country": props.get("country") or "",
                "fromdate": props.get("fromdate") or "",
                "todate": props.get("todate") or "",
                "description": description[:200],
            },
        })
    return {"type": "FeatureCollection", "features": features}


async def fetch_waqi(token: str, south: float, west: float, north: float, east: float) -> dict:
    """WAQI air-quality stations within a bounding box as GeoJSON points."""
    async with _client() as client:
        resp = await client.get(
            WAQI_BOUNDS_URL,
            params={"latlng": f"{south},{west},{north},{east}", "token": token},
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "ok":
        raise RuntimeError(str(data.get("data") or "WAQI request failed"))

    features: list[dict] = []
    for st in data.get("data") or []:
        try:
            aqi = int(st.get("aqi"))
        except (TypeError, ValueError):
            continue  # '-' means no current reading
        station = st.get("station") or {}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [st.get("lon"), st.get("lat")]},
            "properties": {
                "aqi": aqi,
                "name": station.get("name") or "",
                "time": station.get("time") or "",
            },
        })
    return {"type": "FeatureCollection", "features": features}


async def fetch_rainviewer() -> dict:
    """Return the latest RainViewer radar frame as an XYZ tile URL template."""
    async with _client() as client:
        resp = await client.get(RAINVIEWER_URL)
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()

    host = data.get("host") or "https://tilecache.rainviewer.com"
    radar = data.get("radar") or {}
    past = radar.get("past") or []
    nowcast = radar.get("nowcast") or []
    if not past:
        raise RuntimeError("RainViewer returned no radar frames")

    # 2 = universal blue color scheme, 1_1 = smoothed + snow shown
    def template(path: str) -> str:
        return f"{host}{path}/256/{{z}}/{{x}}/{{y}}/2/1_1.png"

    frames = [
        {"time": f.get("time"), "tile_template": template(f["path"]), "nowcast": False}
        for f in past
    ] + [
        {"time": f.get("time"), "tile_template": template(f["path"]), "nowcast": True}
        for f in nowcast
    ]

    latest = past[-1]
    return {
        # Legacy single-frame fields (kept for compatibility)
        "host": host,
        "path": latest["path"],
        "time": latest.get("time"),
        "tile_template": template(latest["path"]),
        # Full timeline (past + short-term forecast)
        "frames": frames,
    }
