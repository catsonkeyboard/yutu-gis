"""
Import OSM PBF extracts (.osm.pbf / .pbf) as GeoJSON layers.

Parsed with pyosmium: tagged nodes → Point, linear ways → LineString,
closed area ways + multipolygon relations → (Multi)Polygon via the area
assembler. Features are grouped into up to three layers (点/线/面).
"""
import json
from pathlib import Path

import osmium

from services.osm import _feature_label

# PBF extracts can hold millions of features — far more than the map can
# usefully render. Parsing stops at this cap and the result is flagged.
MAX_FEATURES = 100_000


class _LimitReached(Exception):
    pass


class _Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self._geo = osmium.geom.GeoJSONFactory()
        self.points: list[dict] = []
        self.lines: list[dict] = []
        self.polygons: list[dict] = []
        self.count = 0

    def _add(self, bucket: list[dict], osm_type: str, osm_id: int, tags, geometry: str) -> None:
        tag_dict = dict(tags)
        bucket.append({
            "type": "Feature",
            "geometry": json.loads(geometry),
            "properties": {
                **tag_dict,
                "_osm_id": osm_id,
                "_osm_type": osm_type,
                "_feature_label": _feature_label(tag_dict),
            },
        })
        self.count += 1
        if self.count >= MAX_FEATURES:
            raise _LimitReached()

    def node(self, n) -> None:
        if n.tags:
            self._add(self.points, "node", n.id, n.tags, self._geo.create_point(n))

    def way(self, w) -> None:
        # Closed ways are normally emitted as areas by the area assembler;
        # keep closed *linear* features (e.g. roundabouts) as lines.
        if not w.tags or (w.is_closed() and "highway" not in w.tags):
            return
        try:
            self._add(self.lines, "way", w.id, w.tags, self._geo.create_linestring(w))
        except (osmium.InvalidLocationError, RuntimeError):
            pass  # way references nodes missing from the extract — skip

    def area(self, a) -> None:
        if not a.tags:
            return
        try:
            self._add(
                self.polygons, "way" if a.from_way() else "relation",
                a.orig_id(), a.tags, self._geo.create_multipolygon(a),
            )
        except (osmium.InvalidLocationError, RuntimeError):
            pass


def pbf_to_layers(path_str: str) -> dict:
    """Parse a .osm.pbf file into up to three GeoJSON layers.

    Returns {"layers": [{"name", "geojson"}], "truncated": bool}.
    Raises ValueError for unreadable/invalid files.
    """
    path = Path(path_str).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"文件不存在：{path}")

    handler = _Handler()
    truncated = False
    try:
        handler.apply_file(str(path), locations=True, idx="flex_mem")
    except _LimitReached:
        truncated = True
    except RuntimeError as e:
        raise ValueError(f"无法解析 PBF 文件：{e}")

    stem = path.name.removesuffix(".pbf").removesuffix(".osm")
    layers = []
    for suffix, features in (("面", handler.polygons), ("线", handler.lines), ("点", handler.points)):
        if features:
            layers.append({
                "name": f"{stem} {suffix}要素",
                "geojson": {"type": "FeatureCollection", "features": features},
            })
    if not layers:
        raise ValueError("PBF 文件中没有带标签的要素")

    return {"layers": layers, "truncated": truncated}
