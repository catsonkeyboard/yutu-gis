# 快赢四件套 + 点密度渲染 + 字段计算器 设计

日期：2026-07-11 · 六项小中型功能合并设计（实现按节独立提交）

## 1. 图层重命名 UI

`layerStore.rename` 已存在。LayerPanel 图层名**双击**进入行内编辑
（Input，Enter/失焦提交，Esc 取消，空名不提交）。编辑态屏蔽行点击选层。

## 2. 图层标注（Labels）

- **前置**：底图样式（tileProviders.getTileStyle）没有 `glyphs`，symbol 文字
  无法渲染。统一加 `glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'`
  （已验证可用），字体栈 `['Noto Sans Regular']`；中文依赖 MapLibre 默认
  `localIdeographFontFamily`（本地渲染 CJK，无需字形服务）。
- `LayerStyle` 增加：`labelField?: string`、`labelSize?: number`(默认 12)、
  `labelColor?: string`(默认 '#333333')。标注独立于符号化模式（default 渲染的
  图层也可配——**决策：标注设置放 StylePanel 底部独立区**，选择字段即生效，
  layer.style 可能只含标注字段 + 基础默认值）。
- renderLayers：`labelField` 存在时追加 `user-{id}-label` symbol 层：
  `text-field: ['to-string',['get',field]]`、size/color、白色 halo 1.2、
  `text-optional`+允许压盖关闭（默认避让）。点击选层正则不匹配 label 层，无影响。
- 兼容：无 style 的图层配标注 → setStyle 写入 DEFAULT_STYLE + label 字段，
  mode 'single' 目视效果与默认渲染一致（同色同宽）。

## 3. SQL 查询历史 + 结果导出 CSV

- 历史：`sqlPanelStore.history: string[]`（会话内，上限 20，成功执行后头插、
  连续去重）。UI：HistoryOutlined Dropdown，条目显示截断首行，点击回填编辑器。
- 导出：显示端截断 1000 行，导出必须走后端全量：
  `POST /sql/export { sql, path }` → 白名单校验后
  `COPY (<sql>) TO 'path' (FORMAT CSV, HEADER)`，返回 `{ path, rows }`
  （rows 用 COPY 的返回计数）。UI：结果工具行"导出 CSV"→ saveFileDialog。

## 4. 最近打开的工程

- config 增加 `recentProjects: string[]`（上限 5）。打开/保存工程成功后头插
  去重，`config:update` 持久化；启动 loadConfig 读入 App 本地 state。
- 工具栏 FolderOpenOutlined 改为 Dropdown：`打开工程…` + 分隔 + 最近条目
  （显示文件名，tooltip 全路径）。点击条目直接按路径打开（`handleOpenProject`
  抽出 `openProjectFromPath(path)` 复用；文件不存在 → 报错并从最近列表移除）。
  File 菜单 menu:open 行为不变。

## 5. 点聚类 + 热力图（LayerStyle 新模式）

- `mode` 扩展 `'cluster' | 'heatmap'`（仅对点要素有意义；MapLibre cluster 源
  会丢弃非点要素——UI 提示"仅点要素参与"）。新参数：`clusterRadius?: number`
  (默认 50)、`heatRadius?: number`(默认 20)。
- renderLayers：
  - cluster：source 加 `cluster: true, clusterRadius`；三层：
    `-cluster`（circle，size/color 按 point_count step：<10 蓝 / <100 黄 / ≥100 红）、
    `-cluster-count`（symbol 数字，依赖 #2 的 glyphs）、
    `-point`（未聚类点，复用基础符号）。
  - heatmap：`user-{id}-heat` heatmap 层（radius=heatRadius、默认色带、
    opacity 随 layer.opacity）。
  - 两模式下不再添加 fill/line 层。
- MapCanvas 点击处理：命中 `user-{id}-cluster` → `getClusterExpansionZoom`
  放大展开（不触发选层）。
- StylePanel：模式 Radio 扩为 5 项；cluster/heatmap 显示各自参数 Slider。
- 卷帘副地图沿用基础渲染（不支持这两种模式，文档声明）。
- buildPaint 不变（新模式在 renderLayers 直接建层）。

## 6. 字段计算器（DuckDB 表达式）

- 属性表头部"字段计算"按钮 → Modal：新字段名 + 表达式（DuckDB SQL 标量表达式，
  可引用现有字段与空间函数如 `ST_Area(geom)`、`round("pop"/10000, 2)`）。
- 后端 `POST /sql/calculate { name, geojson, expression, field }`：
  注册临时表（唯一名，算完删除）→
  `SELECT * EXCLUDE (geom[, OGC_FID]), (<expr>) AS <field>, geom FROM t` →
  组装 FeatureCollection 返回（OGC_FID 不进属性）。spatial 不可用时对
  geom_json 路径同理（表达式里不能用空间函数）。表达式语法错误 → 400 detail
  透传（DuckDB 报错信息含位置）。
- 前端：成功后 `layerStore.setSource(id, fc)` 整体替换图层源（新增 action），
  属性表/地图自动刷新。字段重名 → 后端拒绝（400）。

## 测试

- pytest：/sql/export（COPY 全量 + 白名单拒绝）、calculate_field（普通表达式/
  空间函数/坏表达式/重名字段/属性保序）。
- vitest：sqlPanelStore 历史去重上限、layerStore.setSource。
- 手工：标注中英文混排、聚类点击展开、热力图透明度、最近工程跨重启。
