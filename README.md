# YutuGIS 舆图

Professional GIS desktop application for GIS analysts. Supports vector data loading & visualization, multi-source basemap switching, WFS/OGC API remote data access, map feature drawing, and automatic coordinate system correction.

Built on **Electron + React + Python FastAPI** — the frontend handles map rendering and interaction, while the Python backend manages GIS data format conversion and remote service requests.

---

## Features

### Map Rendering
- MapLibre GL JS v5 with hardware-accelerated vector tile rendering
- 6 basemap options (bottom-right dropdown):
  - OSM Street Map
  - Google Street Map / Satellite
  - Amap (高德) Street / Satellite / Terrain
- Navigation controls (zoom / rotate / reset), scale bar
- Status bar showing real-time coordinates and zoom level

### Coordinate System Correction
- Amap tiles use GCJ-02 (Mars coordinate system); GeoJSON data uses WGS-84
- Automatically converts overlay layers from WGS-84 → GCJ-02 when Amap basemap is active
- Coordinates outside mainland China skip the conversion

### Data Import
Local file import via toolbar button:

| Format | Notes |
|---|---|
| GeoJSON / JSON | Direct read |
| Shapefile (.shp) | Converted via fiona |
| KML | Converted via fiona |
| GPX | Converted via fiona |

Auto-zooms to data extent after import.

### WFS / OGC API Features
Connect to remote GIS services via the toolbar connect button:

- **WFS 1.x / 2.x**: GetCapabilities for layer listing, GetFeature for data download
- **OGC API Features**: `/collections` for collection listing, `/collections/{id}/items` for data download
- Multi-select: choose multiple layers/collections, each imported as an independent layer
- Configurable max feature count per layer (default 1000)
- Sequential import with progress bar; partial failures don't block remaining items
- Manual input mode: enter layer names directly when capabilities aren't available

### Drawing Tools
Three drawing modes available in the toolbar (can be used in combination):

| Mode | Usage |
|---|---|
| Point | Click to place a point feature |
| LineString | Click to add vertices, double-click to finish |
| Polygon | Click to add vertices, click origin or double-click to close |

- Hint banner at the top shows current mode instructions; **Finish & Save** button appears after drawing
- Save options: append to current layer or create a new layer with a custom name
- Click the same draw button again or press `Escape` to cancel

### Layer Management
- Layer panel on the left showing all loaded layers
- **Map-click layer selection**: cursor changes to pointer on hover, clicking selects the layer and scrolls the panel
- Selected layer features highlighted in orange; others in blue
- Click a panel item to select and auto-zoom to that layer's extent
- Visibility toggle, delete, and GeoJSON export

### Settings
- Language: Chinese / English
- API key management: Google Maps Key, Amap Key (both optional — public endpoints used when blank)
- Persisted to `~/.yutugis/config.json` (cross-platform user directory, not tracked by git)

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  Toolbar (Import / Export / WFS / Draw / Settings)   │
├──────────────┬──────────────────────────────────────┤
│              │  ┌────────── Draw Hint Bar ─────────┐ │
│  Layer Panel │  │ Click to add vertex  [Finish&Save]│ │
│  (220px)     │  └─────────────────────────────────┘ │
│              │           Map Canvas                 │
│  Layer 1 👁🗑 │        (MapLibre GL)                  │
│  Layer 2 👁🗑 │                              ┌────┐ │
│              │                              │Base│ │
│              │                              │map │ │
│              │                              └────┘ │
├──────────────┴──────────────────────────────────────┤
│  Status Bar: Longitude / Latitude / Zoom Level       │
└─────────────────────────────────────────────────────┘
```

---

## Architecture

```
Electron Main Process
  ├── Window management, native menus
  ├── Spawns Python subprocess (dynamic port)
  ├── Loads/saves user config (~/.yutugis/config.json)
  └── IPC: file read, dialogs, config read/write

Preload Script (contextBridge)
  └── electronAPI: getPythonPort / readFile / writeFile /
                   openFileDialog / saveFileDialog /
                   loadConfig / saveConfig / onMenuAction

Renderer (React 19 + TypeScript)
  ├── MapCanvas     Map rendering (MapLibre GL) + Draw tools (MapboxDraw)
  ├── LayerPanel    Layer management panel
  ├── WFSModal      Remote service connection
  ├── Toolbar       Toolbar (with draw mode buttons)
  ├── StatusBar     Status bar
  └── Zustand state management
      ├── layerStore    Layer list, selection, appendFeatures
      ├── mapStore      Viewport, basemap, fitBoundsRequest
      ├── drawStore     Draw mode, current feature set
      └── settingsStore Language, API keys (runtime state, initialized from config file)

Python Backend (FastAPI + uvicorn)
  ├── POST /data/import          Local file → GeoJSON (fiona)
  ├── POST /data/wfs/layers      WFS GetCapabilities
  ├── POST /data/wfs/features    WFS GetFeature
  ├── POST /data/ogc/collections OGC API /collections
  └── POST /data/ogc/features    OGC API /collections/{id}/items
```

---

## Prerequisites

| Dependency | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Python | 3.12 (required — fiona has no wheels for 3.13+) |
| uv | Latest (Python package manager) |

---

## Getting Started

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Set up Python environment

```bash
cd python
uv venv --python 3.12
uv pip install -r requirements.txt
cd ..
```

> **Note:** You must use `uv` — do not use `pip install` directly. Python must be 3.12; fiona has no pre-built wheels for 3.13+.

### 3. Start development mode

```bash
npm run dev
```

The Electron main process automatically starts the Python backend (on a random port), waits for the health check to pass, then opens the window. On first launch, `config.json` is created in `~/.yutugis/`.

---

## Building

```bash
# Type check
npm run typecheck

# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

Build artifacts go to `dist/`. The Python backend must be compiled into a standalone executable (`python-backend`) and placed in `resources/` for production builds. During development, `.venv` is used directly.

---

## Common Commands

```bash
npm run dev          # Development mode
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Run tests (vitest)
npm run build        # Build (includes typecheck)
```

---

## Project Structure

```
yutugis/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # Entry point, window creation
│   │   ├── config.ts           # User config read/write (~/.yutugis/config.json)
│   │   ├── python.ts           # Python subprocess management
│   │   ├── menu.ts             # Native menus
│   │   └── ipc.ts              # IPC handlers
│   ├── preload/
│   │   ├── index.ts            # contextBridge
│   │   └── index.d.ts          # electronAPI type declarations
│   └── renderer/src/
│       ├── App.tsx             # Root component, loads config on mount
│       ├── components/
│       │   ├── MapCanvas/      # Map + draw tools + basemap switcher
│       │   ├── LayerPanel/     # Layer management panel
│       │   ├── Toolbar/        # Toolbar (with draw buttons)
│       │   ├── WFS/            # WFS/OGC connection modal
│       │   ├── Settings/       # Settings modal
│       │   └── StatusBar/      # Status bar
│       ├── stores/
│       │   ├── layerStore.ts   # Layer state (with appendFeatures)
│       │   ├── mapStore.ts     # Map state (viewport, basemap, fitBounds)
│       │   ├── drawStore.ts    # Draw state (mode, feature set)
│       │   └── settingsStore.ts# Settings (runtime state, initialized from config file)
│       ├── services/
│       │   └── api.ts          # Python backend API client
│       └── utils/
│           ├── geo.ts          # GeoJSON bounds calculation
│           └── coordTransform.ts # WGS-84 ↔ GCJ-02 conversion
├── python/
│   ├── main.py                 # FastAPI app entry point
│   ├── routers/
│   │   └── data.py             # Data endpoint routes
│   ├── services/
│   │   ├── gis.py              # File format conversion (fiona)
│   │   └── wfs.py              # WFS/OGC requests (httpx)
│   ├── requirements.txt
│   └── .venv/                  # uv-managed virtual environment (not in git)
├── docs/plans/                 # Design documents
├── CLAUDE.md                   # AI collaboration guide
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

---

## User Config File

Created automatically on first launch — **not tracked by version control**:

| Platform | Path |
|---|---|
| macOS / Linux | `~/.yutugis/config.json` |
| Windows | `C:\Users\<username>\.yutugis\config.json` |

```json
{
  "language": "zh",
  "googleMap": {
    "apiKey": ""
  },
  "amap": {
    "apiKey": ""
  }
}
```

---

## Notes

- **SOCKS Proxy**: Python backend uses `httpx[socks]` for SOCKS proxy support; WFS requests work through system proxies
- **SSL Certificates**: WFS requests skip SSL verification (`verify=False`) for compatibility with enterprise self-signed certificates
- **Clipboard**: Native Edit menu is included; `Cmd+C/V/X` works in all input fields
- **File Reading**: Renderer reads local files via IPC, not affected by CSP `file://` restrictions
- **API Keys**: Google Maps and Amap keys are optional — public tile services are used when blank; keys are stored locally, never uploaded

---

## License

MIT
