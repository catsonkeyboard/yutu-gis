# OSM Feature Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Right-click on the map → context menu → "OSM Feature Extraction" → query Overpass API → preview feature list → import selected features as a new GeoJSON layer.

**Architecture:** New Python service `osm.py` queries the Overpass API and converts results to GeoJSON with human-readable labels. A floating `MapContextMenu` component in `MapCanvas` captures right-click events. `OsmExtractModal` in `App.tsx` handles loading, preview, and import.

**Tech Stack:** Python httpx (existing), FastAPI (existing), React + TypeScript, Ant Design Table + Modal, Zustand layerStore (existing pattern).

---

### Task 1: Python OSM service (`python/services/osm.py`)

**Files:**
- Create: `python/services/osm.py`
- Create: `python/tests/test_osm_service.py`

**Step 1: Write the failing test**

```python
# python/tests/test_osm_service.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.osm import overpass_extract, _way_to_geometry, _feature_label

# Minimal Overpass JSON response with one closed way (building) and one open way (road)
OVERPASS_RESPONSE = {
    "elements": [
        {
            "type": "way", "id": 111,
            "tags": {"building": "school", "name": "Test School"},
            "geometry": [
                {"lat": 1.0, "lon": 1.0}, {"lat": 1.0, "lon": 1.1},
                {"lat": 1.1, "lon": 1.1}, {"lat": 1.0, "lon": 1.0}  # closed
            ]
        },
        {
            "type": "way", "id": 222,
            "tags": {"highway": "primary", "name": "Main Road"},
            "geometry": [
                {"lat": 2.0, "lon": 2.0}, {"lat": 2.1, "lon": 2.1}  # open
            ]
        },
        {
            "type": "node", "id": 333,
            "lat": 3.0, "lon": 3.0,
            "tags": {"amenity": "school", "name": "Gate"}
        },
    ]
}


def test_way_to_geometry_closed_is_polygon():
    nodes = [{"lat": 0.0, "lon": 0.0}, {"lat": 0.0, "lon": 1.0},
             {"lat": 1.0, "lon": 1.0}, {"lat": 0.0, "lon": 0.0}]
    geom = _way_to_geometry(nodes)
    assert geom["type"] == "Polygon"
    assert geom["coordinates"][0][0] == [0.0, 0.0]


def test_way_to_geometry_open_is_linestring():
    nodes = [{"lat": 0.0, "lon": 0.0}, {"lat": 1.0, "lon": 1.0}]
    geom = _way_to_geometry(nodes)
    assert geom["type"] == "LineString"
    assert geom["coordinates"] == [[0.0, 0.0], [1.0, 1.0]]


def test_feature_label_building():
    assert "建筑" in _feature_label({"building": "school", "name": "X"})
    assert "X" in _feature_label({"building": "school", "name": "X"})


def test_feature_label_highway():
    label = _feature_label({"highway": "primary", "name": "Main Road"})
    assert "道路" in label
    assert "Main Road" in label


def test_feature_label_amenity_no_name():
    label = _feature_label({"amenity": "cafe"})
    assert "设施" in label
    assert "cafe" in label


@pytest.mark.asyncio
async def test_overpass_extract_returns_feature_collection():
    mock_resp = MagicMock()
    mock_resp.json.return_value = OVERPASS_RESPONSE
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("services.osm.httpx.AsyncClient", return_value=mock_client):
        result = await overpass_extract(1.05, 1.05)

    assert result["type"] == "FeatureCollection"
    features = result["features"]
    assert len(features) == 3

    # building way → Polygon
    building = next(f for f in features if f["properties"]["_osm_id"] == 111)
    assert building["geometry"]["type"] == "Polygon"
    assert "建筑" in building["properties"]["_feature_label"]

    # road way → LineString
    road = next(f for f in features if f["properties"]["_osm_id"] == 222)
    assert road["geometry"]["type"] == "LineString"

    # node → Point
    node = next(f for f in features if f["properties"]["_osm_id"] == 333)
    assert node["geometry"]["type"] == "Point"
    assert node["geometry"]["coordinates"] == [3.0, 3.0]


@pytest.mark.asyncio
async def test_overpass_extract_deduplicates():
    """Same OSM id appearing twice should only produce one feature."""
    duplicate_response = {
        "elements": [
            {
                "type": "way", "id": 999,
                "tags": {"building": "yes"},
                "geometry": [
                    {"lat": 0.0, "lon": 0.0}, {"lat": 0.0, "lon": 1.0}, {"lat": 0.0, "lon": 0.0}
                ]
            },
            {
                "type": "way", "id": 999,
                "tags": {"building": "yes"},
                "geometry": [
                    {"lat": 0.0, "lon": 0.0}, {"lat": 0.0, "lon": 1.0}, {"lat": 0.0, "lon": 0.0}
                ]
            },
        ]
    }
    mock_resp = MagicMock()
    mock_resp.json.return_value = duplicate_response
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("services.osm.httpx.AsyncClient", return_value=mock_client):
        result = await overpass_extract(0.0, 0.0)

    assert len(result["features"]) == 1
```

**Step 2: Run test to verify it fails**

```bash
cd python && python -m pytest tests/test_osm_service.py -v
```
Expected: `ImportError: cannot import name 'overpass_extract' from 'services.osm'` (module doesn't exist yet)

**Step 3: Implement `python/services/osm.py`**

```python
"""
OSM Feature Extraction via Overpass API.
"""
from typing import Any
import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TIMEOUT = 20.0


def _way_to_geometry(nodes: list[dict]) -> dict:
    """Convert a list of {lat, lon} nodes to GeoJSON geometry.
    Closed way (first == last) → Polygon; open way → LineString.
    """
    coords = [[n["lon"], n["lat"]] for n in nodes]
    is_closed = len(coords) >= 4 and coords[0] == coords[-1]
    if is_closed:
        return {"type": "Polygon", "coordinates": [coords]}
    return {"type": "LineString", "coordinates": coords}


def _feature_label(tags: dict) -> str:
    name = tags.get("name", "")
    suffix = f" - {name}" if name else ""

    if "building" in tags:
        t = tags["building"]
        detail = f" ({t})" if t and t != "yes" else ""
        return f"建筑{suffix}{detail}"
    if "highway" in tags:
        return f"道路{suffix} ({tags['highway']})"
    if "landuse" in tags:
        return f"土地利用{suffix} ({tags['landuse']})"
    if "amenity" in tags:
        return f"设施{suffix} ({tags['amenity']})"
    if "leisure" in tags:
        return f"休闲{suffix} ({tags['leisure']})"
    if "natural" in tags:
        return f"自然{suffix} ({tags['natural']})"
    if name:
        return name
    return "未知要素"


def _overpass_query(lat: float, lon: float) -> str:
    return f"""[out:json][timeout:15];
(
  is_in({lat},{lon})->.a;
  way(pivot.a);
  relation(pivot.a);
  way(around:30,{lat},{lon})[~"building|highway|landuse|amenity|leisure|natural"~"."];
  node(around:30,{lat},{lon})[~"amenity|shop|tourism"~"."][name];
);
out geom qt;"""


async def overpass_extract(lat: float, lon: float) -> dict:
    """Query Overpass API and return a GeoJSON FeatureCollection."""
    query = _overpass_query(lat, lon)
    async with httpx.AsyncClient(timeout=TIMEOUT, verify=False) as client:
        resp = await client.post(OVERPASS_URL, data={"data": query})
        resp.raise_for_status()
    data = resp.json()

    seen: set[tuple] = set()
    features: list[dict] = []

    for el in data.get("elements", []):
        el_type = el.get("type")
        el_id = el.get("id")
        key = (el_type, el_id)
        if key in seen:
            continue
        seen.add(key)

        tags: dict = el.get("tags") or {}
        props: dict[str, Any] = {
            **tags,
            "_osm_id": el_id,
            "_osm_type": el_type,
            "_feature_label": _feature_label(tags),
        }

        geometry: dict | None = None

        if el_type == "node":
            geometry = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}

        elif el_type == "way":
            nodes = el.get("geometry")
            if not nodes or len(nodes) < 2:
                continue
            geometry = _way_to_geometry(nodes)

        elif el_type == "relation":
            # Build outer ring from first outer member with geometry
            outer_coords: list | None = None
            for member in el.get("members") or []:
                if member.get("role") == "outer" and member.get("geometry"):
                    outer_coords = [[n["lon"], n["lat"]] for n in member["geometry"]]
                    break
            if not outer_coords or len(outer_coords) < 3:
                continue
            if outer_coords[0] != outer_coords[-1]:
                outer_coords.append(outer_coords[0])
            geometry = {"type": "Polygon", "coordinates": [outer_coords]}

        if geometry:
            features.append({"type": "Feature", "geometry": geometry, "properties": props})

    return {"type": "FeatureCollection", "features": features}
```

**Step 4: Run tests to verify they pass**

```bash
cd python && python -m pytest tests/test_osm_service.py -v
```
Expected: all 6 tests PASS

**Step 5: Commit**

```bash
git add python/services/osm.py python/tests/test_osm_service.py
git commit -m "feat: add OSM overpass_extract service with tests"
```

---

### Task 2: Python endpoint `POST /data/osm/extract`

**Files:**
- Modify: `python/routers/data.py`
- Create: `python/tests/test_osm_endpoint.py`

**Step 1: Write the failing test**

```python
# python/tests/test_osm_endpoint.py
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app

MOCK_FC = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [110.0, 20.0]},
            "properties": {"_osm_id": 1, "_osm_type": "node", "_feature_label": "设施 (cafe)"}
        }
    ]
}


@pytest.mark.asyncio
async def test_osm_extract_endpoint():
    with patch("routers.data.osm_service.overpass_extract", new=AsyncMock(return_value=MOCK_FC)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/data/osm/extract", json={"lat": 20.0, "lon": 110.0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    assert body["features"][0]["properties"]["_feature_label"] == "设施 (cafe)"


@pytest.mark.asyncio
async def test_osm_extract_endpoint_error():
    with patch("routers.data.osm_service.overpass_extract",
               new=AsyncMock(side_effect=Exception("timeout"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/data/osm/extract", json={"lat": 20.0, "lon": 110.0})
    assert resp.status_code == 400
    assert "timeout" in resp.json()["detail"]
```

**Step 2: Run to verify failure**

```bash
cd python && python -m pytest tests/test_osm_endpoint.py -v
```
Expected: `FAILED` — endpoint doesn't exist yet

**Step 3: Add endpoint to `python/routers/data.py`**

At the top of the file, add the import after the existing service imports:
```python
from services import osm as osm_service
```

Append the endpoint at the bottom of the file:
```python
# ---------------------------------------------------------------------------
# OSM Feature Extraction
# ---------------------------------------------------------------------------

class OsmExtractRequest(BaseModel):
    lat: float
    lon: float


@router.post("/osm/extract")
async def osm_extract(req: OsmExtractRequest):
    """Query Overpass API and return GeoJSON FeatureCollection near (lat, lon)."""
    try:
        return await osm_service.overpass_extract(req.lat, req.lon)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
```

**Step 4: Run tests**

```bash
cd python && python -m pytest tests/test_osm_endpoint.py -v
```
Expected: 2 tests PASS

**Step 5: Run all Python tests to check no regressions**

```bash
cd python && python -m pytest tests/ -v
```
Expected: all tests PASS

**Step 6: Commit**

```bash
git add python/routers/data.py python/tests/test_osm_endpoint.py
git commit -m "feat: add POST /data/osm/extract endpoint"
```

---

### Task 3: Frontend API function + i18n strings

**Files:**
- Modify: `src/renderer/src/services/api.ts`
- Modify: `src/renderer/src/locales/zh.json`
- Modify: `src/renderer/src/locales/en.json`

**Step 1: Add `osmExtract` to `api.ts`**

Append to the end of `src/renderer/src/services/api.ts`:

```typescript
// ---------------------------------------------------------------------------
// OSM Feature Extraction
// ---------------------------------------------------------------------------

export async function osmExtract(lat: number, lon: number): Promise<GeoJSON.FeatureCollection> {
  return postJson('/data/osm/extract', { lat, lon })
}
```

**Step 2: Add i18n keys to `zh.json`**

Add an `"osm"` key at the top level of `src/renderer/src/locales/zh.json`, inside the outer `{}`:

```json
"osm": {
  "menuItem": "OSM 要素提取",
  "modalTitle": "OSM Feature Extraction",
  "loading": "正在查询 Overpass API...",
  "noFeatures": "未找到要素，请尝试其他位置",
  "colName": "名称",
  "colType": "类型",
  "colGeom": "几何",
  "importSelected": "导入选中项",
  "layerNamePrefix": "OSM 提取 @",
  "importSuccess": "已导入 OSM 要素：{name}（{count} 个要素）",
  "errorTitle": "查询失败"
}
```

**Step 3: Add i18n keys to `en.json`**

Add the same `"osm"` key to `src/renderer/src/locales/en.json`:

```json
"osm": {
  "menuItem": "OSM Feature Extraction",
  "modalTitle": "OSM Feature Extraction",
  "loading": "Querying Overpass API...",
  "noFeatures": "No features found. Try another location.",
  "colName": "Name",
  "colType": "Type",
  "colGeom": "Geometry",
  "importSelected": "Import Selected",
  "layerNamePrefix": "OSM Extract @",
  "importSuccess": "Imported OSM features: {name} ({count} features)",
  "errorTitle": "Query Failed"
}
```

**Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

**Step 5: Commit**

```bash
git add src/renderer/src/services/api.ts src/renderer/src/locales/zh.json src/renderer/src/locales/en.json
git commit -m "feat: add osmExtract API function and i18n strings"
```

---

### Task 4: `MapContextMenu` component

**Files:**
- Create: `src/renderer/src/components/MapCanvas/MapContextMenu.tsx`

**Step 1: Create the component**

```typescript
// src/renderer/src/components/MapCanvas/MapContextMenu.tsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface ContextMenuPos {
  x: number
  y: number
  lngLat: [number, number]
}

interface Props {
  pos: ContextMenuPos | null
  onExtract: (lngLat: [number, number]) => void
  onClose: () => void
}

export default function MapContextMenu({ pos, onExtract, onClose }: Props) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pos, onClose])

  if (!pos) return null

  // Keep menu within viewport
  const menuWidth = 180
  const menuHeight = 40
  const left = pos.x + menuWidth > window.innerWidth ? pos.x - menuWidth : pos.x
  const top = pos.y + menuHeight > window.innerHeight ? pos.y - menuHeight : pos.y

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        top,
        background: '#fff',
        border: '1px solid #e8e8e8',
        borderRadius: 6,
        boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
        zIndex: 1000,
        minWidth: menuWidth,
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          padding: '6px 14px',
          cursor: 'pointer',
          fontSize: 13,
          color: '#333',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = '#f5f5f5')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
        onClick={() => {
          onClose()
          onExtract(pos.lngLat)
        }}
      >
        {t('osm.menuItem')}
      </div>
    </div>
  )
}
```

**Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

**Step 3: Commit**

```bash
git add src/renderer/src/components/MapCanvas/MapContextMenu.tsx
git commit -m "feat: add MapContextMenu component"
```

---

### Task 5: `OsmExtractModal` component

**Files:**
- Create: `src/renderer/src/components/OsmExtract/OsmExtractModal.tsx`

**Step 1: Create the component**

```typescript
// src/renderer/src/components/OsmExtract/OsmExtractModal.tsx
import { useState, useEffect } from 'react'
import { Modal, Table, Spin, Alert, Button, Tag, Space } from 'antd'
import type { TableProps } from 'antd'
import { useTranslation } from 'react-i18next'
import { osmExtract } from '../../services/api'

interface OsmFeature {
  key: string
  label: string
  geomType: string
  feature: GeoJSON.Feature
}

interface Props {
  open: boolean
  lngLat: [number, number] | null
  onClose: () => void
  onImport: (fc: GeoJSON.FeatureCollection, name: string) => void
}

export default function OsmExtractModal({ open, lngLat, onClose, onImport }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OsmFeature[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  useEffect(() => {
    if (!open || !lngLat) return
    setLoading(true)
    setError(null)
    setRows([])
    setSelectedKeys([])

    osmExtract(lngLat[1], lngLat[0])
      .then((fc) => {
        const items: OsmFeature[] = fc.features.map((f, i) => ({
          key: `${f.properties?._osm_type}-${f.properties?._osm_id}-${i}`,
          label: f.properties?._feature_label ?? t('osm.colName'),
          geomType: f.geometry.type,
          feature: f,
        }))
        setRows(items)
        setSelectedKeys(items.map((r) => r.key))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, lngLat]) // eslint-disable-line react-hooks/exhaustive-deps

  const columns: TableProps<OsmFeature>['columns'] = [
    {
      title: t('osm.colName'),
      dataIndex: 'label',
      ellipsis: true,
    },
    {
      title: t('osm.colGeom'),
      dataIndex: 'geomType',
      width: 110,
      render: (v: string) => {
        const color = v === 'Polygon' ? 'blue' : v === 'LineString' ? 'green' : 'orange'
        return <Tag color={color}>{v}</Tag>
      },
    },
  ]

  const handleImport = () => {
    const selected = rows.filter((r) => selectedKeys.includes(r.key)).map((r) => r.feature)
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: selected }
    const coords = lngLat ? `${lngLat[1].toFixed(4)},${lngLat[0].toFixed(4)}` : ''
    const name = `${t('osm.layerNamePrefix')} ${coords}`
    onImport(fc, name)
    onClose()
  }

  const footer = (
    <Space>
      <Button onClick={onClose}>{t('settings.save') === '保存' ? '取消' : 'Cancel'}</Button>
      <Button
        type="primary"
        disabled={selectedKeys.length === 0 || loading}
        onClick={handleImport}
      >
        {t('osm.importSelected')} ({selectedKeys.length})
      </Button>
    </Space>
  )

  return (
    <Modal
      title={t('osm.modalTitle')}
      open={open}
      onCancel={onClose}
      footer={footer}
      width={520}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#888', fontSize: 13 }}>{t('osm.loading')}</div>
        </div>
      )}
      {!loading && error && (
        <Alert type="error" message={t('osm.errorTitle')} description={error} showIcon />
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>
          {t('osm.noFeatures')}
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <Table
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys as string[]),
          }}
          columns={columns}
          dataSource={rows}
          size="small"
          pagination={false}
          scroll={{ y: 320 }}
        />
      )}
    </Modal>
  )
}
```

**Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

**Step 3: Commit**

```bash
git add src/renderer/src/components/OsmExtract/OsmExtractModal.tsx
git commit -m "feat: add OsmExtractModal component"
```

---

### Task 6: Wire up MapCanvas and App.tsx

**Files:**
- Modify: `src/renderer/src/components/MapCanvas/MapCanvas.tsx`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Update `MapCanvas.tsx`**

Add the import at the top (after existing imports):
```typescript
import MapContextMenu, { type ContextMenuPos } from './MapContextMenu'
```

Add state inside the component (after existing `const setSelectedLayer = ...` line):
```typescript
const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPos | null>(null)
```

Add `useState` to the React import at line 1:
```typescript
import { useEffect, useRef, useState } from 'react'
```

Add the `onOsmExtract` prop to the `Props` interface:
```typescript
interface Props {
  onSave?: () => void
  onOsmExtract?: (lngLat: [number, number]) => void
}
```

Update the function signature to destructure the new prop:
```typescript
export default function MapCanvas({ onSave, onOsmExtract }: Props) {
```

Add a context menu handler. Add this function inside the component, after the `renderLayers` function:
```typescript
const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
  e.preventDefault()
  if (drawModeRef.current !== 'off') return
  const map = mapRef.current
  if (!map) return
  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const lngLat = map.unproject([px, py])
  setContextMenuPos({ x: e.clientX, y: e.clientY, lngLat: [lngLat.lng, lngLat.lat] })
}
```

Update the return JSX — change the outer `<div>` to add `onContextMenu`:
```typescript
<div
  style={{ width: '100%', height: '100%', position: 'relative' }}
  onContextMenu={handleContextMenu}
>
```

Add `<MapContextMenu>` just before `<DrawHintBanner />`:
```typescript
<MapContextMenu
  pos={contextMenuPos}
  onExtract={(lngLat) => onOsmExtract?.(lngLat)}
  onClose={() => setContextMenuPos(null)}
/>
```

**Step 2: Update `App.tsx`**

Add the new state after `const [wfsOpen, setWfsOpen] = useState(false)`:
```typescript
const [osmExtractOpen, setOsmExtractOpen] = useState(false)
const [osmExtractLngLat, setOsmExtractLngLat] = useState<[number, number] | null>(null)
```

Add the import at the top of App.tsx (after the WFSModal import):
```typescript
import OsmExtractModal from './components/OsmExtract/OsmExtractModal'
```

Update the `<MapCanvas>` tag to add the new prop:
```typescript
<MapCanvas
  onSave={() => handleDrawModeChange('off')}
  onOsmExtract={(lngLat) => {
    setOsmExtractLngLat(lngLat)
    setOsmExtractOpen(true)
  }}
/>
```

Add the `<OsmExtractModal>` just before the closing `</Layout>` tag (alongside the other modals):
```typescript
<OsmExtractModal
  open={osmExtractOpen}
  lngLat={osmExtractLngLat}
  onClose={() => setOsmExtractOpen(false)}
  onImport={(geojson, name) => {
    const id = nanoid()
    addLayer({ id, name, type: 'geojson', source: geojson, visible: true, opacity: 1 })
    setSelectedLayer(id)
    const bounds = getGeoJSONBounds(geojson)
    if (bounds) requestFitBounds(bounds)
    message.success(`已导入：${name}（${geojson.features.length} 个要素）`)
  }}
/>
```

**Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: no errors

**Step 4: Commit**

```bash
git add src/renderer/src/components/MapCanvas/MapCanvas.tsx src/renderer/src/App.tsx
git commit -m "feat: wire up OSM feature extraction context menu and modal"
```

---

### Task 7: Manual smoke test

**Step 1: Start the app**

```bash
npm run dev
```

**Step 2: Verify the context menu**
1. Right-click anywhere on the map → should see a small menu with "OSM 要素提取"
2. Right-click while in draw mode (point/line/polygon) → menu should NOT appear
3. Left-click elsewhere → menu should close

**Step 3: Verify the extraction flow**
1. Navigate to a city area (zoom in to level 14+)
2. Right-click on a building or road → click "OSM 要素提取"
3. Modal opens with spinner
4. After a few seconds: feature list appears with checkboxes, labels, geometry type tags
5. All rows are pre-selected; deselect some
6. Click "导入选中项 (N)"
7. New layer appears in LayerPanel; map flies to the layer bounds
8. Layer features render in blue; clicking a feature selects the layer (orange)

**Step 4: Verify error handling**
- Disconnect network → right-click → extract → modal shows error message

**Step 5: Run all Python tests one final time**

```bash
cd python && python -m pytest tests/ -v
```
Expected: all tests PASS
