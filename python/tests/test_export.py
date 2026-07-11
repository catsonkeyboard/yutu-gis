import csv
import io

import pytest

from services.export import export_layer


def fc(*features):
    return {'type': 'FeatureCollection', 'features': list(features)}


def feat(geom, props=None):
    return {'type': 'Feature', 'geometry': geom, 'properties': props or {}}


POINT = {'type': 'Point', 'coordinates': [116.4, 39.9]}
LINE = {'type': 'LineString', 'coordinates': [[0, 0], [1, 1]]}
POLY = {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 0]]]}


class TestShp:
    def test_mixed_geometries_split_into_files(self, tmp_path):
        data = fc(
            feat(POINT, {'name': 'p', 'value': 3}),
            feat(LINE, {'name': 'l', 'value': 1.5}),
            feat(POLY, {'name': 'g'}),
        )
        files = export_layer(data, 'shp', str(tmp_path), 'test')
        assert len(files) == 3
        assert all(f.endswith('.shp') for f in files)

        import fiona
        total = 0
        for f in files:
            with fiona.open(f) as src:
                assert src.crs.to_epsg() == 4326
                total += len(list(src))
        assert total == 3

    def test_long_field_names_are_truncated_and_deduped(self, tmp_path):
        data = fc(feat(POINT, {'a_very_long_field_name_1': 1, 'a_very_long_field_name_2': 2}))
        files = export_layer(data, 'shp', str(tmp_path), 'names')
        import fiona
        with fiona.open(files[0]) as src:
            keys = list(src.schema['properties'].keys())
        assert len(keys) == 2
        assert len(set(keys)) == 2
        assert all(len(k.encode('utf-8')) <= 10 for k in keys)


class TestGpkg:
    def test_mixed_geometries_single_file(self, tmp_path):
        data = fc(feat(POINT, {'n': 1}), feat(POLY, {'n': 2}))
        files = export_layer(data, 'gpkg', str(tmp_path), 'mix')
        assert len(files) == 1
        import fiona
        with fiona.open(files[0]) as src:
            assert len(list(src)) == 2


class TestKml:
    def test_kml_structure(self, tmp_path):
        data = fc(feat(POINT, {'name': '北京', 'pop': 21540000}))
        files = export_layer(data, 'kml', str(tmp_path), 'cities')
        content = open(files[0], encoding='utf-8').read()
        assert '<kml' in content
        assert '<Placemark>' in content
        assert '<name>北京</name>' in content
        assert 'pop' in content
        assert '116.4,39.9' in content


class TestCsv:
    def test_csv_columns_and_bom(self, tmp_path):
        data = fc(feat(POINT, {'name': 'a'}), feat(POINT, {'name': 'b', 'x': 1}))
        files = export_layer(data, 'csv', str(tmp_path), 'pts')
        raw = open(files[0], 'rb').read()
        assert raw.startswith(b'\xef\xbb\xbf')
        rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
        assert len(rows) == 2
        assert 'wkt' in rows[0]
        assert 'lon' in rows[0] and 'lat' in rows[0]
        assert rows[0]['name'] == 'a'


class TestErrors:
    def test_empty_layer_raises(self, tmp_path):
        with pytest.raises(ValueError):
            export_layer(fc(), 'shp', str(tmp_path), 'empty')

    def test_unknown_format_raises(self, tmp_path):
        with pytest.raises(ValueError):
            export_layer(fc(feat(POINT)), 'dwg', str(tmp_path), 'x')
