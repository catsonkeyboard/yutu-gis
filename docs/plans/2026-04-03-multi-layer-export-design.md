# Multi-Layer Export — Design Document

**Date:** 2026-04-03

## Problem

The toolbar export button currently exports only the selected layer via a single save dialog. There is no way to export multiple layers at once.

## Solution

Replace the single-layer export flow with a modal that lets the user select any subset of layers and export them all to a chosen directory in one operation.

## User Flow

1. User clicks the "导出" toolbar button.
2. `ExportLayersModal` opens, listing all `geojson` layers with checkboxes (all checked by default). Raster/image layers are excluded — they have no exportable GeoJSON source.
3. User adjusts the selection, then clicks "选择导出目录".
4. Electron opens a native directory picker (`dialog.showOpenDialog` with `openDirectory`).
5. The app writes each selected layer as `<sanitized-name>.geojson` into the chosen directory. Layer names are sanitized by replacing `/ \ : * ? " < > |` with `_`.
6. Duplicate file names (different layers, same sanitized name) are disambiguated with `_2`, `_3`, etc.
7. On completion: `message.success('已导出 N 个图层')`. Any per-file errors are reported individually without aborting remaining exports.
8. If there are no exportable layers, the modal body shows "暂无可导出的图层".

## Files Changed

| File | Change |
|---|---|
| `src/main/ipc.ts` | Add `dialog:openDirectory` IPC handler |
| `src/preload/index.ts` | Add `openDirectoryDialog(): Promise<string \| null>` |
| `src/renderer/src/components/Toolbar/ExportLayersModal.tsx` | New modal component |
| `src/renderer/src/App.tsx` | Replace `handleExport` to open the modal; remove old single-layer logic |
| `src/renderer/src/locales/zh.json` | Add export modal strings |
| `src/renderer/src/locales/en.json` | Add export modal strings |

## Non-Goals

- Exporting raster or image layers
- ZIP archive output
- Custom per-layer file naming in the UI
