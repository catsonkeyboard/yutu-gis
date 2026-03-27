# Drawing Tools Design — YutuGIS

**Date:** 2026-03-26
**Feature:** Point / Line / Fence (Polygon) drawing, save as layer, export GeoJSON

---

## Requirements

- Draw points, lines, and polygons directly on the map
- While drawing, show a contextual hint banner on the map
- On draw tool exit: if features exist, prompt user to name and save as a new layer
- Export any layer as GeoJSON from both the toolbar and the layer panel

---

## Approach

Use `@mapbox/mapbox-gl-draw` (v1.5.1) — the most mature drawing library compatible with MapLibre GL v5. Covers all three geometry types with built-in interaction (click, double-click to finish, Escape to cancel). Default UI hidden; toolbar drives mode switching.

---

## Architecture

### New dependency

```
@mapbox/mapbox-gl-draw  ^1.5.1
```

### New files

| File | Purpose |
|------|---------|
| `src/renderer/src/stores/drawStore.ts` | Zustand store for draw mode + temporary features |
| `src/renderer/src/components/MapCanvas/DrawHintBanner.tsx` | In-map hint bar driven by draw mode |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/src/components/MapCanvas/MapCanvas.tsx` | Initialize MapboxDraw, wire draw events → drawStore |
| `src/renderer/src/components/Toolbar/Toolbar.tsx` | Add point/line/polygon draw buttons |
| `src/renderer/src/components/LayerPanel/LayerPanel.tsx` | Add per-layer export button |
| `src/renderer/src/App.tsx` | Pass draw mode callbacks to Toolbar; handle save modal; handle export |

---

## drawStore

```ts
type DrawMode = 'off' | 'point' | 'line' | 'polygon'

interface DrawState {
  drawMode: DrawMode
  features: GeoJSON.Feature[]
  setMode: (mode: DrawMode) => void
  setFeatures: (features: GeoJSON.Feature[]) => void
  clear: () => void
}
```

- `drawMode` drives toolbar button highlight and hint banner visibility
- `features` is temporary — not in `layerStore` until user confirms save
- The `MapboxDraw` instance is stored in a React ref inside `MapCanvas`, not in the store

---

## Toolbar

Three new draw buttons added after existing buttons, separated by `Divider`:

| Button | Icon | Draw mode |
|--------|------|-----------|
| 绘制点 | `EnvironmentOutlined` | `draw_point` |
| 绘制线 | `EditOutlined` | `draw_line_string` |
| 绘制围栏 | `BorderOutlined` | `draw_polygon` |

- Active button shown with `type="primary"`
- Clicking the active button again exits draw mode

New prop added to Toolbar: `onDraw: (mode: DrawMode) => void`

---

## MapCanvas

- On mount: initialize `MapboxDraw({ controls: false })` and add to map
- Store draw instance in `drawRef`
- Listen to `draw.create` / `draw.update` / `draw.delete` → call `drawStore.setFeatures(draw.getAll().features)`
- Export `setDrawMode(mode)` function via callback prop so App can trigger mode changes
- Render `<DrawHintBanner />` as absolute-positioned overlay

### DrawHintBanner

Shown only when `drawMode !== 'off'`. Content:

| Mode | Text |
|------|------|
| `point` | 点击地图添加点 |
| `line` | 点击添加节点，双击完成绘制 |
| `polygon` | 点击添加顶点，点击起点或双击完成围栏 |

---

## Save Flow (on draw tool exit)

1. User clicks active draw button → triggers exit
2. Check `drawStore.features.length > 0`
3. If yes: show Ant Design `Modal` with name input (default: `绘制图层 YYYY-MM-DD HH:mm`)
   - Confirm → `layerStore.addLayer({ type: 'geojson', source: FeatureCollection })` + `drawStore.clear()` + `draw.deleteAll()`
   - Cancel → keep features, stay in current mode
4. If no features: exit silently, clear draw state

---

## Export GeoJSON

Both paths use Electron IPC to write the file (avoids CSP/Blob URL issues):

```ts
const path = await window.electronAPI.saveFileDialog([{ name: 'GeoJSON', extensions: ['geojson'] }])
if (path) {
  const content = JSON.stringify(layer.source, null, 2)
  await window.electronAPI.writeFile(path, content)
}
```

> Note: `writeFile` IPC handler needs to be added to `src/main/ipc.ts` and exposed via preload.

**Toolbar export button** — exports currently selected layer (`selectedLayerId`).
**Layer panel export button** — `DownloadOutlined` icon per layer item, exports that specific layer.

---

## Data Flow

```
Toolbar (draw button click)
  → App.handleDrawMode(mode)
    → MapCanvas.setDrawMode(mode)   [via ref callback]
      → MapboxDraw.changeMode()
      → drawStore.setMode(mode)
    → DrawHintBanner updates

MapboxDraw events (create/update/delete)
  → drawStore.setFeatures()

Toolbar (active button click again)
  → App.handleDrawMode('off')
    → if drawStore.features.length > 0 → show SaveModal
      → confirm → layerStore.addLayer() + drawStore.clear()
      → cancel  → restore previous draw mode
    → else → drawStore.setMode('off')
```
