"""Tests for WFS / OGC API Features endpoints using mocked HTTP responses."""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app

SAMPLE_GEOJSON = {
    'type': 'FeatureCollection',
    'features': [
        {
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [116.39, 39.91]},
            'properties': {'name': 'Test'},
        }
    ],
}

WFS_CAPABILITIES_XML = """<?xml version="1.0"?>
<WFS_Capabilities xmlns="http://www.opengis.net/wfs/2.0">
  <FeatureTypeList>
    <FeatureType>
      <Name>test:layer1</Name>
      <Title>Layer One</Title>
    </FeatureType>
    <FeatureType>
      <Name>test:layer2</Name>
      <Title>Layer Two</Title>
    </FeatureType>
  </FeatureTypeList>
</WFS_Capabilities>"""

OGC_COLLECTIONS = {
    'collections': [
        {'id': 'buildings', 'title': 'Buildings'},
        {'id': 'roads', 'title': 'Roads'},
    ]
}


@pytest.mark.asyncio
async def test_wfs_get_layers():
    mock_resp = MagicMock()
    mock_resp.text = WFS_CAPABILITIES_XML
    mock_resp.raise_for_status = MagicMock()

    with patch('services.wfs.httpx.AsyncClient') as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.post('/data/wfs/layers', json={'url': 'http://fake-wfs/wfs'})

    assert resp.status_code == 200
    layers = resp.json()['layers']
    assert len(layers) == 2
    assert layers[0]['name'] == 'test:layer1'
    assert layers[0]['title'] == 'Layer One'


@pytest.mark.asyncio
async def test_wfs_get_features():
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=SAMPLE_GEOJSON)
    mock_resp.headers = {'content-type': 'application/json'}
    mock_resp.raise_for_status = MagicMock()

    with patch('services.wfs.httpx.AsyncClient') as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.post(
                '/data/wfs/features',
                json={'url': 'http://fake-wfs/wfs', 'type_name': 'test:layer1', 'max_features': 100},
            )

    assert resp.status_code == 200
    assert resp.json()['type'] == 'FeatureCollection'
    assert len(resp.json()['features']) == 1


@pytest.mark.asyncio
async def test_ogc_get_collections():
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=OGC_COLLECTIONS)
    mock_resp.raise_for_status = MagicMock()

    with patch('services.wfs.httpx.AsyncClient') as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.post('/data/ogc/collections', json={'url': 'http://fake-ogc'})

    assert resp.status_code == 200
    cols = resp.json()['collections']
    assert len(cols) == 2
    assert cols[0]['id'] == 'buildings'


@pytest.mark.asyncio
async def test_ogc_get_features():
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=SAMPLE_GEOJSON)
    mock_resp.raise_for_status = MagicMock()

    with patch('services.wfs.httpx.AsyncClient') as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            resp = await client.post(
                '/data/ogc/features',
                json={'url': 'http://fake-ogc', 'collection_id': 'buildings', 'max_features': 500},
            )

    assert resp.status_code == 200
    assert resp.json()['type'] == 'FeatureCollection'
