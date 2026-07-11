# GeoTIFF/COG 导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本地 GeoTIFF（含 COG）经 rasterio 注册为动态瓦片源，前端 raster 图层展示，纳入统一导入流程与工程文件。

**Architecture:** `python/services/geotiff_sources.py` 仿 tile_sources：`register(path)`（幂等 sha1 id、bounds 转 4326、2–98 百分位拉伸统计、maxzoom 估算）+ `render_tile(src, z, x, y)`（WarpedVRT→EPSG:3857 窗口读 256²，RGB/灰度拉伸/调色板，nodata 透明，rasterio MemoryFile PNG 编码，全局 Lock 串行）。路由并入 `routers/tiles.py`（`POST /tiles/geotiff`、`GET /tiles/geotiff/{id}/{z}/{x}/{y}.png`）。前端 `.tif/.tiff` 走 `api.importGeoTiff(path)` → raster layer（`sourcePath` 存路径）；工程文件恢复按扩展名分派 tiles/sources 或 tiles/geotiff。规格见 `docs/superpowers/specs/2026-07-11-geotiff-import-design.md`。

---

### Task 1: 后端（TDD，rasterio 合成小 GeoTIFF 测试）
- Modify: `python/requirements.txt`（rasterio>=1.4，已装）
- Create: `python/services/geotiff_sources.py`、`python/tests/test_geotiff.py`
- Modify: `python/routers/tiles.py`
- [ ] 失败测试（注册元数据/无 CRS 400/取瓦片 PNG 头/越界透明）→ 实现 → 通过 → Commit

### Task 2: 前端
- Modify: `src/renderer/src/services/api.ts`（`importGeoTiff(path)` + `getGeoTiffTileTemplate`）
- Modify: `src/renderer/src/App.tsx`（导入过滤 tif/tiff + 分支）
- Modify: `src/renderer/src/services/project.ts`（raster 恢复按扩展名分派）
- [ ] 实现 + typecheck → Commit
