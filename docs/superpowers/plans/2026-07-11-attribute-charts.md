# 属性图表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 属性表面板加"图表"页签：直方图（数值）、柱状图（top-20）、饼图（top-10+其它），手写 SVG 零依赖。

**Architecture:** 纯函数 `chartUtils.ts`（`histogramBins`/`topCounts`，vitest）+ `ChartsTab.tsx`（SVG 渲染）；`AttributeTablePanel` 头部加 Tabs，图表基于当前过滤后的行集。规格见 `docs/superpowers/specs/2026-07-11-attribute-charts-design.md`。

---

### Task 1: chartUtils（TDD）
- Create: `src/renderer/src/components/AttributeTable/chartUtils.ts` + `__tests__/chartUtils.test.ts`
- `histogramBins(values, n): { x0, x1, count }[]`（等宽；全相同值单桶；空数组 []）
- `topCounts(values, n): { items: {label, count}[], otherCount }`（频次降序，空值跳过）
- [ ] 失败测试 → 实现 → 通过 → Commit

### Task 2: ChartsTab + 面板集成
- Create: `src/renderer/src/components/AttributeTable/ChartsTab.tsx`
- Modify: `AttributeTablePanel.tsx`（Tabs：表格/图表）
- Modify: locales（`attrTable.chart*`）
- [ ] 实现 + typecheck → Commit
