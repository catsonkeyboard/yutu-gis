# 图层符号化（Styling）设计

日期：2026-07-11 · 优先级 P0 · 参考 GeoLibre "Styling Layers"

## 目标

geojson 图层支持三种符号化模式：单一符号、按字段分类（categorized）、按数值
分级（graduated），替代目前"全部蓝色/选中橙色"的固定配色。

## 数据模型

`layerStore.ts` 的 `Layer` 增加可选字段：

```ts
export interface LayerStyle {
  mode: 'single' | 'categorized' | 'graduated'
  // 基础符号（所有模式共用；categorized/graduated 只驱动颜色）
  fillColor: string        // 默认 '#0080ff'
  strokeColor: string      // 默认 '#0080ff'
  strokeWidth: number      // 默认 1.5
  pointRadius: number      // 默认 5
  fillOpacity: number      // 默认 0.4（乘以 layer.opacity）
  // categorized / graduated
  field?: string
  categories?: { value: string; color: string }[]   // categorized；value 统一转字符串比较
  breaks?: { max: number; color: string }[]          // graduated：升序上界；最后一档 max=Infinity 用 null 表示
  fallbackColor?: string                             // 未匹配值颜色，默认 '#999999'
}
```

新增 action：`setStyle(id: string, style: LayerStyle | undefined)`。
`style === undefined` 表示沿用现状默认渲染（含选中橙色高亮），保证向后兼容。

## 渲染（MapCanvas.renderLayers）

- 无 `style`：维持现有行为不变。
- 有 `style`：颜色 paint 属性改为表达式：
  - single：常量色。
  - categorized：`['match', ['to-string', ['get', field]], v1, c1, ..., fallback]`。
  - graduated：`['step', ['to-number', ['get', field], -Infinity 用极小数], c0, max0, c1, ...]`
    （step 首色为第一档，之后每个 max 作为阈值）。
- `fill-opacity = style.fillOpacity * layer.opacity`，线/点 opacity 沿用 layer.opacity。
- **选中高亮**：有 `style` 的图层不再被整层改色（会破坏用户样式）；
  `selectedLayerId` 快速路径 effect 跳过带 style 的图层。选中反馈保留
  LayerPanel 高亮与 FeaturePanel。（总览文档·决策 3）

## UI

- **入口**：LayerPanel 每个 geojson 图层行 actions 增加 `BgColorsOutlined` 样式
  按钮 → 打开悬浮样式面板（单实例，右侧、宽 320，`stores/stylePanelStore.ts`
  记录 open + targetLayerId）。再次点击或点关闭收起。
- **面板** `components/StylePanel/StylePanel.tsx`：
  - 模式 Radio：单一符号 / 分类 / 分级。
  - 基础符号区：填充色、描边色（antd ColorPicker）、描边宽、点半径、填充透明度
    （Slider）。另放**图层透明度** Slider（写 `layer.opacity`，补上缺失的 UI）。
  - 分类模式：字段 Select → "生成分类"按钮扫描唯一值（上限 30，超出提示且截断，
    按出现频次取前 30），从色带取色；每行 value + ColorPicker 可微调。
  - 分级模式：字段 Select（仅 numeric 字段）、分级数（3–9，默认 5）、分法
    Radio（等间距 / 分位数）、色带 Select；生成 breaks 后逐档可改色。
  - 所有修改即时 `setStyle`（地图实时预览），"重置"按钮恢复默认（setStyle(undefined)）。
- **色带**：`components/StylePanel/colorRamps.ts` 硬编码 6 条（Blues、Greens、
  Reds、Viridis、Spectral、GnYlRd），每条 9 个 hex，按分级数等距采样；分类模式
  循环取色。不引依赖。

## 派生逻辑（纯函数，可测）

`components/StylePanel/styleUtils.ts`：
- `scanUniqueValues(fc, field, cap)`
- `scanNumericField(fc, field): number[]`
- `computeBreaks(values, n, method): number[]`（等间距/分位数）
- `buildPaint(style, layerOpacity)` → { fillPaint, linePaint, circlePaint }
  （MapCanvas 与测试共用）

## 兼容与边界

- 字段在部分要素缺失：categorized 走 fallbackColor；graduated 用
  `['to-number', ['get', field], <首档下界>]` 提供缺省值，缺失/非数值要素落入
  首档（简化决策，不为缺失值单独包一层 case 表达式）。
- 工程文件（P0-6）自然序列化 `style`。
- GCJ-02 不受影响（仅颜色）。

## 测试

vitest 覆盖 styleUtils：唯一值扫描（含 cap）、等间距/分位数分级、buildPaint
三模式输出结构。手工验收：分类渲染省份 SHP、分级渲染人口字段、切底图后样式保留。
