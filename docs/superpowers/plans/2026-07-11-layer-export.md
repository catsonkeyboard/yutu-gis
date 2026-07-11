# 图层导出增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 图层导出支持 GeoJSON/SHP/GPKG/KML/CSV；GeoJSON 保持前端直写，其余走后端 fiona/stdlib。

**Architecture:** `python/services/export.py` 提供 `export_layer(geojson, fmt, path, name) -> list[str]`（path 一律为目标目录，返回写出文件列表）；路由加在 `routers/data.py`。前端 `ExportLayersModal` 增加格式选择并复用为单图层导出（`initialLayerId` prop）。规格见 `docs/superpowers/specs/2026-07-11-layer-export-design.md`。

**关键实现决策：**
- SHP 按几何类拆分（点/线/面后缀 `_点/_线/_面`），统一提升为 Multi 类型避免 fiona schema 冲突；字段名 UTF-8 截断 10 字节 + 序号去重；GeometryCollection 跳过计数。
- GPKG 用 schema geometry `'Unknown'` 单文件（GDAL GPKG 支持泛型几何）。
- KML/CSV 用 stdlib 手写（KML: Placemark+ExtendedData；CSV: UTF-8-BOM + wkt 列，Point 加 lon/lat）。
- 属性类型推断：全 int→int、int/float→float、其余 str；bool→str。

---

### Task 1: 后端 export 服务（TDD）
- Create: `python/services/export.py`、`python/tests/test_export.py`
- Modify: `python/routers/data.py`（`POST /data/export` → `{files, skipped}`）
- [ ] 失败测试（shp 拆分回读、gpkg 混合几何回读、kml 结构、csv 表头/BOM、空图层 400）→ 实现 → 通过 → Commit

### Task 2: 前端接线
- Modify: `src/renderer/src/services/api.ts`（`exportLayer()`）
- Modify: `src/renderer/src/components/Toolbar/ExportLayersModal.tsx`（格式 Radio + initialLayerId + 后端分支）
- Modify: `src/renderer/src/App.tsx`（单图层导出改为打开该 Modal）
- Modify: locales（export.* 增补）
- [ ] 实现 + typecheck → Commit
