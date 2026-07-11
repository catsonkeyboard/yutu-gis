# GeoTIFF / COG 栅格导入设计

日期：2026-07-11 · 优先级 P2 · 参考 GeoLibre "COG and GeoTIFF support"

## 目标

统一导入流程支持本地 GeoTIFF（含 COG）：`.tif/.tiff` → 后端 rasterio 注册为动态
瓦片源 → 前端 raster 图层显示。覆盖遥感影像/DEM 渲染场景。

## 依赖

`requirements.txt` 增加 `rasterio>=1.4`（py3.12 有预编译 wheel，与 fiona 同源
GDAL，无冲突）。

## 后端

`python/services/geotiff_sources.py` + 路由并入 `routers/tiles.py`：

```
POST /tiles/geotiff { "path": "/abs/a.tif" }
→ { "id": "...", "name": "a", "bounds": [w,s,e,n](EPSG:4326), "minzoom": 0, "maxzoom": 18,
    "band_count": 3, "truncated_stats": false }
GET /tiles/geotiff/{id}/{z}/{x}/{y}.png   → 256×256 PNG（透明 nodata）
```

- **注册**（幂等，source_id = sha1(abspath)[:12]，仿 tile_sources.py）：
  - 打开 dataset，记录 CRS/bounds/band 数/dtype/nodata。
  - **拉伸统计**：读最粗 overview（或 decimated read ≤1024×1024）算每波段
    2–98 百分位，缓存供渲染归一化。uint8 且无需拉伸时跳过。
  - maxzoom 由原始分辨率估算（ground resolution → zoom），minzoom 固定 0。
- **瓦片渲染**：`WarpedVRT(dataset, crs=EPSG:3857)` + 按瓦片 bbox 窗口读
  256×256（bilinear）：
  - ≥3 波段 → RGB；单波段 → 灰度（percentile 拉伸）；带颜色表 → 调色板展开。
  - nodata / 越界 → alpha 0。
  - PNG 编码用 rasterio/numpy + `PIL`? 不引 PIL：用 `png` 手写? —— rasterio 自带
    MemoryFile 可写 PNG driver（GDAL PNG driver 含在 wheel 中），用
    `MemoryFile` + `rasterio.open(driver='PNG')` 输出，零新依赖。
  - dataset 句柄常驻 + `threading.Lock`（rasterio 非线程安全；uvicorn 单进程
    async，sync 端点在线程池运行 → 每请求加锁串行渲染，COG 本地读足够快）。
- pytest：小型合成 GeoTIFF（rasterio 生成）注册 + 取瓦片断言 PNG 头与透明区。

## 前端

- `handleImport` 文件过滤加 `tif/tiff`；命中后调 `api.importGeoTiff(path)` →
  `addLayer({ type:'raster', sourcePath: path, source:{ tiles:[GET url], bounds, minzoom, maxzoom } })`
  → fitBounds。与离线地图 raster 同渲染路径，零 MapCanvas 改动。
- 工程文件恢复：`kind:'raster'` 已存 path；按扩展名分派到 /tiles/sources 或
  /tiles/geotiff 重注册。
- GCJ-02 caveat 同离线瓦片：Amap 底图下有偏移（文档与 UI 均已有先例，不提示）。

## 边界

- 无 CRS 的 TIFF → 400 "缺少坐标系信息"。
- 超大非 COG 文件首次渲染慢（无 overview）→ 注册响应加 `has_overviews` 供前端
  提示"建议转换为 COG"。
