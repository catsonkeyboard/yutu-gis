# 图层符号化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** geojson 图层支持单一/分类/分级符号化，样式面板实时预览。

**Architecture:** `LayerStyle` 类型进 layerStore（`setStyle` action）；表达式与分级逻辑进纯函数 `styleUtils.ts` + `colorRamps.ts`（vitest）；`renderLayers` 有 style 时用 `buildPaint` 产物；选中变色快速路径跳过带 style 图层。UI 为 LayerPanel 行内样式按钮 → 悬浮 StylePanel（`stylePanelStore` 记 open+layerId）。规格见 `docs/superpowers/specs/2026-07-11-layer-styling-design.md`。

**Tech Stack:** MapLibre match/step 表达式、antd ColorPicker/Slider。

---

### Task 1: colorRamps + styleUtils（TDD）

**Files:**
- Create: `src/renderer/src/components/StylePanel/colorRamps.ts`（6 条 9 色 ramp + `sampleRamp(name, n)` 等距采样/循环取色）
- Create: `src/renderer/src/components/StylePanel/styleUtils.ts`
- Test: `src/renderer/src/components/StylePanel/__tests__/styleUtils.test.ts`

```ts
export function scanUniqueValues(fc, field, cap=30): { values: string[]; truncated: boolean } // 频次降序
export function scanNumericValues(fc, field): number[]
export function computeBreaks(values, n, method: 'equal'|'quantile'): number[] // n-1 个上界阈值
export function buildPaint(style: LayerStyle, layerOpacity: number): { fill; line; circle } // MapLibre paint 对象
```

- [ ] 失败测试（唯一值频次/cap、等间距与分位数分级、三模式 buildPaint 结构）→ 实现 → 通过 → Commit

### Task 2: layerStore + renderLayers

**Files:**
- Modify: `src/renderer/src/stores/layerStore.ts`（`LayerStyle` 接口、`Layer.style?`、`setStyle`）
- Modify: `src/renderer/src/components/MapCanvas/MapCanvas.tsx`（styled 分支 + 快速路径跳过）

- [ ] store 测试（setStyle/清除）→ 实现 → typecheck → Commit

### Task 3: StylePanel UI

**Files:**
- Create: `src/renderer/src/stores/stylePanelStore.ts`（open + layerId）
- Create: `src/renderer/src/components/StylePanel/StylePanel.tsx`
- Modify: `src/renderer/src/components/LayerPanel/LayerPanel.tsx`（BgColorsOutlined 按钮）
- Modify: `src/renderer/src/components/MapCanvas/MapCanvas.tsx`（挂载面板）
- Modify: locales（`style.*`）

模式 Radio、基础符号（ColorPicker×2/宽度/半径/填充透明度 + 图层透明度 Slider）、
分类（字段+生成、每类调色）、分级（numeric 字段、3–9 类、等间距/分位数、ramp、逐档调色）、
重置按钮。所有变更即时 `setStyle`。

- [ ] 实现 + typecheck + 提交
