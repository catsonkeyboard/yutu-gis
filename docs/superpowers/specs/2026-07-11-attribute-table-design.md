# 属性表（Attribute Table）设计

日期：2026-07-11 · 优先级 P0 · 参考 GeoLibre "Attribute Table"

## 目标

为选中的 geojson 图层提供列式属性表：每行一个要素、每列一个字段，支持排序、
按值过滤、字段统计、筛选结果另存图层，并与地图点选/FeaturePanel 双向联动。
现有 `FeaturePanel`（右栏）只展示"要素名称列表 + 单要素键值对"，无法横向比较字段。

## 非目标

- 字段编辑 / 字段计算器（GeoLibre 有，本轮不做）
- 列管理（隐藏/重排/重命名）
- 图表页签（P1-8 单独文档，但本设计预留 Tabs 结构）

## UI

- **位置**：地图 Content 区底部的可折叠面板（`App.tsx` 中 Content 改为纵向 flex：
  MapCanvas 上、属性表下），默认高度 260px，顶边可拖拽调整（180–500px），
  关闭时不渲染。
- **入口**：
  - 工具栏 `TableOutlined` 按钮，开关面板（type=primary 表示打开）。
  - LayerPanel 行内不加按钮（保持简洁），面板自动跟随 `selectedLayerId`。
- **头部栏**：图层名 + 要素计数（含"筛选后 n/总数"）、过滤控件、
  "筛选结果另存图层"按钮、关闭按钮。
- **表格**：antd Table，`size="small"`，`virtual` + 固定行高，禁用分页
  （虚拟滚动支撑 10 万行）。首列为 `#`（要素序号），其余列为字段。
- 无选中图层或选中的是 raster 图层时显示 Empty（"请选择矢量图层"）。

## 数据模型与状态

新建 `stores/attributeTableStore.ts`：

```ts
interface AttributeTableState {
  open: boolean
  height: number
  filter: { field: string; op: FilterOp; value: string } | null
  setOpen(open: boolean): void
  setHeight(h: number): void
  setFilter(f: ...): void
}
type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'empty' | 'notEmpty'
```

行数据、列、统计均在组件内 `useMemo` 派生，不进 store（图层切换即失效）。

## 组件

`components/AttributeTable/AttributeTablePanel.tsx`

- **列推导**：扫描全部要素的 `properties` 键并集，按首次出现顺序；列数上限 60
  （超出丢弃并在头部提示）。以 `_` 开头的内部字段排在最后、灰色显示。
- **列类型**：对每列采样非空值判定 numeric（全部可 `Number()`）与否，决定排序
  比较器与统计可用性。
- **排序**：antd 列 `sorter`，客户端排序。
- **过滤**：头部一行 `Select(字段) + Select(算子) + Input(值)`，应用于行集；
  numeric 字段的比较算子按数值比较。`empty/notEmpty` 不需要值输入。
- **字段统计**：列头下拉菜单（antd Table `filterDropdown` 不合适，用列头右侧
  小图标 Popover）：numeric 列显示 count/min/max/mean/sum；文本列显示
  count/唯一值数。基于**过滤后的行集**计算。
- **行 ↔ 地图联动**：
  - 行点击 → `setSelectedFeatureProps(row.props)` + `requestFitBounds`（复用
    FeaturePanel 的 `getFeatureBounds`，抽到 `utils/geo.ts` 导出共用）。
  - `selectedFeatureProps` 变化（地图点选）→ 高亮匹配行并 `scrollIntoView`
    （复用 FeaturePanel 的 `matchesSelected`，同样抽出共用）。
- **另存图层**：把过滤后的要素集合 `addLayer` 为新图层，命名
  `筛选_<源图层名>`，成功后 message + 选中新图层。过滤为空时按钮禁用。

## 错误与边界

- 要素 properties 为 null → 视为空对象。
- 混合类型列（数字+文本）→ 按文本处理。
- 值为对象/数组 → `JSON.stringify` 截断 120 字符显示，不参与 numeric 判定。

## 测试

- vitest：列推导（键并集/顺序/上限）、numeric 判定、过滤算子（含数值比较与
  empty）、统计函数。逻辑抽成纯函数 `components/AttributeTable/tableUtils.ts`。
- 手工验收：导入 SHP → 打开属性表 → 排序/过滤/统计 → 筛选另存 → 地图点选联动。
