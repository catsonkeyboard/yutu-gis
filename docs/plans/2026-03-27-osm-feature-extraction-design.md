# OSM Feature Extraction — Design

**Date:** 2026-03-27
**Status:** Shipped

## Overview

Allow users to right-click anywhere on the map, invoke "OSM 要素提取" from a context menu, preview the OSM features found within the current map viewport, filter by category and sub-type, select which ones to import, and add them as a new GeoJSON layer.

## Data Flow (as shipped)

```
Right-click on map (drawMode must be 'off')
  → MapCanvas.handleContextMenu
      → map.getBounds() → ContextMenuPos { x, y, bounds: [south,west,north,east] }
  → MapContextMenu renders at cursor (position:fixed)
  → Click "OSM 要素提取"
  → App.tsx: setOsmExtractBounds(bounds), setOsmExtractOpen(true)
  → OsmExtractModal opens → POST /data/osm/extract { south, west, north, east }
      → python/services/osm.py: Overpass QL [bbox:s,w,n,e]
      → multi-endpoint retry (overpass-api.de → kumi.systems → private.coffee)
      → GeoJSON FeatureCollection with _osm_id, _osm_type, _feature_label per feature
  → Two-level filter bar → user selects rows → "导入选中项"
  → App.tsx onImport → addLayer (same pattern as file import / WFS import)
```

## Key Decisions Made During Implementation

### Viewport bbox instead of click-point radius
Initial design used `is_in(lat,lon)` + `around:30` queries centered on the click point. Changed to `[bbox:south,west,north,east]` global filter to restrict results to what's visible on screen, avoiding unexpectedly large result sets.

### Multi-endpoint Overpass retry
The primary `overpass-api.de` endpoint frequently returns 504 under load. The service tries three public endpoints in sequence; first success wins. All share the same `httpx.AsyncClient` connection.

### Two-level filter in modal
Category filter (Level 1) maps to OSM tag keys (`building`, `highway`, `aeroway`, …). Sub-category filter (Level 2) maps to the tag *value* (`taxiway`, `runway`, `primary`, …). Level 2 only appears when the selected category has more than one sub-type present. Clicking any tag auto-selects all matching rows.

### `ContextMenuPos.bounds` not `lngLat`
The context menu captures the full viewport bounds at right-click time (not the clicked coordinates), since the Overpass query operates on the bbox, not a point.

## Backend

### `POST /data/osm/extract`
**File:** `python/routers/data.py`

**Request:**
```json
{ "south": float, "west": float, "north": float, "east": float }
```

**Overpass QL:**
```
[out:json][timeout:25][bbox:south,west,north,east];
(
  way[building]; way[highway]; way[landuse]; way[amenity];
  way[leisure]; way[natural]; way[aeroway];
  relation[building]; relation[landuse];
  node[amenity][name]; node[shop][name]; node[tourism][name];
);
out geom qt;
```

**Response:** GeoJSON FeatureCollection. Each feature's `properties` includes:
- `_osm_id` — OSM element ID
- `_osm_type` — `way` / `relation` / `node`
- `_feature_label` — e.g. "建筑 - 海口美兰国际机场", "航空 (taxiway)"

**File:** `python/services/osm.py`
- `overpass_extract(south, west, north, east)` — main entry point
- `_way_to_geometry(nodes)` — closed way → Polygon, open way → LineString
- `_feature_label(tags)` — maps tag keys to Chinese labels
- `OVERPASS_ENDPOINTS` — three public endpoints tried in order
- `TIMEOUT = 35.0` / query `[timeout:25]`

## Frontend

### `MapContextMenu` (`src/renderer/src/components/MapCanvas/MapContextMenu.tsx`)
```ts
export interface ContextMenuPos {
  x: number
  y: number
  bounds: [number, number, number, number] // [south, west, north, east]
}
```
- `position: fixed` at cursor; viewport-clamped to stay on screen
- Calls `onExtract(bounds)` when menu item clicked
- Dismissed on any outside `mousedown`
- Disabled when `drawModeRef.current !== 'off'`

### `OsmExtractModal` (`src/renderer/src/components/OsmExtract/OsmExtractModal.tsx`)
- Props: `open`, `bounds`, `onClose`, `onImport`
- On open: calls `osmExtract(s, w, n, e)` → loading → table
- Two-level filter:
  - Level 1 (blue): `全部` + categories derived from `TAG_KEYS` order
  - Level 2 (geekblue): sub-types by tag value, sorted by count desc; hidden if ≤1 sub-type
- `getCategory(props)` scans `TAG_KEYS = ['building','highway','landuse','amenity','leisure','natural','aeroway']`
- `getSubCategory(props, category)` returns tag value; `'yes'` for generic tags
- Clicking a tag sets `activeCategory`/`activeSubCategory` and auto-selects matching rows
- Checkbox state is independent — manual adjustments persist across filter changes

### `MapCanvas.tsx` changes
- Added `onContextMenu={handleContextMenu}` on outer container div
- `handleContextMenu`: prevents default, guards draw mode, calls `map.getBounds()`, sets `contextMenuPos`
- New prop: `onOsmExtract?: (bounds: [number,number,number,number]) => void`

### `App.tsx` changes
- State: `osmExtractOpen`, `osmExtractBounds`
- `onOsmExtract` callback sets both and opens modal
- `onImport` callback: `addLayer` → `setSelectedLayer` → `requestFitBounds` → `message.success`

### `api.ts`
```ts
osmExtract(south, west, north, east): Promise<GeoJSON.FeatureCollection>
// POST /data/osm/extract { south, west, north, east }
```

## i18n Keys Added (`osm.*`, `common.*`)
```json
"osm": {
  "menuItem", "modalTitle", "loading", "noFeatures",
  "colName", "colGeom", "importSelected",
  "layerNamePrefix",   // "OSM 提取" / "OSM Extract"
  "importSuccess",     // uses {{name}} and {{count}} interpolation
  "errorTitle"
},
"common": { "cancel" }
```

## Tests
- `python/tests/test_osm_service.py` — 7 unit tests for `_way_to_geometry`, `_feature_label`, `overpass_extract` (mocked), deduplication
- `python/tests/test_osm_endpoint.py` — 2 integration tests: success + error propagation
