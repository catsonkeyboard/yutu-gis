"""
OSM Feature Extraction via Overpass API.
"""
from typing import Any
import httpx

# Public Overpass API endpoints tried in order; first success wins
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
TIMEOUT = 35.0


def _way_to_geometry(nodes: list[dict]) -> dict:
    """Convert a list of {lat, lon} nodes to GeoJSON geometry.
    Closed way (first == last) → Polygon; open way → LineString.
    """
    coords = [[n["lon"], n["lat"]] for n in nodes]
    # Overpass duplicates the exact first node to close rings, so exact equality is safe
    is_closed = len(coords) >= 4 and coords[0] == coords[-1]
    if is_closed:
        return {"type": "Polygon", "coordinates": [coords]}
    return {"type": "LineString", "coordinates": coords}


_AEROWAY_LABELS: dict[str, str] = {
    "aerodrome": "机场",
    "heliport": "直升机场",
    "runway": "跑道",
    "taxiway": "滑行道",
    "apron": "停机坪",
    "terminal": "航站楼",
    "helipad": "停机坪(直升机)",
    "spaceport": "航天港",
    "airstrip": "简易机场",
    "hangar": "机库",
    "stopway": "停止道",
    "holding_position": "等待位置",
    "arresting_gear": "拦阻装置",
    "parking_position": "停机位",
    "gate": "登机口",
    "windsock": "风向袋",
    "navigationaid": "导航助航设施",
    "aircraft_crossing": "飞机穿越点",
    "highway_strip": "公路跑道",
    "tower": "塔台",
}


def _feature_label(tags: dict) -> str:
    name = tags.get("name") or tags.get("ref", "")
    suffix = f" - {name}" if name else ""

    if "aeroway" in tags:
        v = tags["aeroway"]
        cn = _AEROWAY_LABELS.get(v, v)
        return f"{cn}{suffix}"
    if "building" in tags:
        t = tags["building"]
        detail = f" ({t})" if t and t != "yes" else ""
        return f"建筑{suffix}{detail}"
    if "highway" in tags:
        return f"道路{suffix} ({tags['highway']})"
    if "landuse" in tags:
        return f"土地利用{suffix} ({tags['landuse']})"
    if "amenity" in tags:
        return f"设施{suffix} ({tags['amenity']})"
    if "leisure" in tags:
        return f"休闲{suffix} ({tags['leisure']})"
    if "natural" in tags:
        return f"自然{suffix} ({tags['natural']})"
    if name:
        return name
    return "未知要素"


def _overpass_query(south: float, west: float, north: float, east: float) -> str:
    # [bbox:s,w,n,e] restricts all queries to the current map viewport
    return f"""[out:json][timeout:25][bbox:{south},{west},{north},{east}];
(
  way[building];
  way[highway];
  way[landuse];
  way[amenity];
  way[leisure];
  way[natural];
  way[aeroway];
  relation[building];
  relation[landuse];
  relation[aeroway];
  node[aeroway];
  node[amenity][name];
  node[shop][name];
  node[tourism][name];
);
out geom qt;"""


async def airport_by_iata(iata_code: str) -> dict:
    """Return center coordinates and name for an airport given its IATA code.

    Queries Overpass globally (no bbox). Raises ValueError if not found.
    """
    code = iata_code.upper().strip()
    query = f"""[out:json][timeout:10];
(
  node[aeroway=aerodrome][iata="{code}"];
  way[aeroway=aerodrome][iata="{code}"];
  relation[aeroway=aerodrome][iata="{code}"];
);
out bb tags;"""

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        for url in OVERPASS_ENDPOINTS:
            try:
                resp = await client.post(url, data={"data": query})
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as e:
                last_error = e
        else:
            raise last_error  # type: ignore[misc]

    elements = data.get("elements", [])
    if not elements:
        raise ValueError(f"未找到 IATA 代码为 {code} 的机场")

    # Extract bbox from each element's bounding box (out bb) or node coordinates
    min_lat, min_lon, max_lat, max_lon = 90.0, 180.0, -90.0, -180.0
    tags: dict = {}
    found = False
    for el in elements:
        if not tags:
            tags = el.get("tags", {})
        el_type = el.get("type")
        if el_type == "node":
            lat, lon = el.get("lat"), el.get("lon")
            if lat is not None and lon is not None:
                min_lat = min(min_lat, lat)
                max_lat = max(max_lat, lat)
                min_lon = min(min_lon, lon)
                max_lon = max(max_lon, lon)
                found = True
        else:
            bounds = el.get("bounds") or {}
            if bounds.get("minlat") is not None:
                min_lat = min(min_lat, bounds["minlat"])
                max_lat = max(max_lat, bounds["maxlat"])
                min_lon = min(min_lon, bounds["minlon"])
                max_lon = max(max_lon, bounds["maxlon"])
                found = True

    if not found:
        raise ValueError(f"机场 {code} 坐标数据不完整，请检查 OSM 数据")

    name = tags.get("name") or tags.get("name:en") or tags.get("name:zh") or code
    # bbox: [west, south, east, north]
    return {
        "iata": code,
        "name": name,
        "bbox": [min_lon, min_lat, max_lon, max_lat],
    }


async def overpass_extract(south: float, west: float, north: float, east: float) -> dict:
    """Query Overpass API for features within the given bbox and return a GeoJSON FeatureCollection.

    Tries each endpoint in OVERPASS_ENDPOINTS in order; returns the first successful response.
    """
    query = _overpass_query(south, west, north, east)
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=TIMEOUT, verify=False) as client:
        for url in OVERPASS_ENDPOINTS:
            try:
                resp = await client.post(url, data={"data": query})
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as e:
                last_error = e
        else:
            raise last_error  # type: ignore[misc]

    seen: set[tuple] = set()
    features: list[dict] = []

    for el in data.get("elements", []):
        el_type = el.get("type")
        el_id = el.get("id")
        key = (el_type, el_id)
        if key in seen:
            continue
        seen.add(key)

        tags: dict = el.get("tags") or {}
        props: dict[str, Any] = {
            **tags,
            "_osm_id": el_id,
            "_osm_type": el_type,
            "_feature_label": _feature_label(tags),
        }

        geometry: dict | None = None

        if el_type == "node":
            geometry = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}

        elif el_type == "way":
            nodes = el.get("geometry")
            if not nodes or len(nodes) < 2:
                continue
            geometry = _way_to_geometry(nodes)

        elif el_type == "relation":
            outer_coords: list | None = None
            for member in el.get("members") or []:
                if member.get("role") == "outer" and member.get("geometry"):
                    outer_coords = [[n["lon"], n["lat"]] for n in member["geometry"]]
                    break
            if not outer_coords or len(outer_coords) < 3:
                continue
            if outer_coords[0] != outer_coords[-1]:
                outer_coords.append(outer_coords[0])
            geometry = {"type": "Polygon", "coordinates": [outer_coords]}

        if geometry:
            features.append({"type": "Feature", "geometry": geometry, "properties": props})

    return {"type": "FeatureCollection", "features": features}
