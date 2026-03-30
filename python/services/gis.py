import json
from pathlib import Path


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

    try:
        import fiona
        from shapely.geometry import mapping, shape

        if ext in ('.kml', '.kmz'):
            layer_names = fiona.listlayers(file_path)
            results = []
            for layer_name in layer_names:
                with fiona.open(file_path, layer=layer_name) as src:
                    features = []
                    for feat in src:
                        geom = feat.get('geometry')
                        if geom:
                            features.append({
                                'type': 'Feature',
                                'geometry': mapping(shape(geom)),
                                'properties': dict(feat.get('properties') or {}),
                            })
                    if features:
                        results.append({
                            'name': layer_name,
                            'geojson': {'type': 'FeatureCollection', 'features': features},
                        })
            # Fallback: if no named layers produced features, treat as single layer
            if not results:
                return [{'name': base_name, 'geojson': {'type': 'FeatureCollection', 'features': []}}]
            return results

        # All other fiona-supported formats (SHP, GPX, …)
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
