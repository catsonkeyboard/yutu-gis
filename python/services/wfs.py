"""
WFS 1.x/2.x and OGC API Features fetching service.
"""
import xml.etree.ElementTree as ET
from typing import Any
import httpx

TIMEOUT = 30.0

# XML namespaces used in WFS GetCapabilities responses
WFS_NS = {
    'wfs': 'http://www.opengis.net/wfs',
    'wfs2': 'http://www.opengis.net/wfs/2.0',
    'ows': 'http://www.opengis.net/ows/1.1',
    'ows11': 'http://www.opengis.net/ows',
}


# ---------------------------------------------------------------------------
# WFS 1.x / 2.x
# ---------------------------------------------------------------------------

async def wfs_get_layers(url: str) -> list[dict]:
    """Return list of {name, title} from WFS GetCapabilities."""
    params = {'SERVICE': 'WFS', 'REQUEST': 'GetCapabilities'}
    async with httpx.AsyncClient(timeout=TIMEOUT, verify=False) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
    layers: list[dict] = []

    # WFS 2.0 FeatureTypeList
    for ft in root.iter('{http://www.opengis.net/wfs/2.0}FeatureType'):
        name = ft.findtext('{http://www.opengis.net/wfs/2.0}Name') or ''
        title = ft.findtext('{http://www.opengis.net/wfs/2.0}Title') or name
        layers.append({'name': name, 'title': title})

    # WFS 1.x FeatureTypeList
    if not layers:
        for ft in root.iter('{http://www.opengis.net/wfs}FeatureType'):
            name = ft.findtext('{http://www.opengis.net/wfs}Name') or ''
            title = ft.findtext('{http://www.opengis.net/wfs}Title') or name
            layers.append({'name': name, 'title': title})

    return layers


async def wfs_get_features(url: str, type_name: str, max_features: int) -> dict[str, Any]:
    """Fetch features from WFS GetFeature endpoint, return GeoJSON."""
    params: dict[str, str] = {
        'SERVICE': 'WFS',
        'REQUEST': 'GetFeature',
        'TYPENAMES': type_name,
        'TYPENAME': type_name,  # WFS 1.x compat
        'OUTPUTFORMAT': 'application/json',
        'COUNT': str(max_features),        # WFS 2.0
        'MAXFEATURES': str(max_features),  # WFS 1.x
    }
    async with httpx.AsyncClient(timeout=TIMEOUT, verify=False) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()

    content_type = resp.headers.get('content-type', '')
    if 'json' in content_type:
        data = resp.json()
    else:
        # Try parsing as JSON anyway (some servers omit correct content-type)
        try:
            data = resp.json()
        except Exception:
            raise ValueError(
                f'WFS server returned non-JSON response (content-type: {content_type}). '
                'Make sure OUTPUTFORMAT=application/json is supported.'
            )

    # Normalise: some WFS wrap features in a different structure
    if 'features' not in data and isinstance(data.get('members'), list):
        data = {'type': 'FeatureCollection', 'features': data['members']}

    return data


# ---------------------------------------------------------------------------
# OGC API Features
# ---------------------------------------------------------------------------

async def ogc_get_collections(url: str) -> list[dict]:
    """Return list of {id, title} from OGC API /collections."""
    base = url.rstrip('/')
    async with httpx.AsyncClient(timeout=TIMEOUT, verify=False) as client:
        resp = await client.get(f'{base}/collections', params={'f': 'json'})
        resp.raise_for_status()

    data = resp.json()
    collections = data.get('collections', [])
    return [
        {'id': c.get('id', ''), 'title': c.get('title', c.get('id', ''))}
        for c in collections
    ]


async def ogc_get_features(url: str, collection_id: str, max_features: int) -> dict[str, Any]:
    """Fetch features from OGC API Features /collections/{id}/items."""
    base = url.rstrip('/')
    items_url = f'{base}/collections/{collection_id}/items'
    async with httpx.AsyncClient(timeout=TIMEOUT, verify=False) as client:
        resp = await client.get(items_url, params={'f': 'json', 'limit': max_features})
        resp.raise_for_status()

    return resp.json()
