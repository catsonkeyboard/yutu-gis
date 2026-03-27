import json
from pathlib import Path


def file_to_geojson(file_path: str) -> dict:
    """Convert supported GIS formats to GeoJSON FeatureCollection."""
    ext = Path(file_path).suffix.lower()

    if ext in ('.geojson', '.json'):
        with open(file_path, encoding='utf-8') as f:
            return json.load(f)

    # For other formats, use fiona if available
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
        return {'type': 'FeatureCollection', 'features': features}
    except ImportError:
        raise ValueError(f"Format {ext} requires fiona/GDAL which is not installed")
