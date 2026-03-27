# GIS Map Tool — Design Document

**Date:** 2026-03-26
**Status:** Approved

---

## 1. Overview

A cross-platform desktop GIS tool built with Electron targeting professional GIS analysts. Core capabilities: map rendering with multiple tile providers, GIS data import/export (all major formats), layer management, spatial analysis, and data editing. Designed for extensibility — future integrations include LLM-assisted analysis.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron App                      │
│                                                     │
│  ┌──────────────────┐    ┌────────────────────┐    │
│  │  Main Process    │    │  Renderer Process  │    │
│  │  (Node.js)       │◄──►│  (React 19 + Vite) │    │
│  │  - Native menus  │IPC │  - MapLibre GL     │    │
│  │  - File dialogs  │    │  - Ant Design 5.x  │    │
│  │  - Python mgmt   │    │  - Zustand stores  │    │
│  └────────┬─────────┘    └────────────────────┘    │
│           │ spawn / HTTP localhost                   │
│  ┌────────▼─────────────────────────────────────┐  │
│  │         Python Backend (FastAPI)              │  │
│  │  - GIS data processing: GDAL, Fiona, Shapely  │  │
│  │  - Format conversion: GeoJSON/SHP/KML/GPX     │  │
│  │  - Spatial analysis (phase 2)                 │  │
│  │  - LLM integration (phase 3)                  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Communication:** Renderer ↔ Main via Electron `contextBridge` IPC. Main ↔ Python via local HTTP (FastAPI on a random available port, port passed to renderer via IPC).

**Distribution:** Python backend bundled via PyInstaller as a single executable alongside the Electron app. electron-builder packages everything.

---

## 3. UI Layout

```
┌─────────────────────────────────────────────────────┐
│  文件  编辑  视图  图层  工具  帮助         [_][□][×] │  ← Native menu bar
├─────────────────────────────────────────────────────┤
│ [打开][保存][导入][导出] │ [选择][画点][画线][画面]    │  ← Toolbar
│                          │ [测距][测面][缩放适配]      │
├──────────────┬──────────────────────────────────────┤
│              │                                       │
│  Layer Panel │           Map Canvas                  │
│              │        (MapLibre GL)                  │
│  □ Layer 1   │                                       │
│  □ Layer 2   │                                       │
│  + Add Layer │                            [+][-]    │
│              │                        [底图切换 ▼]  │
├──────────────┴──────────────────────────────────────┤
│  经度: 116.3974  纬度: 39.9093  缩放: 12  CRS: WGS84 │  ← Status bar
└─────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack

| Category | Choice | Version |
|---|---|---|
| Desktop framework | Electron | 28+ |
| Frontend | React + TypeScript | 19 |
| Build tool | electron-vite + Vite | latest |
| Map rendering | MapLibre GL JS | latest |
| UI components | Ant Design | 5.x |
| State management | Zustand | 5.x |
| Python framework | FastAPI + uvicorn | latest |
| GIS libraries | GDAL, Fiona, Shapely, pyproj | latest |
| Packaging | electron-builder + PyInstaller | latest |
| i18n | react-i18next | latest |

---

## 5. Map Providers & Tile Sources

All providers require user-configured API keys (stored in app settings, encrypted at rest).

| Provider | Styles |
|---|---|
| OSM | Street (no key required) |
| Google Maps | Street, Satellite |
| Amap (高德) | Street, Satellite, Terrain |

Tile URLs are stored as configurable style templates in user settings. The map provider switcher is accessible via a floating button in the bottom-right of the map canvas.

---

## 6. Layer Management

- Layers stored in Zustand as an ordered array
- Each layer: `{ id, name, type, source, visible, opacity, style }`
- Supported layer types: GeoJSON vector, raster tile, image overlay
- Layer panel: drag-to-reorder, visibility toggle, opacity slider, delete

---

## 7. Data Import / Export

Handled entirely by the Python backend via FastAPI endpoints.

**Import formats:** GeoJSON, Shapefile (.shp+.dbf+.prj+.shx), KML/KMZ, GPX, GeoTIFF
**Export formats:** GeoJSON, Shapefile, KML

Flow: Electron main process copies file to a temp path → calls Python `/import` endpoint → Python converts to GeoJSON → returns to renderer → added as a new layer.

---

## 8. Settings

Stored in Electron's `app.getPath('userData')/settings.json`.

- API keys: Google Maps, Amap, Mapbox (future)
- Default map center and zoom
- UI language: `zh` | `en`
- Python backend port (auto-detected, saved per session)

---

## 9. Project Structure

```
gis-map-tool/
├── electron/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # App entry, window creation
│   │   ├── ipc.ts      # IPC handlers
│   │   ├── menu.ts     # Native menu definition
│   │   └── python.ts   # Python process manager
│   └── preload/
│       └── index.ts    # contextBridge API exposure
├── src/                # React renderer
│   ├── components/
│   │   ├── Toolbar/
│   │   ├── LayerPanel/
│   │   ├── MapCanvas/
│   │   ├── StatusBar/
│   │   └── Settings/
│   ├── stores/         # Zustand stores
│   │   ├── mapStore.ts
│   │   ├── layerStore.ts
│   │   └── settingsStore.ts
│   ├── locales/        # i18n translations
│   │   ├── zh.json
│   │   └── en.json
│   └── main.tsx
├── python/             # Python backend
│   ├── main.py         # FastAPI app entry
│   ├── routers/
│   │   ├── data.py     # Import/export endpoints
│   │   └── health.py
│   ├── services/
│   │   └── gis.py      # GDAL/Fiona processing logic
│   └── requirements.txt
├── docs/
│   └── plans/
└── package.json
```

---

## 10. Phase Roadmap

| Phase | Scope |
|---|---|
| **Phase 1 (current)** | Project scaffold, map rendering, tile switching, layer panel, basic GeoJSON import |
| **Phase 2** | Full format import/export (SHP, KML, GPX, GeoTIFF), settings UI, API key management |
| **Phase 3** | Spatial analysis (buffer, overlay, interpolation), drawing tools |
| **Phase 4** | LLM integration via Python backend |
