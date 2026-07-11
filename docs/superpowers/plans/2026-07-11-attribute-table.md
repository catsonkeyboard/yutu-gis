# 属性表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 底部可折叠列式属性表：排序、按值过滤、字段统计、筛选另存图层、地图联动。

**Architecture:** 纯逻辑进 `tableUtils.ts`（vitest 覆盖），面板状态进 `attributeTableStore`，UI 为 antd 虚拟 Table；`FeaturePanel` 的 `matchesSelected`/`getFeatureBounds` 上移到 `utils/geo.ts` 共用。

**Tech Stack:** React 19 + antd 6（Table `virtual`）+ zustand。规格见 `docs/superpowers/specs/2026-07-11-attribute-table-design.md`。

---

### Task 1: tableUtils 纯函数（TDD）

**Files:**
- Create: `src/renderer/src/components/AttributeTable/tableUtils.ts`
- Test: `src/renderer/src/components/AttributeTable/__tests__/tableUtils.test.ts`

接口：

```ts
export interface ColumnInfo { key: string; numeric: boolean; internal: boolean }
export interface DeriveResult { columns: ColumnInfo[]; truncated: boolean }
export type FilterOp = 'eq'|'ne'|'gt'|'gte'|'lt'|'lte'|'contains'|'empty'|'notEmpty'
export interface RowFilter { field: string; op: FilterOp; value: string }
export function deriveColumns(features: GeoJSON.Feature[], cap?: number): DeriveResult
export function applyFilter(features: GeoJSON.Feature[], filter: RowFilter | null, numericFields: Set<string>): GeoJSON.Feature[]
export function fieldStats(features: GeoJSON.Feature[], key: string, numeric: boolean):
  { count: number } & ({ min: number; max: number; mean: number; sum: number } | { unique: number })
export function displayValue(v: unknown): string   // 对象截断 120 字符
```

- [ ] 写失败测试：键并集/首现顺序/内部字段殿后/cap 截断、numeric 判定（混合类型→文本）、
      九种算子（数值比较用数值序）、empty 匹配 null/undefined/''、stats 数值与文本分支
- [ ] `npm test` 确认失败 → 实现 → 通过
- [ ] Commit `feat: 属性表纯逻辑 tableUtils`

### Task 2: 共享 geo 工具上移

**Files:**
- Modify: `src/renderer/src/utils/geo.ts`（新增 `getFeatureBounds`、`matchesSelectedProps`）
- Modify: `src/renderer/src/components/FeaturePanel/FeaturePanel.tsx`（改为 import，删本地副本）

- [ ] 平移函数（逻辑不变）→ typecheck 通过 → Commit `refactor: 共享要素匹配与边界工具`

### Task 3: store + 面板 + 布局接线

**Files:**
- Create: `src/renderer/src/stores/attributeTableStore.ts`（open/height/filter + setters）
- Create: `src/renderer/src/components/AttributeTable/AttributeTablePanel.tsx`
- Modify: `src/renderer/src/App.tsx`（Content 纵向 flex：MapCanvas + 面板，顶边拖拽 180–500）
- Modify: `src/renderer/src/components/Toolbar/Toolbar.tsx`（`TableOutlined` 开关）
- Modify: `src/renderer/src/locales/zh.json` / `en.json`（`attrTable.*`）

面板要点（按设计文档）：跟随 selectedLayerId；# 序号列 + 字段列（宽 140，numeric 右对齐，
排序器按类型）；头部过滤行（字段/算子/值）+ 计数 + 另存按钮（`筛选_<名>`）+ 关闭；
列头统计 Popover；行点击 → setSelectedFeatureProps + fitBounds；selectedFeatureProps
变化 → 高亮行（虚拟表不做 scrollIntoView，antd virtual 无行 DOM 保证——用
`scrollTo({ index })`）。非 geojson/无选中 → Empty。

- [ ] 实现三文件 + 接线 → `npm run typecheck` + `npm test` 通过
- [ ] Commit `feat: 底部属性表面板（排序/过滤/统计/另存）`
