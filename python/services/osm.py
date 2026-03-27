"""
OSM Feature Extraction via Overpass API.
"""
from typing import Any
import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TIMEOUT = 20.0


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


def _feature_label(tags: dict) -> str:
    name = tags.get("name", "")
    suffix = f" - {name}" if name else ""

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


def _overpass_query(lat: float, lon: float) -> str:
    return f"""[out:json][timeout:15];
(
  is_in({lat},{lon})->.a;
  way(pivot.a);
  relation(pivot.a);
  way(around:30,{lat},{lon})[~"building|highway|landuse|amenity|leisure|natural"~"."];
  node(around:30,{lat},{lon})[~"amenity|shop|tourism"~"."][name];
);
out geom qt;"""


async def overpass_extract(lat: float, lon: float) -> dict:
    """Query Overpass API and return a GeoJSON FeatureCollection."""
    query = _overpass_query(lat, lon)
    async with httpx.AsyncClient(timeout=TIMEOUT, verify=False) as client:
        resp = await client.post(OVERPASS_URL, data={"data": query})
        resp.raise_for_status()
    data = resp.json()

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
