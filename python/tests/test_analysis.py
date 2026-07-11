import math

import pytest

from services.analysis import run_analysis


def fc(*features):
    return {'type': 'FeatureCollection', 'features': list(features)}


def feat(geom, props=None):
    return {'type': 'Feature', 'geometry': geom, 'properties': props or {}}


def point(lon, lat, props=None):
    return feat({'type': 'Point', 'coordinates': [lon, lat]}, props)


def square(lon, lat, size, props=None):
    """Axis-aligned square with lower-left corner at (lon, lat)."""
    return feat({
        'type': 'Polygon',
        'coordinates': [[
            [lon, lat], [lon + size, lat], [lon + size, lat + size],
            [lon, lat + size], [lon, lat],
        ]],
    }, props)


class TestBuffer:
    def test_point_buffer_produces_polygon_of_right_size(self):
        out = run_analysis('buffer', fc(point(116.4, 39.9, {'name': 'p'})), None, {'distance': 1000})
        assert out['type'] == 'FeatureCollection'
        assert len(out['features']) == 1
        f = out['features'][0]
        assert f['geometry']['type'] in ('Polygon', 'MultiPolygon')
        assert f['properties'] == {'name': 'p'}
        # bbox width should be ~2km ≈ 0.0235° lon at 39.9°N
        lons = [c[0] for c in f['geometry']['coordinates'][0]]
        width_deg = max(lons) - min(lons)
        width_m = width_deg * 111320 * math.cos(math.radians(39.9))
        assert 1900 < width_m < 2100

    def test_negative_buffer_can_empty_geometry(self):
        out = run_analysis('buffer', fc(square(0, 0, 0.001)), None, {'distance': -1000})
        assert out['features'] == []


class TestOverlay:
    def test_clip_keeps_only_inside_part(self):
        primary = fc(square(0, 0, 2, {'id': 1}))
        mask = fc(square(1, 0, 2))
        out = run_analysis('clip', primary, mask, {})
        assert len(out['features']) == 1
        assert out['features'][0]['properties'] == {'id': 1}
        lons = {c[0] for c in out['features'][0]['geometry']['coordinates'][0]}
        assert min(lons) == pytest.approx(1)

    def test_intersection_merges_properties_with_prefix(self):
        primary = fc(square(0, 0, 2, {'a': 1}))
        secondary = fc(square(1, 1, 2, {'x': 9}))
        out = run_analysis('intersection', primary, secondary, {})
        assert len(out['features']) == 1
        assert out['features'][0]['properties'] == {'a': 1, 'b_x': 9}

    def test_difference_erases_overlap(self):
        primary = fc(square(0, 0, 2, {'a': 1}))
        secondary = fc(square(0, 0, 1))
        out = run_analysis('difference', primary, secondary, {})
        assert len(out['features']) == 1
        # area 4 - 1 = 3 (degrees²)
        from shapely.geometry import shape
        assert shape(out['features'][0]['geometry']).area == pytest.approx(3)

    def test_select_by_location_intersects(self):
        primary = fc(point(0.5, 0.5, {'n': 'in'}), point(5, 5, {'n': 'out'}))
        secondary = fc(square(0, 0, 1))
        out = run_analysis('select_by_location', primary, secondary, {'predicate': 'intersects'})
        assert [f['properties']['n'] for f in out['features']] == ['in']

    def test_select_by_location_disjoint(self):
        primary = fc(point(0.5, 0.5, {'n': 'in'}), point(5, 5, {'n': 'out'}))
        secondary = fc(square(0, 0, 1))
        out = run_analysis('select_by_location', primary, secondary, {'predicate': 'disjoint'})
        assert [f['properties']['n'] for f in out['features']] == ['out']


class TestMisc:
    def test_union_appends_both_layers(self):
        out = run_analysis('union', fc(point(0, 0, {'a': 1})), fc(point(1, 1, {'b': 2})), {})
        assert len(out['features']) == 2

    def test_dissolve_by_field(self):
        primary = fc(
            square(0, 0, 1, {'cat': 'x'}),
            square(1, 0, 1, {'cat': 'x'}),
            square(5, 5, 1, {'cat': 'y'}),
        )
        out = run_analysis('dissolve', primary, None, {'field': 'cat'})
        assert len(out['features']) == 2
        cats = sorted(f['properties']['cat'] for f in out['features'])
        assert cats == ['x', 'y']

    def test_dissolve_all(self):
        primary = fc(square(0, 0, 1), square(1, 0, 1))
        out = run_analysis('dissolve', primary, None, {})
        assert len(out['features']) == 1

    def test_convex_hull_returns_single_feature(self):
        out = run_analysis('convex_hull', fc(point(0, 0), point(1, 0), point(0, 1)), None, {})
        assert len(out['features']) == 1
        assert out['features'][0]['geometry']['type'] == 'Polygon'

    def test_centroid_per_feature_keeps_props(self):
        out = run_analysis('centroid', fc(square(0, 0, 2, {'id': 7})), None, {})
        assert len(out['features']) == 1
        f = out['features'][0]
        assert f['geometry']['type'] == 'Point'
        assert f['geometry']['coordinates'] == pytest.approx([1, 1])
        assert f['properties'] == {'id': 7}

    def test_simplify_reduces_vertices(self):
        # dense circle-ish line
        coords = [[math.cos(t / 50) * 0.01, math.sin(t / 50) * 0.01] for t in range(300)]
        line = feat({'type': 'LineString', 'coordinates': coords})
        out = run_analysis('simplify', fc(line), None, {'tolerance': 200})
        assert len(out['features'][0]['geometry']['coordinates']) < 50

    def test_invalid_geometry_is_skipped(self):
        bad = feat({'type': 'Polygon', 'coordinates': [[[0, 0], [1, 1]]]})  # too few points
        out = run_analysis('centroid', fc(bad, point(0, 0)), None, {})
        assert len(out['features']) == 1
        assert out['skipped'] == 1

    def test_unknown_op_raises(self):
        with pytest.raises(ValueError):
            run_analysis('teleport', fc(), None, {})

    def test_missing_secondary_raises(self):
        with pytest.raises(ValueError):
            run_analysis('clip', fc(point(0, 0)), None, {})
