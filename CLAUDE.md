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
  │   │                         MapboxDraw integration, map-click layer selection
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
  ├── python/routers/data.py  — /data/import, /data/wfs/*, /data/ogc/*
  └── python/services/
      ├── gis.py              — file_to_geojson() via fiona
      └── wfs.py              — WFS 1.x/2.x + OGC API Features via httpx
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
{ "language": "zh", "googleMap": { "apiKey": "" }, "amap": { "apiKey": "" } }
```
- `loadConfig()` merges file contents with `DEFAULT_CONFIG` — missing keys fall back to defaults.
- `saveConfig()` is called from `SettingsModal` when the user saves settings.
- On renderer startup (`App.tsx`), `window.electronAPI.loadConfig()` is called and the result is pushed into `settingsStore` via `setLanguage` / `setApiKeys`.
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

---

## WFS / OGC API Features

- **WFS 1.x / 2.x**: GetCapabilities → GetFeature with `OUTPUTFORMAT=application/json`
- **OGC API Features**: `/collections` → `/collections/{id}/items`
- Multi-select: each selected layer/collection generates an independent map layer
- Import runs sequentially with progress bar; partial failures are shown without aborting remaining items

---

## IPC API (`window.electronAPI`)

```ts
getPythonPort(): Promise<number>
readFile(path: string): Promise<ArrayBuffer>
writeFile(path: string, content: string): Promise<void>
openFileDialog(filters): Promise<string | null>
saveFileDialog(filters): Promise<string | null>
loadConfig(): Promise<{ language: 'zh'|'en'; googleMap: { apiKey: string }; amap: { apiKey: string } }>
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

## Known Pitfalls

- **fiona requires Python 3.12** — pre-built wheels are available on PyPI. Python 3.13+ has no fiona wheels; do not upgrade Python version.
- **uv must be used** for Python dependency management, not pip directly. `pip install` in the venv may silently fail.
- **`Input.Search` breaks paste** — Ant Design's `Input.Search` with `enterButton` interferes with paste events. Use plain `<Input>` + a separate `<Button>` for URL inputs.
- **Never `git add -A` blindly** — `python/.venv/` is large; verify `.gitignore` covers it before staging.
- **settingsStore has no persist middleware** — do not add `persist` back. Settings are loaded from `~/.yutugis/config.json` at startup via IPC; writing to localStorage would create a stale second source of truth.
- **MapboxDraw + MapLibre** — `draw` must be cast as `unknown as maplibregl.IControl` when calling `map.addControl`. The types are not directly compatible but the runtime interface matches.
- **Stale closures in map event handlers** — map event handlers registered in the init `useEffect` do not re-register on state changes. Use refs (`drawModeRef`, `layersRef`, etc.) and sync them in separate `useEffect` calls to keep handlers current.
