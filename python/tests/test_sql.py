import pytest

from services import sql as sql_service


def fc(*features):
    return {'type': 'FeatureCollection', 'features': list(features)}


def feat(geom, props=None):
    return {'type': 'Feature', 'geometry': geom, 'properties': props or {}}


def point_geom(lon, lat, props=None):
    return feat({'type': 'Point', 'coordinates': [lon, lat]}, props)


SQUARE = feat({
    'type': 'Polygon',
    'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
}, {'name': '方块'})


@pytest.fixture(autouse=True)
def clean_registry():
    sql_service.reset()
    yield
    sql_service.reset()


class TestSanitize:
    def test_keeps_cjk_and_replaces_specials(self):
        assert sql_service.sanitize_table_name('北京 建筑物(2024)') == '北京_建筑物_2024_'

    def test_empty_falls_back(self):
        assert sql_service.sanitize_table_name('***') == 'layer'


class TestRegister:
    def test_register_and_read_back(self):
        info = sql_service.register_layer('城市', fc(
            point_geom(116.4, 39.9, {'name': '北京', 'pop': 21540000}),
            point_geom(121.47, 31.23, {'name': '上海', 'pop': 24870000}),
        ))
        assert info['table'] == '城市'
        assert info['rows'] == 2
        colnames = [c['name'] for c in info['columns']]
        assert 'name' in colnames and 'pop' in colnames

        result = sql_service.run_query('SELECT name, pop FROM 城市 ORDER BY pop DESC')
        assert result['row_count'] == 2
        assert result['rows'][0][0] == '上海'

    def test_duplicate_names_are_deduped(self):
        a = sql_service.register_layer('城市', fc(point_geom(0, 0)))
        b = sql_service.register_layer('城市', fc(point_geom(1, 1)))  # no layer_id → new table
        assert a['table'] != b['table']

    def test_reregister_same_layer_replaces(self):
        sql_service.register_layer('城市', fc(point_geom(0, 0)), layer_id='L1')
        sql_service.register_layer('城市', fc(point_geom(0, 0), point_geom(1, 1)), layer_id='L1')
        tables = sql_service.list_tables()
        assert len(tables) == 1
        assert tables[0]['rows'] == 2


class TestQuery:
    def test_rejects_non_select(self):
        sql_service.register_layer('t', fc(point_geom(0, 0)))
        with pytest.raises(ValueError):
            sql_service.run_query('UPDATE t SET x = 1')
        with pytest.raises(ValueError):
            sql_service.run_query('DROP TABLE t')

    def test_rejects_multiple_statements(self):
        with pytest.raises(ValueError):
            sql_service.run_query('SELECT 1; SELECT 2')

    def test_truncation_flag(self):
        sql_service.register_layer('pts', fc(*[point_geom(i, i, {'i': i}) for i in range(20)]))
        result = sql_service.run_query('SELECT * FROM pts', limit=5)
        assert result['truncated'] is True
        assert len(result['rows']) == 5

    def test_geometry_column_returned_as_geojson(self):
        sql_service.register_layer('poly', fc(SQUARE))
        result = sql_service.run_query('SELECT * FROM poly')
        colnames = [c['name'] for c in result['columns']]
        geom_idx = next(i for i, c in enumerate(result['columns']) if c['geometry'])
        import json
        geom = json.loads(result['rows'][0][geom_idx])
        assert geom['type'] == 'Polygon'
        assert 'name' in colnames

    @pytest.mark.skipif(not sql_service.spatial_enabled(), reason='spatial extension unavailable')
    def test_spatial_function(self):
        sql_service.register_layer('poly', fc(SQUARE))
        result = sql_service.run_query('SELECT ST_Area(geom) AS a FROM poly')
        assert result['rows'][0][0] == pytest.approx(1.0)


class TestQueryAsGeojson:
    def test_returns_feature_collection(self):
        sql_service.register_layer('poly', fc(SQUARE))
        out = sql_service.query_as_geojson('SELECT * FROM poly')
        assert out['type'] == 'FeatureCollection'
        assert len(out['features']) == 1
        f = out['features'][0]
        assert f['geometry']['type'] == 'Polygon'
        assert f['properties']['name'] == '方块'

    def test_no_geometry_column_raises(self):
        sql_service.register_layer('poly', fc(SQUARE))
        with pytest.raises(ValueError):
            sql_service.query_as_geojson('SELECT name FROM poly')


class TestRegisterFile:
    def _write_geojson(self, tmp_path):
        import json
        p = tmp_path / '城市数据.geojson'
        p.write_text(json.dumps(fc(
            point_geom(116.4, 39.9, {'name': '北京'}),
            point_geom(121.47, 31.23, {'name': '上海'}),
        ), ensure_ascii=False), encoding='utf-8')
        return str(p)

    @pytest.mark.skipif(not sql_service.spatial_enabled(), reason='spatial extension unavailable')
    def test_geojson_file_as_view(self, tmp_path):
        path = self._write_geojson(tmp_path)
        info = sql_service.register_file(path)
        assert info['table'] == '城市数据'
        assert info['kind'] == 'file'
        assert info['rows'] is None
        colnames = [c['name'] for c in info['columns']]
        assert 'name' in colnames
        assert any(c['geometry'] for c in info['columns'])

        result = sql_service.run_query('SELECT name FROM 城市数据 ORDER BY name')
        assert result['row_count'] == 2

    @pytest.mark.skipif(not sql_service.spatial_enabled(), reason='spatial extension unavailable')
    def test_same_path_is_idempotent(self, tmp_path):
        path = self._write_geojson(tmp_path)
        a = sql_service.register_file(path)
        b = sql_service.register_file(path)
        assert a['table'] == b['table']
        assert len([t for t in sql_service.list_tables() if t['kind'] == 'file']) == 1

    def test_csv_file_as_view(self, tmp_path):
        p = tmp_path / 'data.csv'
        p.write_text('id,value\n1,10\n2,20\n', encoding='utf-8')
        info = sql_service.register_file(str(p))
        assert info['kind'] == 'file'
        result = sql_service.run_query('SELECT sum(value) FROM data')
        assert result['rows'][0][0] == 30

    def test_parquet_file_as_view(self, tmp_path):
        import duckdb
        p = tmp_path / 'nums.parquet'
        duckdb.connect().execute(
            f"COPY (SELECT range AS n FROM range(5)) TO '{p}' (FORMAT PARQUET)"
        )
        sql_service.register_file(str(p))
        result = sql_service.run_query('SELECT count(*) FROM nums')
        assert result['rows'][0][0] == 5

    def test_missing_file_raises(self):
        with pytest.raises(ValueError):
            sql_service.register_file('/nonexistent/file.gpkg')

    def test_unsupported_extension_raises(self, tmp_path):
        p = tmp_path / 'x.docx'
        p.write_text('hi')
        with pytest.raises(ValueError):
            sql_service.register_file(str(p))


class TestExportQuery:
    def test_exports_full_result_to_csv(self, tmp_path):
        sql_service.register_layer('pts', fc(*[point_geom(i, i, {'i': i}) for i in range(15)]))
        out = str(tmp_path / 'result.csv')
        info = sql_service.export_query('SELECT i FROM pts ORDER BY i', out)
        assert info['rows'] == 15
        lines = open(out, encoding='utf-8').read().strip().splitlines()
        assert lines[0] == 'i'
        assert len(lines) == 16  # header + 15 rows

    def test_rejects_non_select(self, tmp_path):
        with pytest.raises(ValueError):
            sql_service.export_query('DROP TABLE x', str(tmp_path / 'x.csv'))
