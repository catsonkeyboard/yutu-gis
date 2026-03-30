import json
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


# ---------------------------------------------------------------------------
# KML parser (stdlib only — no fiona/GDAL KML driver required)
# ---------------------------------------------------------------------------

def _kml_ns(root: ET.Element) -> str:
    """Extract namespace prefix from root tag, e.g. '{http://...}'."""
    return root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''


def _parse_coords(text: str) -> list[list[float]]:
    coords = []
    for token in text.strip().split():
        parts = token.split(',')
        if len(parts) >= 2:
            try:
                coords.append([float(parts[0]), float(parts[1])])
            except ValueError:
                pass
    return coords


def _parse_kml_geometry(pm: ET.Element, ns: str) -> dict | None:
    def t(name: str) -> str:
        return f'{ns}{name}'

    point = pm.find(t('Point'))
    if point is not None:
        c = point.find(t('coordinates'))
        if c is not None and c.text:
            coords = _parse_coords(c.text)
            if coords:
                return {'type': 'Point', 'coordinates': coords[0]}

    ls = pm.find(t('LineString'))
    if ls is not None:
        c = ls.find(t('coordinates'))
        if c is not None and c.text:
            return {'type': 'LineString', 'coordinates': _parse_coords(c.text)}

    poly = pm.find(t('Polygon'))
    if poly is not None:
        rings = []
        outer = poly.find(t('outerBoundaryIs'))
        if outer is not None:
            lr = outer.find(t('LinearRing'))
            if lr is not None:
                c = lr.find(t('coordinates'))
                if c is not None and c.text:
                    rings.append(_parse_coords(c.text))
        for inner in poly.findall(t('innerBoundaryIs')):
            lr = inner.find(t('LinearRing'))
            if lr is not None:
                c = lr.find(t('coordinates'))
                if c is not None and c.text:
                    rings.append(_parse_coords(c.text))
        if rings:
            return {'type': 'Polygon', 'coordinates': rings}

    multi = pm.find(t('MultiGeometry'))
    if multi is not None:
        geoms = [_parse_kml_geometry(child_wrapper(child, ns), ns) for child in multi]
        geoms = [g for g in geoms if g]
        if geoms:
            return {'type': 'GeometryCollection', 'geometries': geoms}

    return None


class _GeomWrapper:
    """Wrap a raw geometry element so _parse_kml_geometry can find it by tag."""
    pass


def _parse_kml_placemark_geom(pm: ET.Element, ns: str) -> dict | None:
    """Parse geometry from a Placemark element."""
    def t(name: str) -> str:
        return f'{ns}{name}'

    point = pm.find(t('Point'))
    if point is not None:
        c = point.find(t('coordinates'))
        if c is not None and c.text:
            coords = _parse_coords(c.text)
            if coords:
                return {'type': 'Point', 'coordinates': coords[0]}

    ls = pm.find(t('LineString'))
    if ls is not None:
        c = ls.find(t('coordinates'))
        if c is not None and c.text:
            return {'type': 'LineString', 'coordinates': _parse_coords(c.text)}

    poly = pm.find(t('Polygon'))
    if poly is not None:
        rings = []
        outer = poly.find(t('outerBoundaryIs'))
        if outer is not None:
            lr = outer.find(t('LinearRing'))
            if lr is not None:
                c = lr.find(t('coordinates'))
                if c is not None and c.text:
                    rings.append(_parse_coords(c.text))
        for inner in poly.findall(t('innerBoundaryIs')):
            lr = inner.find(t('LinearRing'))
            if lr is not None:
                c = lr.find(t('coordinates'))
                if c is not None and c.text:
                    rings.append(_parse_coords(c.text))
        if rings:
            return {'type': 'Polygon', 'coordinates': rings}

    multi = pm.find(t('MultiGeometry'))
    if multi is not None:
        geoms = []
        for child in multi:
            # wrap child as a fake placemark
            fake = ET.Element('Placemark')
            fake.append(child)
            g = _parse_kml_placemark_geom(fake, ns)
            if g:
                geoms.append(g)
        if geoms:
            return {'type': 'GeometryCollection', 'geometries': geoms}

    return None


def _parse_kml_properties(pm: ET.Element, ns: str) -> dict:
    def t(name: str) -> str:
        return f'{ns}{name}'

    props: dict = {}
    name_el = pm.find(t('name'))
    if name_el is not None and name_el.text:
        props['name'] = name_el.text.strip()
    desc_el = pm.find(t('description'))
    if desc_el is not None and desc_el.text:
        props['description'] = desc_el.text.strip()
    ext = pm.find(t('ExtendedData'))
    if ext is not None:
        for data in ext.findall(t('Data')):
            key = data.get('name', '')
            val_el = data.find(t('value'))
            if key and val_el is not None:
                props[key] = val_el.text or ''
        for sdata in ext.findall(t('SchemaData')):
            for sf in sdata.findall(t('SimpleData')):
                key = sf.get('name', '')
                if key:
                    props[key] = sf.text or ''
    return props


def _placemarks_to_features(container: ET.Element, ns: str) -> list[dict]:
    def t(name: str) -> str:
        return f'{ns}{name}'

    features = []
    for pm in container.findall(t('Placemark')):
        geom = _parse_kml_placemark_geom(pm, ns)
        if geom:
            features.append({
                'type': 'Feature',
                'geometry': geom,
                'properties': _parse_kml_properties(pm, ns),
            })
    return features


def _parse_kml_tree(root: ET.Element, base_name: str) -> list[dict]:
    ns = _kml_ns(root)

    def t(name: str) -> str:
        return f'{ns}{name}'

    doc = root.find(t('Document')) or root
    layers: list[dict] = []

    # Placemarks directly inside Document (not inside a Folder)
    direct = _placemarks_to_features(doc, ns)
    if direct:
        name_el = doc.find(t('name'))
        layer_name = (name_el.text.strip() if name_el is not None and name_el.text else None) or base_name
        layers.append({'name': layer_name, 'geojson': {'type': 'FeatureCollection', 'features': direct}})

    # Each Folder as a separate layer
    for folder in doc.findall(t('Folder')):
        name_el = folder.find(t('name'))
        folder_name = (name_el.text.strip() if name_el is not None and name_el.text else None) or 'Unnamed'
        features = _placemarks_to_features(folder, ns)
        if features:
            layers.append({'name': folder_name, 'geojson': {'type': 'FeatureCollection', 'features': features}})

    if not layers:
        layers.append({'name': base_name, 'geojson': {'type': 'FeatureCollection', 'features': []}})

    return layers


def _kml_to_layers(file_path: str, base_name: str) -> list[dict]:
    """Parse .kml or .kmz without fiona."""
    ext = Path(file_path).suffix.lower()
    if ext == '.kmz':
        with zipfile.ZipFile(file_path) as zf:
            kml_names = [n for n in zf.namelist() if n.lower().endswith('.kml')]
            if not kml_names:
                return [{'name': base_name, 'geojson': {'type': 'FeatureCollection', 'features': []}}]
            with zf.open(kml_names[0]) as f:
                root = ET.parse(f).getroot()
    else:
        root = ET.parse(file_path).getroot()
    return _parse_kml_tree(root, base_name)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def file_to_layers(file_path: str, filename: str = '') -> list[dict]:
    """
    Convert a GIS file to a list of { name, geojson } dicts.
    KML/KMZ may return multiple items (one per layer/folder).
    All other formats return a single-item list.
    """
    ext = Path(file_path).suffix.lower()
    base_name = Path(filename or file_path).stem

    if ext in ('.geojson', '.json'):
        with open(file_path, encoding='utf-8') as f:
            return [{'name': base_name, 'geojson': json.load(f)}]

    if ext in ('.kml', '.kmz'):
        return _kml_to_layers(file_path, base_name)

    try:
        import fiona
        from shapely.geometry import mapping, shape

        features = []
        with fiona.open(file_path) as src:
            for feat in src:
                geom = feat.get('geometry')
                if geom:
                    features.append({
                        'type': 'Feature',
                        'geometry': mapping(shape(geom)),
                        'properties': dict(feat.get('properties') or {}),
                    })
        return [{'name': base_name, 'geojson': {'type': 'FeatureCollection', 'features': features}}]

    except ImportError:
        raise ValueError(f"Format {ext} requires fiona/GDAL which is not installed")
