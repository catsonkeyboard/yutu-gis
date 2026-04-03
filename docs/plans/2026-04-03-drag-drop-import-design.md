# Drag-and-Drop File Import — Design

**Date:** 2026-04-03  
**Status:** Approved

## Goal

Allow users to drag GIS files from the OS file manager onto the map canvas to import them, triggering the same import dialog and layer creation flow as the existing toolbar import.

## Scope

- Drop zone: map canvas area (`<Content>` in App.tsx) only
- Supported formats: `.geojson`, `.json`, `.kml`, `.gpx`
- Excluded: `.shp` (Shapefile requires multiple sidecar files)

## Architecture

### New API function — `api.ts`

```ts
export async function importGisFileFromFile(file: File): Promise<ImportedLayer[]>
```

The browser drag event yields a `File` object with raw bytes — no IPC readFile needed. Append directly to FormData and POST to `/data/import`.

### App.tsx changes

State: `const [isDragOver, setIsDragOver] = useState(false)`

Handlers on `<Content>`:
- `onDragOver`: `preventDefault()`, set `isDragOver = true`
- `onDragLeave`: set `isDragOver = false`
- `onDrop`: set `isDragOver = false`, validate extension, call `handleFileDrop`

`handleFileDrop(file: File)`:
1. Guard: if `drawMode !== 'off'`, skip
2. Validate extension against allowed list; `message.error` if unsupported
3. Call `importGisFileFromFile(file)`
4. If `totalFeatures <= 1` → `applyImport(layers, 'merge')` directly
5. Else → set `pendingImportLayers`, open import dialog (reuses existing merge/split modal)

### Drag overlay

Semi-transparent blue overlay rendered inside `<Content>` when `isDragOver`:
- `position: absolute`, full coverage, `pointer-events: none`
- Blue dashed border + centered text "松开以导入"
- `zIndex` above map, below any modal

## Data Flow

```
OS file drag → drop event → File object (bytes in renderer)
  → importGisFileFromFile → FormData POST /data/import
  → ImportedLayer[] → applyImport / import dialog
  → addLayer → MapCanvas renders new layer
```

## Error Handling

- Unsupported extension: `message.error('不支持的文件类型，请使用 GeoJSON / KML / GPX')`
- Backend error: `message.error('导入失败：' + e.message)` (same as toolbar import)
- Draw mode active: silently ignore drop

## Files Changed

| File | Change |
|---|---|
| `src/renderer/src/services/api.ts` | Add `importGisFileFromFile(file: File)` |
| `src/renderer/src/App.tsx` | Add drag state, handlers, overlay JSX on Content |
