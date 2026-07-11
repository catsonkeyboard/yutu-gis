"""DuckDB-backed SQL workbench over loaded map layers.

Layers are registered as tables in a single in-memory DuckDB connection.
With the spatial extension (auto-installed, needs network once) layers are
imported via ST_Read — geometry lands in a typed GEOMETRY column `geom` and
all spatial functions are available. Without it we degrade gracefully:
geometry is kept as GeoJSON text in `geom_json` and attribute SQL still works.

Only read statements are allowed (SELECT / WITH / SHOW / DESCRIBE) — the
workbench is for analysis, not data editing.
"""

import datetime
import decimal
import json
import re
import tempfile
import threading
from pathlib import Path

_lock = threading.RLock()
_con = None
_spatial: bool | None = None
# table name → { layer_id, rows, columns }
_tables: dict[str, dict] = {}

ALLOWED_PREFIXES = ('SELECT', 'WITH', 'SHOW', 'DESCRIBE')
DISPLAY_LIMIT_DEFAULT = 1000
GEOJSON_CAP = 100_000

# Disk-file views: extensions read via GDAL/ST_Read (needs spatial)
GIS_FILE_EXTS = {'.gpkg', '.shp', '.geojson', '.json', '.kml', '.kmz', '.gpx', '.fgb'}


def _connection():
    global _con, _spatial
    if _con is None:
        import duckdb
        _con = duckdb.connect()
        try:
            _con.execute('INSTALL spatial; LOAD spatial;')
            _spatial = True
        except Exception:
            _spatial = False
    return _con


def spatial_enabled() -> bool:
    with _lock:
        _connection()
        return bool(_spatial)


def reset() -> None:
    """Close the connection and clear the registry (tests / app restart)."""
    global _con, _spatial, _tables
    with _lock:
        if _con is not None:
            _con.close()
        _con = None
        _spatial = None
        _tables = {}


def sanitize_table_name(name: str) -> str:
    cleaned = re.sub(r'[^0-9A-Za-z_一-鿿]', '_', name)
    if not cleaned.strip('_'):
        return 'layer'
    return cleaned


def _dedupe_table_name(base: str) -> str:
    if base not in _tables:
        return base
    i = 2
    while f'{base}_{i}' in _tables:
        i += 1
    return f'{base}_{i}'


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _is_geometry_type(type_name: str) -> bool:
    # DuckDB 1.5 reports CRS-typed geometry as "GEOMETRY('EPSG:4326')"
    return type_name.upper().startswith('GEOMETRY')


def _describe(con, table: str) -> list[dict]:
    rows = con.execute(f'DESCRIBE {_quote(table)}').fetchall()
    return [
        {'name': r[0], 'type': r[1], 'geometry': _is_geometry_type(r[1]) or r[0] == 'geom_json'}
        for r in rows
    ]


def _register_spatial(con, table: str, geojson: dict) -> None:
    with tempfile.NamedTemporaryFile('w', suffix='.geojson', delete=False, encoding='utf-8') as tmp:
        json.dump(geojson, tmp, ensure_ascii=False)
        tmp_path = tmp.name
    try:
        con.execute(
            f'CREATE OR REPLACE TABLE {_quote(table)} AS SELECT * FROM ST_Read(?)',
            [tmp_path],
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _register_fallback(con, table: str, geojson: dict) -> None:
    features = geojson.get('features', [])
    # Property type inference: all-int → BIGINT, int/float → DOUBLE, else VARCHAR
    types: dict[str, str] = {}
    for f in features:
        for key, v in (f.get('properties') or {}).items():
            if v is None:
                types.setdefault(key, 'VARCHAR')
            elif isinstance(v, bool) or not isinstance(v, (int, float)):
                types[key] = 'VARCHAR'
            elif isinstance(v, float):
                if types.get(key) != 'VARCHAR':
                    types[key] = 'DOUBLE'
            else:
                types.setdefault(key, 'BIGINT')

    cols = ', '.join(f'{_quote(k)} {t}' for k, t in types.items())
    ddl = f'CREATE OR REPLACE TABLE {_quote(table)} ({cols}{", " if cols else ""}geom_json VARCHAR)'
    con.execute(ddl)

    keys = list(types.keys())
    placeholders = ', '.join(['?'] * (len(keys) + 1))
    insert = f'INSERT INTO {_quote(table)} VALUES ({placeholders})'
    rows = []
    for f in features:
        props = f.get('properties') or {}
        row = []
        for k in keys:
            v = props.get(k)
            if v is not None and types[k] == 'VARCHAR' and not isinstance(v, str):
                v = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
            row.append(v)
        row.append(json.dumps(f.get('geometry'), ensure_ascii=False) if f.get('geometry') else None)
        rows.append(row)
    if rows:
        con.executemany(insert, rows)


def register_layer(name: str, geojson: dict, layer_id: str | None = None) -> dict:
    with _lock:
        con = _connection()
        # Re-registering the same layer replaces its table
        table = None
        if layer_id:
            for tname, meta in _tables.items():
                if meta.get('layer_id') == layer_id:
                    table = tname
                    break
        if table is None:
            table = _dedupe_table_name(sanitize_table_name(name))

        if _spatial:
            _register_spatial(con, table, geojson)
        else:
            _register_fallback(con, table, geojson)

        rows = con.execute(f'SELECT count(*) FROM {_quote(table)}').fetchone()[0]
        columns = _describe(con, table)
        _tables[table] = {
            'layer_id': layer_id, 'rows': rows, 'columns': columns,
            'kind': 'layer', 'path': None,
        }
        return {'table': table, 'columns': columns, 'rows': rows, 'kind': 'layer'}


def register_file(path: str, name: str | None = None) -> dict:
    """Register a local file as a lazy VIEW (no data copied into DuckDB).

    GIS formats go through ST_Read (spatial extension required); CSV and
    Parquet use DuckDB's native readers. Row counts are not computed —
    a count(*) would scan the whole file, which defeats the purpose.
    """
    abspath = str(Path(path).resolve())
    if not Path(abspath).is_file():
        raise ValueError(f'文件不存在：{path}')

    ext = Path(abspath).suffix.lower()
    with _lock:
        con = _connection()
        # CREATE VIEW cannot be a prepared statement — inline the path escaped
        path_literal = "'" + abspath.replace("'", "''") + "'"
        if ext in GIS_FILE_EXTS:
            if not _spatial:
                raise ValueError('spatial 扩展不可用，无法读取 GIS 文件（需联网安装一次）')
            reader = f'ST_Read({path_literal})'
        elif ext == '.csv':
            reader = f'read_csv_auto({path_literal})'
        elif ext == '.parquet':
            reader = f'read_parquet({path_literal})'
        else:
            raise ValueError(f'不支持的文件类型：{ext}')

        # Same path re-registers into the same view (idempotent)
        table = None
        for tname, meta in _tables.items():
            if meta.get('path') == abspath:
                table = tname
                break
        if table is None:
            table = _dedupe_table_name(sanitize_table_name(Path(abspath).stem if name is None else name))

        con.execute(f'CREATE OR REPLACE VIEW {_quote(table)} AS SELECT * FROM {reader}')
        columns = _describe(con, table)
        _tables[table] = {
            'layer_id': None, 'rows': None, 'columns': columns,
            'kind': 'file', 'path': abspath,
        }
        return {'table': table, 'columns': columns, 'rows': None, 'kind': 'file', 'path': abspath}


def list_tables() -> list[dict]:
    with _lock:
        return [
            {
                'table': t,
                'rows': meta['rows'],
                'columns': meta['columns'],
                'kind': meta.get('kind', 'layer'),
                'path': meta.get('path'),
            }
            for t, meta in _tables.items()
        ]


def _validate(sql: str) -> str:
    statements = [s for s in sql.split(';') if s.strip()]
    if len(statements) != 1:
        raise ValueError('一次只能执行一条语句')
    stmt = statements[0].strip()
    first = stmt.split(None, 1)[0].upper() if stmt else ''
    if first not in ALLOWED_PREFIXES:
        raise ValueError('仅支持查询语句（SELECT / WITH / SHOW / DESCRIBE）')
    return stmt


def _json_safe(v):
    if isinstance(v, (datetime.date, datetime.datetime, datetime.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return bytes(v).hex()
    return v


def run_query(sql: str, limit: int = DISPLAY_LIMIT_DEFAULT) -> dict:
    stmt = _validate(sql)
    with _lock:
        con = _connection()
        first = stmt.split(None, 1)[0].upper()
        if first in ('SHOW', 'DESCRIBE'):
            cur = con.execute(stmt)
            columns = [{'name': d[0], 'type': str(d[1]), 'geometry': False} for d in cur.description]
            rows = [[_json_safe(v) for v in row] for row in cur.fetchall()]
            return {'columns': columns, 'rows': rows, 'row_count': len(rows), 'truncated': False}

        con.execute(f'CREATE OR REPLACE TEMP VIEW _result AS ({stmt})')
        columns = _describe(con, '_result')
        select_parts = []
        for c in columns:
            q = _quote(c['name'])
            if _is_geometry_type(c['type']) and _spatial:
                select_parts.append(f'ST_AsGeoJSON({q}) AS {q}')
            else:
                select_parts.append(q)
        cur = con.execute(f'SELECT {", ".join(select_parts)} FROM _result LIMIT {int(limit) + 1}')
        raw = cur.fetchall()
        truncated = len(raw) > limit
        rows = [[_json_safe(v) for v in row] for row in raw[:limit]]
        return {'columns': columns, 'rows': rows, 'row_count': len(rows), 'truncated': truncated}


def query_as_geojson(sql: str, cap: int = GEOJSON_CAP) -> dict:
    stmt = _validate(sql)
    with _lock:
        con = _connection()
        con.execute(f'CREATE OR REPLACE TEMP VIEW _result AS ({stmt})')
        columns = _describe(con, '_result')
        geom_col = next((c['name'] for c in columns if c['geometry']), None)
        if geom_col is None:
            raise ValueError('查询结果不含几何列，无法生成图层')

        select_parts = []
        for c in columns:
            q = _quote(c['name'])
            if c['name'] == geom_col and _is_geometry_type(c['type']) and _spatial:
                select_parts.append(f'ST_AsGeoJSON({q}) AS {q}')
            else:
                select_parts.append(q)
        cur = con.execute(f'SELECT {", ".join(select_parts)} FROM _result LIMIT {cap}')
        names = [c['name'] for c in columns]
        geom_idx = names.index(geom_col)

        features = []
        for row in cur.fetchall():
            geom_raw = row[geom_idx]
            if not geom_raw:
                continue
            try:
                geometry = json.loads(geom_raw) if isinstance(geom_raw, str) else geom_raw
            except (json.JSONDecodeError, TypeError):
                continue
            props = {
                names[i]: _json_safe(v)
                for i, v in enumerate(row)
                if i != geom_idx
            }
            features.append({'type': 'Feature', 'geometry': geometry, 'properties': props})
        return {'type': 'FeatureCollection', 'features': features}
