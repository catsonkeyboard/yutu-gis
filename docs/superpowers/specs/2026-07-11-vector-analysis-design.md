# 矢量分析工具箱设计

日期：2026-07-11 · 优先级 P0 · 参考 GeoLibre "Processing → Vector Tools"

## 目标

提供桌面 GIS 常用矢量运算：缓冲区、裁剪、相交、擦除、合并、融合、凸包、质心、
简化、按位置选择。计算在 Python 后端（shapely 2 + pyproj，均已在依赖中），
结果作为新图层加入地图。

## 运算清单

| op | 输入 | 参数 | 输出 |
|---|---|---|---|
| `buffer` | 主图层 | 距离(米)，可为负 | Polygon 集 |
| `clip` | 主图层 + 叠加图层 | — | 主图层被叠加层裁剪 |
| `intersection` | 主 + 叠加 | — | 逐对相交部分（属性合并，叠加层属性加前缀 `b_`） |
| `difference` | 主 + 叠加 | — | 主图层擦除叠加层 |
| `union` | 主 + 叠加 | — | 两层要素合并为一层（要素级 append，不做几何 union） |
| `dissolve` | 主图层 | 可选字段 | 按字段值（或全部）融合为 Multi 几何 |
| `convex_hull` | 主图层 | — | 整层凸包（1 要素） |
| `centroid` | 主图层 | — | 逐要素质心点 |
| `simplify` | 主图层 | 容差(米) | 简化后的原类型 |
| `select_by_location` | 主 + 叠加 | 谓词 intersects/within/contains/disjoint | 主图层中满足谓词的要素（属性原样保留） |

## 后端

`python/services/analysis.py` + `python/routers/analysis.py`，挂载 `prefix="/analysis"`。

```
POST /analysis/run
{ "op": "buffer",
  "primary": <FeatureCollection>,
  "secondary": <FeatureCollection | null>,
  "params": { "distance": 500, "field": "...", "predicate": "...", "tolerance": ... } }
→ { "type": "FeatureCollection", ... }   // 400 + detail 出错
```

实现要点：

- **米制运算投影**：`buffer`/`simplify` 需要米单位。取主图层整体质心，求其 UTM
  带（`pyproj` `utm.from_latlon` 等价计算：zone = floor((lon+180)/6)+1），构造
  `Transformer` WGS84↔UTM，投影→运算→逆投影。跨多个 UTM 带的大范围图层精度下降，
  文档声明即可（桌面分析场景可接受）。纬度 >84°/< -84° 时退化为 EPSG:3857。
- **几何清洗**：所有输入 shape 后跑 `make_valid`（shapely 2 提供），无效且不可修复
  的要素跳过并计数，响应头部字段 `skipped` 返回（放进 FeatureCollection 的
  顶层 `"skipped": n`，前端 >0 时 message.warning）。
- **overlay 类**（clip/intersection/difference/select_by_location）：叠加层用
  `shapely.STRtree` 建索引，逐主要素查询候选后精确判断，避免 O(n·m)。
- **dissolve**：按字段值分组 `unary_union`；无字段则整层 union，属性只保留分组键。
- **空结果**合法：返回空 FeatureCollection，前端提示"结果为空，未创建图层"。
- 几何类型过滤：clip/intersection 的叠加层仅取 Polygon/MultiPolygon 要素，
  其余忽略（并入 `skipped`）。
- pytest：每个 op 一个用例（小型手造 FeatureCollection），覆盖空输入、无效几何、
  负缓冲。

## 前端

- **入口**：工具栏新增 `ExperimentOutlined` 按钮（放在 OSM 提取按钮后），开关
  悬浮面板；与瓦片下载/OSM 面板互斥（打开时关闭对方，复用现有互斥模式）。
- **面板** `components/Analysis/AnalysisPanel.tsx` + `stores/analysisPanelStore.ts`
  （open 状态；与 tilesPanelStore 同构）：
  - 顶部 Select 选择运算（分组：几何处理 / 叠加分析 / 选择）。
  - 动态参数区：主图层 Select（仅 geojson 图层）、叠加图层 Select（需要时）、
    数值参数 InputNumber、字段 Select（dissolve，选项取自图层属性键）、
    谓词 Select。
  - 执行按钮 + loading；要素数 > 50,000 时先 Modal.confirm 警告耗时。
- **api.ts**：`runAnalysis(op, primary, secondary, params): Promise<FeatureCollection & { skipped?: number }>`。
- **结果**：`addLayer` 命名 `<中文操作名>_<主图层名>`（buffer 附 `_<距离>m`），
  选中并 fitBounds。
- i18n：运算名与参数标签进 locales。

## 边界与错误

- 主/叠加图层被删除后点执行 → 面板重新校验，message.error。
- 后端 400 → `parseApiError` 展示 detail。
- GCJ-02：计算永远用 store 中的 WGS-84 数据，与当前底图无关。
