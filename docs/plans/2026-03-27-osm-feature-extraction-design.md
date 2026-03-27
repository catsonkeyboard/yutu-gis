# OSM Feature Extraction — Design

**Date:** 2026-03-27
**Status:** Approved

## Overview

Allow users to right-click anywhere on the map, invoke "OSM Feature Extraction" from a context menu, preview the OSM features found at that location, select which ones to import, and add them as a new GeoJSON layer.

## Data Flow

```
Right-click on map
  → MapCanvas contextmenu event → store { x, y, lngLat }
  → Show MapContextMenu at cursor position
  → Click "OSM Feature Extraction"
  → POST /data/osm/extract { lat, lon }
      → Python: query Overpass API (is_in + around:30)
      → Return GeoJSON FeatureCollection with _feature_label per feature
  → Open OsmExtractModal (loading → feature list)
  → User checks features → "导入选中项"
  → addLayer (same pattern as existing imports)
```

## Backend

### New endpoint: `POST /data/osm/extract`

**File:** `python/routers/data.py`

**Request:** `{ lat: float, lon: float }`

**Overpass QL strategy (two-pass):**
1. `is_in(lat,lon)` — find areas containing the point (campus, park, landuse polygons)
2. `way/node(around:30,lat,lon)` — find features within 30 m (buildings, roads, POIs)

**Response:** GeoJSON FeatureCollection. Each feature's `properties` includes:
- `_osm_id` — OSM element ID
- `_osm_type` — `way` / `relation` / `node`
- `_feature_label` — human-readable label, e.g. "建筑", "道路 - 琼文大道", "土地利用 - 学校"

**File:** `python/services/osm.py` (new)
Contains `overpass_extract(lat, lon)` — builds QL query, calls Overpass API via httpx (verify=False, reuse SOCKS-proxy-capable client), converts response to GeoJSON.

## Frontend

### `MapContextMenu` component (new)

**File:** `src/renderer/src/components/MapCanvas/MapContextMenu.tsx`

- Rendered inside `MapCanvas`'s container div
- Positioned with `position: fixed` at cursor `{ x, y }`
- Triggered by `contextmenu` DOM event on the map container (not map event), so both DOM coords and `lngLat` are available
- Disabled when `drawModeRef.current !== 'off'`
- Closes on any outside click or menu item click
- Props: `pos: { x, y, lngLat } | null`, `onExtract(lngLat)`, `onClose()`

### `OsmExtractModal` component (new)

**File:** `src/renderer/src/components/OsmExtract/OsmExtractModal.tsx`

- Opens immediately with loading spinner
- On load: calls `POST /data/osm/extract` via new `api.ts` function `osmExtract(lat, lon)`
- Shows Ant Design `Table` with columns: checkbox | feature name | type label | geometry type badge
- Select-all / deselect-all controls
- "导入选中项" button: merges selected features into one FeatureCollection → `addLayer`
- Default layer name: `OSM 提取 @ {lat.toFixed(4)},{lng.toFixed(4)}`
- Error state: shows error message inline

### `api.ts` addition

```ts
export async function osmExtract(lat: number, lon: number): Promise<GeoJSON.FeatureCollection>
// POST /data/osm/extract { lat, lon }
```

### `MapCanvas.tsx` changes

- Add state: `contextMenuPos: { x: number; y: number; lngLat: [number, number] } | null`
- Add `contextmenu` listener on the container div (via `onContextMenu` React prop)
- Render `<MapContextMenu>` and `<OsmExtractModal>` inside the return JSX

### `App.tsx` changes

- None required — `OsmExtractModal` manages its own state and calls `addLayer` directly via `useLayerStore`

## i18n

Add keys to both `zh.json` and `en.json`:
- `osm.extractTitle` — "OSM Feature Extraction" / "OSM 要素提取"
- `osm.loading` — "正在查询..." / "Querying..."
- `osm.noFeatures` — "未找到要素" / "No features found"
- `osm.importSelected` — "导入选中项" / "Import Selected"
- `osm.layerNamePrefix` — "OSM 提取 @" / "OSM Extract @"
- `osm.featureTypes.*` — building, highway, landuse, amenity labels

## Error Handling

- Network timeout (Overpass): show error in modal, allow retry
- No features found: show empty state with message, no import button
- Partial conversion errors: skip bad features, import the rest
