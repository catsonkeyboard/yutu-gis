# 地图出图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当前地图视口导出 PNG / 复制剪贴板，右下角合成数据源署名。

**Architecture:** MapCanvas 初始化加 `canvasContextAttributes.preserveDrawingBuffer`；地图实例经模块级 `services/mapRef.ts` 暴露给 Toolbar；`utils/mapExport.ts` 合成（WebGL canvas → 2D canvas + 署名条）→ Blob；新增 IPC `fs:writeFileBinary`。规格见 `docs/superpowers/specs/2026-07-11-map-export-design.md`。

---

### Task 1: 基建
- Modify: `MapCanvas.tsx`（preserveDrawingBuffer + setMap(mapRef)）
- Create: `src/renderer/src/services/mapRef.ts`（setMap/getMap）
- Create: `src/renderer/src/utils/mapExport.ts`（`getAttributionText(provider)`、`composeMapPng(map, attribution): Promise<Blob>`）
- Modify: `tileProviders.ts`（`getAttribution(provider)` 纯文本）
- Modify: `src/main/ipc.ts` + preload（`writeFileBinary(path, ArrayBuffer)`）
- Test: attribution 推导 vitest
- [ ] 实现 + 测试 → Commit

### Task 2: Toolbar 入口
- Create: `src/renderer/src/components/Toolbar/MapExportDropdown.tsx`（CameraOutlined Dropdown：导出 PNG… / 复制剪贴板）
- Modify: `Toolbar.tsx`、locales（`mapExport.*`）
- [ ] 实现 + typecheck → Commit
