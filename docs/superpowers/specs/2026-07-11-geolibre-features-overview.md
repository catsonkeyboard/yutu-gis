# GeoLibre 对标功能总览与路线图

日期：2026-07-11
来源：分析 https://github.com/opengeos/GeoLibre 与 https://geolibre.app/user-guide/，对比 YutuGIS 现状后修订。

## 现状盘点（已存在、无需开发）

分析原始清单中的以下项在当前代码中已实现，本轮不重复开发：

| 原清单项 | 现状 |
|---|---|
| 要素识别（Identify） | `FeaturePanel`（右侧栏）：地图点击 → `selectedFeatureProps` → 要素列表 + 属性键值表 |
| 地名搜索（Geocoding） | `LocationSearchModal`：城市/地名（Nominatim，经主进程代理）、经纬度、IATA 三字码 |
| 拖放导入 | `App.tsx` Content 区 onDrop，支持 GeoJSON/KML/GPX |
| 图层导出（GeoJSON） | `ExportLayersModal` 批量导出 + LayerPanel 单图层导出（仅 GeoJSON，本轮扩展格式） |
| 图层透明度（数据层） | `layerStore.setOpacity` 已有，但 **LayerPanel 无 UI**（并入符号化面板） |

## 本轮开发清单（12 项，按实施顺序）

| # | 功能 | 设计文档 | 优先级 |
|---|---|---|---|
| 1 | 属性表（列式、排序、过滤、字段统计、筛选另存） | 2026-07-11-attribute-table-design.md | P0 |
| 2 | 矢量分析工具箱（shapely 后端） | 2026-07-11-vector-analysis-design.md | P0 |
| 3 | 图层符号化（单一/分类/分级） | 2026-07-11-layer-styling-design.md | P0 |
| 4 | 测量工具（距离/面积） | 2026-07-11-measure-tool-design.md | P0 |
| 5 | 图层导出增强（SHP/GPKG/KML/CSV） | 2026-07-11-layer-export-design.md | P0 |
| 6 | 工程文件（.yutugis 保存/打开） | 2026-07-11-project-file-design.md | P0 |
| 7 | 空间书签 | 2026-07-11-bookmarks-design.md | P1 |
| 8 | 属性图表 | 2026-07-11-attribute-charts-design.md | P1 |
| 9 | 地图出图（PNG/剪贴板） | 2026-07-11-map-export-design.md | P1 |
| 10 | GeoTIFF/COG 栅格导入 | 2026-07-11-geotiff-import-design.md | P2 |
| 11 | 降水雷达时间滑块动画 | 2026-07-11-radar-timeline-design.md | P2 |
| 12 | 卷帘对比（Swipe） | 2026-07-11-swipe-compare-design.md | P2 |

依赖关系：8 依赖 1 的面板框架；6 需在 3 之后实现（工程文件要序列化 style 字段）；其余相互独立。
实现顺序按上表执行，1→3→2 亦可（属性表与符号化都不依赖后端）。

## 远期项（本轮不开发，仅记录方向）

- **AI 助手（自然语言 GIS）**：把自然语言转为图层操作/分析调用。前置条件是本轮的分析
  API（#2）与符号化模型（#3）就位，使其有"可被调用的能力面"。需要 LLM API key 配置、
  操作审计 UI，工作量大且独立，待本轮功能稳定后单独立项。
- **SQL 工作台**：GeoLibre 用 DuckDB-WASM；本项目如需 SQL 能力应在 Python 后端引入
  DuckDB（成本远低于 WASM 方案）。暂无明确需求，不立项。
- 多平台（PWA/Android/Jupyter）、实时协作、3D 球、插件市场：与 Electron 单机桌面定位
  不符，不引入。

## 全局设计约定（各功能文档共用）

- **UI 放置**：功能入口一律放工具栏；与地图交互的功能用悬浮面板，不用 Modal
  （用户既有偏好）。互斥悬浮面板（瓦片下载/OSM 提取/分析面板）打开时相互关闭。
- **新增依赖控制**：前端不新增运行时依赖（图表用手写 SVG，测量用自实现测地公式）；
  Python 侧仅在 GeoTIFF 功能引入 `rasterio`。
- **i18n**：新 UI 文案进 `locales/zh.json` + `en.json`，与现有 `t()` 用法一致。
- **GCJ-02**：所有新地图渲染路径沿用 `convertToGcj02`（provider 以 `amap` 开头时）。
  分析计算一律基于 WGS-84 原始数据，与显示坐标无关。
- **图层命名**：分析/筛选产生的新图层命名为 `<操作名>_<源图层名>[_<参数>]`。
- **验收方式**：每个功能完成后 `npm run typecheck` + `vitest`（stores 有测试目录）+
  Python 侧 `pytest`；涉及后端的功能补最小 pytest 用例。

## 自主决策记录

本设计在自主会话中完成，用户不在线。关键取舍：

1. 属性表放**底部面板**（GeoLibre 同款），FeaturePanel 保留为"识别"视图 —— 两者定位
   不同：右栏看单要素，底部看全表。
2. 缓冲区等米制运算用"图层质心所在 UTM 带"投影，跨洲图层精度下降在文档中声明，
   不做逐要素投影（性能优先）。
3. 符号化后的图层不再参与"选中变橙色"的整层着色（会覆盖用户样式），选中反馈只保留
   图层面板高亮。
4. KML 导出用 stdlib XML 手写（与现有 KML 解析同策略），不赌 fiona 的 KML driver。
5. 出图采用 `preserveDrawingBuffer: true` 初始化地图（桌面端性能损耗可忽略），
   避免截帧时序问题。
