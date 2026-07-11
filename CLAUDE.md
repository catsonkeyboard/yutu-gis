# YutuGIS 舆图 — Project Guide for Claude

## Project Overview

**YutuGIS 舆图** — Professional GIS desktop application for GIS analysts. Built with Electron + React + Python FastAPI.

**Target user:** Professional GIS analysts who need to load, view, and analyze spatial data.

---

## Architecture

```
Electron Main Process
  ├── src/main/index.ts       — window creation, IPC wiring, app lifecycle
  ├── src/main/config.ts      — load/save ~/.yutugis/config.json (cross-platform)
  ├── src/main/python.ts      — spawns/stops Python subprocess, port discovery
  ├── src/main/menu.ts        — native menus (File / Edit / View / Help)
  └── src/main/ipc.ts         — IPC handlers (readFile, openFileDialog, saveFileDialog,
                                config:load, config:save)

Preload
  └── src/preload/index.ts    — contextBridge: electronAPI (getPythonPort, readFile,
                                writeFile, openFileDialog, saveFileDialog,
                                loadConfig, saveConfig, onMenuAction)

Renderer (React)
  ├── src/renderer/src/App.tsx          — root component; loads config on mount
  ├── components/
  │   ├── MapCanvas/          — MapLibre GL map, tile provider switching, layer rendering,
  │   │   │                     MapboxDraw integration, map-click layer selection,
  │   │   │                     right-click context menu (OSM extraction)
  │   │   └── MapContextMenu.tsx — floating right-click menu; captures map viewport bounds
  │   ├── OsmExtract/
  │   │   └── OsmExtractPanel.tsx — floating panel: Overpass query, two-level filter, import
  │   ├── LayerPanel/         — layer list, visibility, selection, delete, auto-scroll
  │   ├── Toolbar/            — toolbar buttons (import, WFS, draw modes, settings)
  │   ├── WFS/WFSModal.tsx    — WFS/OGC API connection and multi-layer import
  │   ├── Settings/           — language + API key settings (saves to config file)
  │   └── StatusBar/          — coordinates, zoom
  ├── stores/
  │   ├── layerStore.ts       — layers[], selectedLayerId, appendFeatures()
  │   ├── mapStore.ts         — center, zoom, provider, fitBoundsRequest
  │   ├── drawStore.ts        — drawMode ('off'|'point'|'line'|'polygon'), features[]
  │   └── settingsStore.ts    — language, apiKeys (runtime state; initialized from
  │                             config file on startup, NOT persisted to localStorage)
  ├── services/api.ts         — fetch wrappers to Python backend
  └── utils/
      ├── geo.ts              — getGeoJSONBounds()
      └── coordTransform.ts   — WGS-84 → GCJ-02 conversion (for Amap)

Python Backend (FastAPI)
  ├── python/main.py          — FastAPI app, CORS, routers
  ├── python/routers/data.py  — /data/import, /data/wfs/*, /data/ogc/*, /data/osm/extract
  └── python/services/
      ├── gis.py              — file_to_geojson() via fiona
      ├── wfs.py              — WFS 1.x/2.x + OGC API Features via httpx
      └── osm.py              — overpass_extract(south,west,north,east); multi-endpoint retry
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 39, electron-vite 5 |
| Frontend | React 19, TypeScript 5 |
| UI | Ant Design 6, @ant-design/icons |
| Map | MapLibre GL JS v5 |
| Draw | @mapbox/mapbox-gl-draw |
| State | Zustand 5 (layerStore, mapStore, drawStore, settingsStore) |
| i18n | react-i18next, locales in `src/renderer/src/locales/` |
| Backend | Python 3.12, FastAPI, uvicorn |
| GIS libs | fiona 1.10, shapely 2, pyproj 3 |
| HTTP client | httpx[socks] (SOCKS proxy support required) |
| Python env | uv + Python 3.12 (`.venv` inside `python/`) |

---

## Development

```bash
# Install frontend deps
npm install

# Set up Python environment (first time)
cd python
uv venv --python 3.12
uv pip install -r requirements.txt

# Run in dev mode (starts Electron + Python)
npm run dev

# Typecheck
npm run typecheck

# Build for macOS
npm run build:mac
```

### Python executable path (dev mode)

`src/main/python.ts` computes the project root as:
```ts
path.join(__dirname, '..', '..')  // __dirname = out/main/ in compiled output
```
Python venv path: `<project_root>/python/.venv/bin/python3.12`

---

## Key Behaviors & Constraints

### User config file
`src/main/config.ts` manages `~/.yutugis/config.json` (created on first launch).
Structure:
```json
{ "language": "zh", "googleMap": { "apiKey": "" }, "amap": { "apiKey": "" },
  "openWeather": { "apiKey": "" }, "download": { "dir": "<home>/Downloads" } }
```
- `loadConfig()` merges file contents with `DEFAULT_CONFIG` — missing keys fall back to defaults.
- `saveConfig()` is called from `SettingsModal` when the user saves settings.
- On renderer startup (`App.tsx`), `window.electronAPI.loadConfig()` is called and the result is pushed into `settingsStore` via `setLanguage` / `setApiKeys` / `setDownloadDir`.
- `download.dir` is the default save location for map tile downloads (defaults to `~/Downloads`); `TilesDownloadModal` pre-fills `<dir>/tiles-<timestamp>[.mbtiles]` from it.
- **`settingsStore` has no `persist` middleware** — it is purely runtime state, initialized from the config file.

### File reading in renderer
**Never** use `fetch('file://')` in the renderer — CSP blocks it. Always route file reads through the main process IPC:
```ts
const buffer = await window.electronAPI.readFile(filePath)
```

### Clipboard shortcuts
The native Edit menu (`src/main/menu.ts`) with `role: 'cut'/'copy'/'paste'` entries is **required** for clipboard to work in any input. Do not remove it.

### Coordinate systems (Amap / 高德)
Amap tiles use **GCJ-02** (火星坐标系). GeoJSON data is WGS-84. When the active provider starts with `'amap'`, `MapCanvas.tsx` calls `convertToGcj02()` before adding GeoJSON sources to MapLibre. Do not skip this conversion or layers will appear offset ~100–700 m.

### fitBounds pattern
`mapStore` uses a `fitBoundsRequest: { bounds, timestamp }` object. Setting the same bounds twice requires a new timestamp — use `requestFitBounds(bounds)` which sets `timestamp: Date.now()` automatically.

### Python startup
`startPython()` is called before the window is created. It polls `GET /health` every 200ms (10s timeout) before resolving. The port is dynamically assigned (OS-assigned free port).

### SOCKS proxy
`httpx[socks]` must remain in `requirements.txt`. Without it, WFS/OGC requests fail on machines using SOCKS proxies. Do not remove it.

### WFS SSL
`httpx.AsyncClient(verify=False)` is intentional — many enterprise WFS servers use self-signed certificates.

### Drawing tools (MapboxDraw)
- `drawStore` holds `drawMode` and `features[]`. `drawMode` is set from the Toolbar.
- `MapCanvas` syncs `draw.getAll().features` into `drawStore` on every `draw.create/update/delete` event.
- When `drawMode` switches to `'off'` with features present, `App.tsx` opens the save modal.
- Save modal options: **append to current layer** (if a geojson layer is selected) or **create new layer**.
- `layerStore.appendFeatures(id, features)` merges drawn features into an existing layer's FeatureCollection.
- The `DrawHintBanner` floats over the map and shows a **完成并保存** button once `features.length > 0`.
- During draw mode, map-click layer selection is disabled (guarded by `drawModeRef.current`).

### Map-click layer selection
- `MapCanvas` registers a `click` handler that calls `map.queryRenderedFeatures` on all `user-*` layers.
- Layer ID format: `user-{layerId}-fill|line|point` — parse with `/^user-(.+)-(fill|line|point)$/`.
- On hit: `setSelectedLayer(layerId)`. This triggers `LayerPanel` to `scrollIntoView` the matching item.
- Selected layer features render in orange (`#ff7700`); others in blue (`#0080ff`).
- Color is updated via `map.setPaintProperty` (fast path) when `selectedLayerId` changes; `renderLayers` also applies the correct color on full re-render.
- Refs (`drawModeRef`, `selectedLayerIdRef`, `layersRef`, `providerRef`) keep event handlers current without re-registration.

---

## Tile Providers

| Provider key | Source | Coord system |
|---|---|---|
| `osm` | OpenStreetMap | WGS-84 |
| `google-street` | Google Maps tiles | WGS-84 |
| `google-satellite` | Google satellite | WGS-84 |
| `amap-street` | 高德街道图 | GCJ-02 → needs conversion |
| `amap-satellite` | 高德影像图 | GCJ-02 → needs conversion |
| `amap-terrain` | 高德地形图 | GCJ-02 → needs conversion |

Google and Amap API keys are optional — public endpoints are used when no key is set. Keys are stored in `~/.yutugis/config.json`, never in source code or localStorage.

---

## Supported GIS Formats (import)

GeoJSON, JSON, SHP (Shapefile), KML, GPX — handled by `fiona` in the Python backend. The file is read by the main process (`fs.readFile`), sent to Python as multipart form data, and returned as a GeoJSON FeatureCollection.

**OSM PBF** (`.osm.pbf` / `.pbf`, e.g. Geofabrik extracts) — parsed by `pyosmium`
in `python/services/pbf.py` via `POST /data/import/pbf { path }` (read directly
from disk, NOT uploaded — extracts are large). Tagged nodes → Point, linear
ways → LineString, closed area ways + multipolygon relations → MultiPolygon
(osmium area assembler; closed `highway` rings stay lines). Grouped into up to
three layers (点/线/面), reusing `_feature_label` from osm.py. Hard cap
`MAX_FEATURES = 100,000` — parsing stops there and the response is flagged
`truncated`, surfaced as a UI warning. Requires `osmium>=4.0` in requirements.

---

## WFS / OGC API Features

- **WFS 1.x / 2.x**: GetCapabilities → GetFeature with `OUTPUTFORMAT=application/json`
- **OGC API Features**: `/collections` → `/collections/{id}/items`
- Multi-select: each selected layer/collection generates an independent map layer
- Import runs sequentially with progress bar; partial failures are shown without aborting remaining items

---

## OSM Feature Extraction

Toolbar ThunderboltOutlined button (or right-click → "OSM 要素提取") toggles a
**floating panel** (top-right, NOT a modal) → pick the area (drag-select /
viewport / numbers) → 提取要素 queries Overpass → preview + filter → import.

### Data flow
```
Toolbar button → osmPanelStore.setOpen(true)
  (right-click menu item also opens it, pre-setting bbox to the viewport;
   the tiles-download and OSM panels are mutually exclusive — opening one
   closes the other, both live at top-right)
  → OsmExtractPanel (floating; bbox via shared BboxSelector + green dashed
    overlay from useMapBboxSelect)
  → 提取要素 → POST /data/osm/extract { south, west, north, east }
      → python/services/osm.py: overpass_extract() → Overpass QL [bbox:s,w,n,e]
      → returns GeoJSON FeatureCollection
  → two-level filter → import selected (单图层 / 按子类型拆分) → addLayer
```

### `ContextMenuPos` (MapContextMenu.tsx)
```ts
{ x: number; y: number; bounds: [number, number, number, number] } // [south,west,north,east]
```
`bounds` is captured at right-click time from `map.getBounds()`. The menu is disabled during draw mode.

### Python service (`python/services/osm.py`)
- `overpass_extract(south, west, north, east)` — builds Overpass QL with `[bbox:s,w,n,e]` global filter
- Queries: `way[building|highway|landuse|amenity|leisure|natural|aeroway]`, `relation[building|landuse]`, named nodes
- Deduplicates by `(type, id)`; converts ways (closed→Polygon, open→LineString), nodes→Point, relations→outer ring Polygon
- `_feature_label(tags)` maps OSM tags → Chinese labels: 建筑/道路/土地利用/设施/休闲/自然/航空
- Multi-endpoint retry: `overpass-api.de` → `overpass.kumi.systems` → `overpass.private.coffee`; timeout 35 s / query 25 s

### `OsmExtractPanel` (src/renderer/src/components/OsmExtract/OsmExtractPanel.tsx)
- Two-level filter bar:
  - **Level 1** (blue tags): category — 全部 / 建筑 / 道路 / 航空 / …  (only categories present in results)
  - **Level 2** (geekblue tags): sub-type — `taxiway` / `runway` / `primary` / … (tag value; hidden when only one sub-type)
- Clicking any tag auto-selects all matching rows; checkboxes remain manually adjustable
- `getCategory(props)` checks `TAG_KEYS` in order; `getSubCategory(props, category)` returns the tag value

### `api.ts`
```ts
osmExtract(south, west, north, east): Promise<GeoJSON.FeatureCollection>
// POST /data/osm/extract { south, west, north, east }
```

### Pitfall: Overpass 504
The public `overpass-api.de` endpoint frequently returns 504 under load. The service automatically retries the next endpoint. If all three fail, the modal shows the last error. Zooming in before extracting reduces query size.

---

## Map Tiles Download

Toolbar download button (or right-click → "下载地图瓦片") toggles a **floating
panel** (top-right over the map, NOT a modal) → the map stays interactive:
drag-select the area, pan/zoom, and tweak params at the same time.

### Data flow
```
Toolbar DownloadOutlined button → tilesPanelStore.setOpen(true)
  (right-click menu item also opens it, pre-setting bbox to the viewport)
  → TilesDownloadPanel (floating; bbox from drag-select "框选范围" /
    current viewport "当前视图" / editable numbers; zoom slider, source,
    output format; bbox drawn on map as dashed-blue rectangle overlay)
  → POST /tiles/download { south, west, north, east, min_zoom, max_zoom,
                           url_template, output: 'mbtiles'|'directory', path, name }
      → python/services/tile_tasks.py: asyncio engine, 6 concurrent workers,
        2 retries per tile, browser-like UA headers
      → python/services/tiles.py: MBTilesWriter (sqlite3, TMS y-inversion)
        or DirectoryWriter ({z}/{x}/{y}.<ext> + metadata.json)
  → renderer polls GET /tiles/tasks/{id} every 500 ms → Progress bar
  → POST /tiles/tasks/{id}/cancel to cancel (already-written tiles are kept)
```

### Key behaviors
- Tile count hard limit: 200,000 per request (MAX_TILES in routers/tiles.py,
  mirrored in TilesDownloadPanel.tsx); UI warns above 10,000.
- Panel state lives in tilesPanelStore (open, bbox, selecting). During
  drag-select the panel disables map dragPan; `selectEndAt` lets MapCanvas's
  click handler ignore the click fired right after selection mouseup.
- Resume: re-running against the same .mbtiles file / directory skips existing
  tiles (`has_tile` dedup) — cancel + restart is safe.
- URL templates come from tileProviders.ts `getTileUrlTemplate()` or a custom
  `{z}/{x}/{y}` template typed by the user. Only XYZ placeholders supported
  (no quadkey).
- Amap tiles are GCJ-02 grid tiles downloaded as-is — no coordinate conversion
  is involved in tile download.
- Tile image format (png/jpg/webp) is sniffed from magic bytes, not headers.

### Offline map import (load downloaded tiles as layers)
The regular import flow (toolbar 导入 button / File menu) accepts offline maps
alongside GIS files: pick a `.mbtiles` file, or pick the `metadata.json`
inside a z/x/y tile directory (the parent directory is registered)
→ `POST /tiles/sources { path }` registers it in
python/services/tile_sources.py (in-memory registry; metadata read from the
MBTiles metadata table or metadata.json, with fallbacks for foreign files)
→ renderer adds a `type: 'raster'` layer whose source is
`GET /tiles/sources/{id}/{z}/{x}/{y}` on the local Python backend
(MBTiles rows are TMS — y is inverted on read).
- Raster layers render below geojson layers in renderLayers; opacity works
  via `raster-opacity`; LayerPanel zoom-to-layer uses the source bounds.
- Registration is idempotent (source_id = sha1(abspath)[:12]).
- GCJ-02 caveat: tiles downloaded from Amap only align when overlaid on an
  Amap basemap; on OSM/Google basemaps they appear offset (~100-700 m).

---

## Data Monitoring 数据监控

Toolbar FundOutlined button → Popover panel (controlled, stays open while
toggling) with checkboxes for live overlays. Badge dot + primary button state
while any overlay is active. State in `monitorStore` (runtime only).

| Overlay | Source | Key | Rendering |
|---|---|---|---|
| 降水雷达 | RainViewer `GET /monitor/rainviewer` → latest frame tile template | none | raster |
| 降水/温度/云量/风场/气压 | OpenWeatherMap `tile.openweathermap.org/map/{layer}/…?appid=KEY` (URL built in renderer, `getOwmTileTemplate`) | `openWeather.apiKey` in config | raster |
| 卫星影像 真彩/海温/夜光 | NASA GIBS WMTS (URL built in renderer, `getGibsTileTemplate`; daily layers use yesterday UTC — truecolor 404s with `default` time; static Black Marble uses `default`) | none | raster, `maxzoom` from `GIBS_LAYERS` (7–9) |
| 地震 | USGS via `GET /monitor/earthquakes?feed=all_day` (props slimmed to mag/place/time/depth/url) | none | circles sized/colored by magnitude |
| 台风 | 温州台风网 istrongcloud via `GET /monitor/typhoons` — active (`is_current`) typhoons, else latest of the year; features tagged `kind: track/point/forecast/forecast-point/label`; forecast = 中国 agency | none | solid track + dashed forecast, points colored by CMA intensity scale |
| 火点 | NASA FIRMS via `GET /monitor/fires?key=…` (VIIRS S-NPP world last 24 h CSV→GeoJSON; low-confidence dropped, capped MAX_FIRES=20k by FRP, `truncated` flag; FIRMS returns key errors as HTTP-200 plain text — detected server-side) | `firms.apiKey` in config | circles sized/colored by FRP |
| 灾害警报 | GDACS via `GET /monitor/gdacs` (Point features only, deduped per event; 60 s timeout — slow multi-MB feed) | none | circles colored Green/Orange/Red + eventtype text |
| 空气质量 | WAQI via `GET /monitor/waqi?token&south&west&north&east` — fetched for the **current viewport**, refetched on `moveend` (1.2 s debounce) | `waqi.apiKey` in config | circles in EPA AQI colors + value label |

- Backend: `python/routers/monitor.py` + `python/services/monitor.py`
  (httpx + system proxy mounts, same as WFS/OSM). Vector data proxied through
  Python; raster tiles loaded directly by MapLibre.
- Renderer: `MapCanvas/MonitorLayer.tsx` (modeled on FlightLayer). Raster
  overlays are inserted **below** the first `user-*`/`monitor-v-*` layer;
  vector overlays use the `monitor-v-` prefix and are kept on top via
  `bringMonitorLayersToTop(map)` (called in `renderLayers`). Click on
  quake/typhoon points opens a maplibre Popup. Re-syncs on `style.load`.
- Refresh: earthquakes 5 min, typhoons/radar/GDACS/AQI 10 min, fires 30 min.
  Toggling off clears cached data.
- GCJ-02: quake/typhoon GeoJSON converted with `convertToGcj02` on Amap
  basemaps; weather raster tiles stay WGS-84 (inherent offset on Amap, same
  caveat as offline tiles).
- Key-gated overlays (OWM / FIRMS / WAQI) without a configured key: enabling is
  blocked with a message and the Settings modal is opened (`onSettings` passed
  through Toolbar). Keys live in `~/.yutugis/config.json`:
  `openWeather.apiKey` / `firms.apiKey` / `waqi.apiKey`.

## IPC API (`window.electronAPI`)

```ts
getPythonPort(): Promise<number>
readFile(path: string): Promise<ArrayBuffer>
writeFile(path: string, content: string): Promise<void>
openFileDialog(filters): Promise<string | null>
saveFileDialog(filters): Promise<string | null>
loadConfig(): Promise<{ language: 'zh'|'en'; googleMap: { apiKey: string }; amap: { apiKey: string }; openWeather: { apiKey: string }; download: { dir: string } }>
saveConfig(config): Promise<void>
onMenuAction(cb: (action: string) => void): () => void
```

---

## CSP (index.html)

```
default-src 'self'
script-src 'self' 'unsafe-eval'       ← MapLibre GL requires eval
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob: https: http:   ← tile images
connect-src 'self' https: http: ws:   ← tile fetches + Python localhost
worker-src blob:                       ← MapLibre web workers
```

Do not tighten `img-src` or `connect-src` — tiles will stop loading.

---

## GeoLibre 对标功能（2026-07 新增）

设计文档在 `docs/superpowers/specs/2026-07-11-*.md`，实施计划在
`docs/superpowers/plans/`。总览：`2026-07-11-geolibre-features-overview.md`。

| 功能 | 关键位置 | 说明 |
|---|---|---|
| 属性表 | `components/AttributeTable/`（`tableUtils.ts` 纯逻辑）、`attributeTableStore` | 底部面板；虚拟表格、排序、按值过滤、列头统计 Popover、筛选另存图层；表格/图表双页签 |
| 属性图表 | `AttributeTable/ChartsTab.tsx` + `chartUtils.ts` | 直方图/柱状/饼图，手写 SVG（零依赖），基于过滤后行集 |
| 矢量分析 | `python/services/analysis.py`、`components/Analysis/AnalysisPanel.tsx` | `POST /analysis/run`；10 种 op；米制运算用图层质心 UTM 带投影；与瓦片/OSM 面板互斥 |
| 图层符号化 | `layerStore.LayerStyle`、`components/StylePanel/`（`styleUtils.buildPaint`） | 单一/分类（match 表达式）/分级（step 表达式）；**带 style 的图层不参与选中橙色高亮**；LayerPanel 行内调出 |
| 测量工具 | `measureStore`、`MapCanvas/MeasureLayer.tsx`、`utils/geodesy.ts` | 独立于 MapboxDraw；单击加点/双击结束/右键撤销；Amap 底图下 `gcj02ToWgs84` 逆变换后存 WGS-84 |
| 多格式导出 | `python/services/export.py`、`ExportLayersModal`（`initialLayerId` 复用单图层入口） | SHP（按点/线/面拆分、字段名 10 字节截断）/GPKG（Unknown 泛型几何）/KML、CSV（stdlib 手写）；GeoJSON 仍前端直写 |
| 工程文件 | `services/project.ts`、`.yutugis` JSON | geojson 内联、raster 存 `sourcePath` 重注册；恢复视角用 `mapStore.requestJumpTo`；工具栏 + File 菜单 Cmd+O/S |
| 空间书签 | `bookmarkStore`、`Toolbar/BookmarkDropdown.tsx` | 持久化到 config `bookmarks[]`；写入走 **`config:update` 局部合并 IPC**（防止互相覆盖，SettingsModal 也已切换） |
| 地图出图 | `utils/mapExport.ts`、`Toolbar/MapExportDropdown.tsx`、`services/mapRef.ts` | 地图初始化已开 `preserveDrawingBuffer`；PNG 导出（`fs:writeFileBinary` IPC）/剪贴板；右下角合成署名 |
| GeoTIFF/COG | `python/services/geotiff_sources.py`、`utils/importGeoTiff.ts` | `POST /tiles/geotiff` 注册（sha1 幂等）+ 动态瓦片 `GET /tiles/geotiff/{id}/{z}/{x}/{y}.png`；WarpedVRT→3857、2–98 百分位拉伸、渲染全局锁；统一导入流程接 `.tif/.tiff` |
| 雷达时间滑块 | `monitorStore.radarFrames/radarIndex/radarPlaying`、`MapCanvas/RadarTimelineBar.tsx` | `/monitor/rainviewer` 返回 `frames[]`（past+nowcast，旧字段保留）；MonitorLayer 每帧一个 source，切帧只改 opacity |
| 卷帘对比 | `swipeStore`、`MapCanvas/SwipeOverlay.tsx`、`Toolbar/SwipeDropdown.tsx` | 副地图 + CSS clip-path；主图 renderLayers 跳过卷帘层；相机单向同步；绘制/测量时禁用 |
| SQL 工作台 | `python/services/sql.py`（DuckDB + spatial 扩展）、`components/SqlWorkbench/SqlPanel.tsx`、`sqlPanelStore` | 底部面板（与属性表互斥）；图层经 ST_Read 注册为表（几何列 `geom` GEOMETRY，中文表名可用）；仅允许 SELECT/WITH/SHOW/DESCRIBE；结果几何列经 ST_AsGeoJSON 返回，可一键转图层；spatial 扩展首次使用需联网下载，失败时降级为纯属性查询（`/sql/status`） |

远期未做：AI 助手（自然语言 GIS）—— 见总览文档"远期项"。

---

## Known Pitfalls

- **fiona requires Python 3.12** — pre-built wheels are available on PyPI. Python 3.13+ has no fiona wheels; do not upgrade Python version.
- **uv must be used** for Python dependency management, not pip directly. `pip install` in the venv may silently fail.
- **`Input.Search` breaks paste** — Ant Design's `Input.Search` with `enterButton` interferes with paste events. Use plain `<Input>` + a separate `<Button>` for URL inputs.
- **Never `git add -A` blindly** — `python/.venv/` is large; verify `.gitignore` covers it before staging.
- **settingsStore has no persist middleware** — do not add `persist` back. Settings are loaded from `~/.yutugis/config.json` at startup via IPC; writing to localStorage would create a stale second source of truth.
- **MapboxDraw + MapLibre** — `draw` must be cast as `unknown as maplibregl.IControl` when calling `map.addControl`. The types are not directly compatible but the runtime interface matches.
- **Stale closures in map event handlers** — map event handlers registered in the init `useEffect` do not re-register on state changes. Use refs (`drawModeRef`, `layersRef`, etc.) and sync them in separate `useEffect` calls to keep handlers current.
