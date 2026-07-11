"""Vector analysis operations on GeoJSON FeatureCollections.

All computation is in WGS-84 except metric ops (buffer/simplify), which are
projected to the UTM zone of the layer centroid — accuracy degrades for
layers spanning multiple zones (documented trade-off).
"""

from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

VALID_OPS = {
    'buffer', 'clip', 'intersection', 'difference', 'union', 'dissolve',
    'convex_hull', 'centroid', 'simplify', 'select_by_location',
}
NEEDS_SECONDARY = {'clip', 'intersection', 'difference', 'union', 'select_by_location'}
PREDICATES = {'intersects', 'within', 'contains', 'disjoint'}


def _parse_features(fc: dict) -> tuple[list[tuple], int]:
    """Return ([(geometry, properties), ...], skipped_count) with cleaned geometries."""
    out = []
    skipped = 0
    for f in (fc or {}).get('features', []):
        geom_json = f.get('geometry')
        if not geom_json:
            skipped += 1
            continue
        try:
            geom = shape(geom_json)
            if not geom.is_valid:
                geom = make_valid(geom)
            if geom.is_empty:
                skipped += 1
                continue
        except Exception:
            skipped += 1
            continue
        out.append((geom, dict(f.get('properties') or {})))
    return out, skipped


def _to_feature(geom, props: dict) -> dict:
    return {'type': 'Feature', 'geometry': mapping(geom), 'properties': props}


def _result(features: list[dict], skipped: int) -> dict:
    return {'type': 'FeatureCollection', 'features': features, 'skipped': skipped}


def _utm_transformers(geoms) -> tuple:
    """(to_metric, to_wgs84) transformers for the UTM zone of the collection centroid."""
    center = unary_union([g.centroid for g in geoms]).centroid
    lon, lat = center.x, center.y
    if abs(lat) > 84:
        crs = 'EPSG:3857'
    else:
        zone = min(60, max(1, int((lon + 180) // 6) + 1))
        crs = f'EPSG:{32600 + zone if lat >= 0 else 32700 + zone}'
    fwd = Transformer.from_crs('EPSG:4326', crs, always_xy=True).transform
    back = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True).transform
    return fwd, back


def _polygons_only(items) -> tuple[list, int]:
    """Keep only polygonal geometries from (geom, props) pairs."""
    kept = []
    dropped = 0
    for geom, props in items:
        if geom.geom_type in ('Polygon', 'MultiPolygon'):
            kept.append((geom, props))
        elif geom.geom_type == 'GeometryCollection':
            polys = [g for g in geom.geoms if g.geom_type in ('Polygon', 'MultiPolygon')]
            if polys:
                kept.append((unary_union(polys), props))
            else:
                dropped += 1
        else:
            dropped += 1
    return kept, dropped


def _metric_op(items, fn) -> list:
    geoms = [g for g, _ in items]
    fwd, back = _utm_transformers(geoms)
    out = []
    for geom, props in items:
        res = fn(shp_transform(fwd, geom))
        if res.is_empty:
            continue
        out.append((shp_transform(back, res), props))
    return out


def run_analysis(op: str, primary: dict, secondary: dict | None, params: dict) -> dict:
    if op not in VALID_OPS:
        raise ValueError(f'未知运算：{op}')
    if op in NEEDS_SECONDARY and not secondary:
        raise ValueError(f'运算 {op} 需要叠加图层')

    prim, skipped = _parse_features(primary)
    sec, sec_skipped = _parse_features(secondary) if secondary else ([], 0)
    skipped += sec_skipped

    if op == 'buffer':
        distance = params.get('distance')
        if distance is None:
            raise ValueError('缓冲区需要 distance 参数（米）')
        items = _metric_op(prim, lambda g: g.buffer(float(distance)))
        return _result([_to_feature(g, p) for g, p in items], skipped)

    if op == 'simplify':
        tolerance = params.get('tolerance')
        if tolerance is None:
            raise ValueError('简化需要 tolerance 参数（米）')
        items = _metric_op(prim, lambda g: g.simplify(float(tolerance), preserve_topology=True))
        return _result([_to_feature(g, p) for g, p in items], skipped)

    if op == 'centroid':
        feats = [_to_feature(g.centroid, p) for g, p in prim]
        return _result(feats, skipped)

    if op == 'convex_hull':
        if not prim:
            return _result([], skipped)
        hull = unary_union([g for g, _ in prim]).convex_hull
        return _result([_to_feature(hull, {})], skipped)

    if op == 'dissolve':
        field = params.get('field')
        if not prim:
            return _result([], skipped)
        if field:
            groups: dict = {}
            for g, p in prim:
                groups.setdefault(p.get(field), []).append(g)
            feats = [
                _to_feature(unary_union(geoms), {field: value})
                for value, geoms in groups.items()
            ]
        else:
            feats = [_to_feature(unary_union([g for g, _ in prim]), {})]
        return _result(feats, skipped)

    if op == 'union':
        feats = [_to_feature(g, p) for g, p in prim] + [_to_feature(g, p) for g, p in sec]
        return _result(feats, skipped)

    if op == 'select_by_location':
        predicate = params.get('predicate', 'intersects')
        if predicate not in PREDICATES:
            raise ValueError(f'不支持的空间谓词：{predicate}')
        sec_geoms = [g for g, _ in sec]
        if not sec_geoms:
            feats = [_to_feature(g, p) for g, p in prim] if predicate == 'disjoint' else []
            return _result(feats, skipped)
        tree = STRtree(sec_geoms)
        feats = []
        for g, p in prim:
            candidates = [sec_geoms[i] for i in tree.query(g)]
            if predicate == 'disjoint':
                hit = all(g.disjoint(c) for c in candidates)  # non-candidates are disjoint by construction
            elif predicate == 'within':
                hit = any(g.within(c) for c in candidates)
            elif predicate == 'contains':
                hit = any(g.contains(c) for c in candidates)
            else:
                hit = any(g.intersects(c) for c in candidates)
            if hit:
                feats.append(_to_feature(g, p))
        return _result(feats, skipped)

    # Overlay ops against polygonal secondary: clip / intersection / difference
    sec_polys, dropped = _polygons_only(sec)
    skipped += dropped
    if not sec_polys:
        if op == 'difference':
            return _result([_to_feature(g, p) for g, p in prim], skipped)
        return _result([], skipped)

    sec_geoms = [g for g, _ in sec_polys]
    tree = STRtree(sec_geoms)

    feats = []
    if op == 'clip':
        mask_union = unary_union(sec_geoms)
        for g, p in prim:
            res = g.intersection(mask_union)
            if not res.is_empty:
                feats.append(_to_feature(res, p))
    elif op == 'difference':
        for g, p in prim:
            candidates = [sec_geoms[i] for i in tree.query(g)]
            res = g
            if candidates:
                res = g.difference(unary_union(candidates))
            if not res.is_empty:
                feats.append(_to_feature(res, p))
    else:  # intersection — pairwise with property merge
        for g, p in prim:
            for i in tree.query(g):
                other, other_props = sec_polys[i]
                res = g.intersection(other)
                if res.is_empty:
                    continue
                merged = dict(p)
                merged.update({f'b_{k}': v for k, v in other_props.items()})
                feats.append(_to_feature(res, merged))
    return _result(feats, skipped)
