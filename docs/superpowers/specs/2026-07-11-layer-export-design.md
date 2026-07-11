# 图层导出增强设计（SHP / GPKG / KML / CSV）

日期：2026-07-11 · 优先级 P0 · 参考 GeoLibre "Export to GeoJSON/Shapefile/GeoPackage/CSV"

## 目标

现有导出仅 GeoJSON（纯前端 writeFile）。扩展为 GeoJSON / Shapefile / GeoPackage /
KML / CSV 五种格式，多格式经 Python 后端 fiona 写出。

## 后端

`python/services/export.py` + 路由加在 `routers/data.py`：

```
POST /data/export
{ "geojson": <FeatureCollection>, "format": "shp"|"gpkg"|"kml"|"csv", "path": "/abs/dir/or/file", "name": "图层名" }
→ { "files": ["/abs/path/xxx.shp", ...] }    // 实际写出的文件列表
```

GeoJSON 不走后端（现状保留，前端直接写）。

格式细节：

- **shp**：`path` 为目录，写 `<name>.shp/.dbf/.shx/.prj/.cpg`（UTF-8 cpg）。
  Shapefile 限制处理：
  - 单文件只能一种几何类型 → 按 Point/LineString/Polygon（含 Multi 归并）拆分，
    多类型时文件名加后缀 `_点/_线/_面`；GeometryCollection 要素跳过并计数。
  - 字段名 >10 字节截断 + 序号去重；中文字段名按 UTF-8 字节截断到合法长度。
  - 属性类型：对每字段扫描全部值，全 int→int、全 float/int→float、其余 str
    （str 截断 254）；None 保留为 None。
- **gpkg**：单文件；几何类型混合时用 fiona schema `'Unknown'`（GPKG 支持
  GEOMETRY 泛型）——若 fiona 版本拒绝，则同 shp 拆分策略降级（实现时以
  `'Unknown'` 优先并留测试）。图层名 = name。
- **kml**：stdlib XML 手写（决策 4，不依赖 GDAL KML driver）：Placemark per
  feature，name 取 properties.name/_feature_label，其余属性写 ExtendedData/Data；
  样式省略（KML 消费方自带默认样式）。Multi 几何 → MultiGeometry。
- **csv**：stdlib csv，UTF-8-BOM（Excel 友好）；列 = 属性键并集 + `wkt` 几何列；
  Point 图层额外给 `lon`/`lat` 列。

pytest：各格式最小写出 + fiona 读回校验（kml/csv 文本断言）。

## 前端

- **ExportLayersModal**（批量）：增加格式 Radio（GeoJSON/SHP/GPKG/KML/CSV），
  仍选目录：GeoJSON 走现有 writeFile；其余逐图层调 `/data/export`
  （`path` = 所选目录，`name` = 去重后的文件名）。进度沿用现有循环 + message。
- **LayerPanel 单图层导出**：`handleExportLayer` 改为先弹小 Modal 选格式，再
  `saveFileDialog`（按格式设扩展名；shp 用 `openDirectoryDialog`），后端写出。
- **api.ts**：`exportLayer(geojson, format, path, name): Promise<{files: string[]}>`。
- i18n：格式名与提示。

## 边界

- 空图层：允许导出（空文件/空表），fiona 需要 schema —— 空集合时从空 schema
  拒绝，返回 400 "图层为空"，前端提示。
- 大图层（10 万要素）JSON POST ~ 数十 MB，本机回环可接受；不做流式。
- 路径不可写 → 后端 400 detail 透传。
