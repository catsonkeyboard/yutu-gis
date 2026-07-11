"""Export a GeoJSON FeatureCollection to SHP / GPKG / KML / CSV.

`path` is always a target DIRECTORY; file names are derived from `name`.
Returns the list of written files. GeoJSON export stays in the renderer
(plain JSON dump) and never reaches this module.
"""

import csv
import re
from pathlib import Path
from xml.sax.saxutils import escape

FORMATS = {'shp', 'gpkg', 'kml', 'csv'}

# Geometry classes for shapefile splitting (a .shp holds one class only)
GEOM_CLASS = {
    'Point': 'point', 'MultiPoint': 'point',
    'LineString': 'line', 'MultiLineString': 'line',
    'Polygon': 'polygon', 'MultiPolygon': 'polygon',
}
CLASS_SUFFIX = {'point': '点', 'line': '线', 'polygon': '面'}
CLASS_MULTI_TYPE = {'point': 'MultiPoint', 'line': 'MultiLineString', 'polygon': 'MultiPolygon'}


def _sanitize(name: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', '_', name).strip() or 'layer'


def _infer_schema_types(features: list[dict]) -> dict[str, str]:
    """Union of property keys → fiona type ('int' / 'float' / 'str')."""
    types: dict[str, str] = {}
    for f in features:
        for key, v in (f.get('properties') or {}).items():
            if v is None:
                types.setdefault(key, 'str')
                continue
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                types[key] = 'str'
            elif isinstance(v, float):
                if types.get(key) != 'str':
                    types[key] = 'float'
            else:  # int
                if key not in types:
                    types[key] = 'int'
                elif types[key] == 'float':
                    pass
                elif types[key] == 'str':
                    pass
    return types


def _truncate_field_names(keys: list[str], max_bytes: int) -> dict[str, str]:
    """Map original → truncated (utf-8 byte limit) deduplicated field names."""
    used: set[str] = set()
    mapping: dict[str, str] = {}
    for key in keys:
        base = key
        while len(base.encode('utf-8')) > max_bytes:
            base = base[:-1]
        candidate = base or 'f'
        i = 1
        while candidate in used:
            suffix = str(i)
            trimmed = base
            while len((trimmed + suffix).encode('utf-8')) > max_bytes and trimmed:
                trimmed = trimmed[:-1]
            candidate = (trimmed or 'f') + suffix
            i += 1
        used.add(candidate)
        mapping[key] = candidate
    return mapping


def _to_multi(geom: dict, target: str) -> dict:
    """Promote single geometries to their Multi counterpart."""
    gtype = geom['type']
    if gtype == target:
        return geom
    if target == 'MultiPoint' and gtype == 'Point':
        return {'type': target, 'coordinates': [geom['coordinates']]}
    if target == 'MultiLineString' and gtype == 'LineString':
        return {'type': target, 'coordinates': [geom['coordinates']]}
    if target == 'MultiPolygon' and gtype == 'Polygon':
        return {'type': target, 'coordinates': [geom['coordinates']]}
    return geom


def _coerce_props(props: dict, types: dict[str, str], rename: dict[str, str] | None = None) -> dict:
    out = {}
    for key, ftype in types.items():
        v = (props or {}).get(key)
        name = rename[key] if rename else key
        if v is None:
            out[name] = None
        elif ftype == 'str':
            s = v if isinstance(v, str) else str(v)
            out[name] = s[:254]
        elif ftype == 'float':
            out[name] = float(v)
        else:
            out[name] = int(v)
    return out


def _write_fiona(path: Path, driver: str, geom_type: str, features: list[dict],
                 types: dict[str, str], rename: dict[str, str] | None = None) -> None:
    import fiona
    schema = {
        'geometry': geom_type,
        'properties': {(rename[k] if rename else k): t for k, t in types.items()},
    }
    with fiona.open(str(path), 'w', driver=driver, schema=schema,
                    crs='EPSG:4326', encoding='utf-8') as dst:
        for f in features:
            dst.write({
                'geometry': f['geometry'],
                'properties': _coerce_props(f.get('properties') or {}, types, rename),
            })


def _export_shp(features: list[dict], out_dir: Path, name: str) -> list[str]:
    groups: dict[str, list[dict]] = {}
    for f in features:
        cls = GEOM_CLASS.get(f['geometry']['type'])
        if not cls:
            continue  # GeometryCollection etc. unsupported by shapefile
        target = CLASS_MULTI_TYPE[cls]
        groups.setdefault(cls, []).append({**f, 'geometry': _to_multi(f['geometry'], target)})
    if not groups:
        raise ValueError('没有可写入 Shapefile 的几何要素')

    written = []
    multi_class = len(groups) > 1
    for cls, feats in groups.items():
        types = _infer_schema_types(feats)
        rename = _truncate_field_names(list(types.keys()), 10)
        fname = f'{name}_{CLASS_SUFFIX[cls]}' if multi_class else name
        path = out_dir / f'{fname}.shp'
        _write_fiona(path, 'ESRI Shapefile', CLASS_MULTI_TYPE[cls], feats, types, rename)
        written.append(str(path))
    return written


def _export_gpkg(features: list[dict], out_dir: Path, name: str) -> list[str]:
    types = _infer_schema_types(features)
    path = out_dir / f'{name}.gpkg'
    _write_fiona(path, 'GPKG', 'Unknown', features, types)
    return [str(path)]


def _coords_to_kml(coords) -> str:
    return ' '.join(f'{c[0]},{c[1]}' for c in coords)


def _geom_to_kml(geom: dict) -> str:
    gtype = geom['type']
    c = geom.get('coordinates')
    if gtype == 'Point':
        return f'<Point><coordinates>{c[0]},{c[1]}</coordinates></Point>'
    if gtype == 'LineString':
        return f'<LineString><coordinates>{_coords_to_kml(c)}</coordinates></LineString>'
    if gtype == 'Polygon':
        rings = [f'<outerBoundaryIs><LinearRing><coordinates>{_coords_to_kml(c[0])}</coordinates></LinearRing></outerBoundaryIs>']
        for inner in c[1:]:
            rings.append(f'<innerBoundaryIs><LinearRing><coordinates>{_coords_to_kml(inner)}</coordinates></LinearRing></innerBoundaryIs>')
        return f'<Polygon>{"".join(rings)}</Polygon>'
    if gtype == 'MultiPoint':
        parts = [_geom_to_kml({'type': 'Point', 'coordinates': p}) for p in c]
    elif gtype == 'MultiLineString':
        parts = [_geom_to_kml({'type': 'LineString', 'coordinates': p}) for p in c]
    elif gtype == 'MultiPolygon':
        parts = [_geom_to_kml({'type': 'Polygon', 'coordinates': p}) for p in c]
    elif gtype == 'GeometryCollection':
        parts = [_geom_to_kml(g) for g in geom.get('geometries', [])]
    else:
        return ''
    return f'<MultiGeometry>{"".join(parts)}</MultiGeometry>'


def _export_kml(features: list[dict], out_dir: Path, name: str) -> list[str]:
    placemarks = []
    for f in features:
        props = f.get('properties') or {}
        pm_name = props.get('name') or props.get('_feature_label') or ''
        data_items = ''.join(
            f'<Data name="{escape(str(k))}"><value>{escape("" if v is None else str(v))}</value></Data>'
            for k, v in props.items() if k != 'name'
        )
        parts = ['<Placemark>']
        if pm_name:
            parts.append(f'<name>{escape(str(pm_name))}</name>')
        if data_items:
            parts.append(f'<ExtendedData>{data_items}</ExtendedData>')
        parts.append(_geom_to_kml(f['geometry']))
        parts.append('</Placemark>')
        placemarks.append(''.join(parts))
    content = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
        f'<name>{escape(name)}</name>{"".join(placemarks)}'
        '</Document></kml>'
    )
    path = out_dir / f'{name}.kml'
    path.write_text(content, encoding='utf-8')
    return [str(path)]


def _export_csv(features: list[dict], out_dir: Path, name: str) -> list[str]:
    from shapely.geometry import shape

    keys: list[str] = []
    seen = set()
    for f in features:
        for k in (f.get('properties') or {}):
            if k not in seen:
                seen.add(k)
                keys.append(k)
    all_points = all(f['geometry']['type'] == 'Point' for f in features)
    fieldnames = keys + (['lon', 'lat'] if all_points else []) + ['wkt']

    path = out_dir / f'{name}.csv'
    with open(path, 'w', encoding='utf-8-sig', newline='') as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for f in features:
            row = dict(f.get('properties') or {})
            if all_points:
                row['lon'], row['lat'] = f['geometry']['coordinates'][:2]
            row['wkt'] = shape(f['geometry']).wkt
            writer.writerow(row)
    return [str(path)]


def export_layer(geojson: dict, fmt: str, path: str, name: str) -> list[str]:
    if fmt not in FORMATS:
        raise ValueError(f'不支持的导出格式：{fmt}')
    features = [f for f in (geojson or {}).get('features', []) if f.get('geometry')]
    if not features:
        raise ValueError('图层为空，无法导出')
    out_dir = Path(path)
    if not out_dir.is_dir():
        raise ValueError(f'目录不存在：{path}')
    name = _sanitize(name)

    if fmt == 'shp':
        return _export_shp(features, out_dir, name)
    if fmt == 'gpkg':
        return _export_gpkg(features, out_dir, name)
    if fmt == 'kml':
        return _export_kml(features, out_dir, name)
    return _export_csv(features, out_dir, name)
