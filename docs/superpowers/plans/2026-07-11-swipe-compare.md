# 卷帘对比 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 选定图层做卷帘：右侧副地图（同底图 + 仅卷帘层）经 CSS clip-path 裁剪，拖动分割线对比；主地图隐藏卷帘层。

**Architecture:** `swipeStore`（enabled/layerId/position）；`SwipeOverlay.tsx`（副 maplibre 实例 interactive:false、主图 move 单向 jumpTo 同步、clip-path inset、拖拽分割线、图层渲染复用 buildPaint/convertToGcj02）；MapCanvas.renderLayers 跳过卷帘层（读 store getState + effect 触发重渲染）；Toolbar `PicCenterOutlined` Popover 选层开关，绘制/测量激活时禁用。规格见 `docs/superpowers/specs/2026-07-11-swipe-compare-design.md`。

---

- [ ] Task 1: swipeStore（vitest：图层删除自动退出由组件层处理）→ Commit
- [ ] Task 2: SwipeOverlay + MapCanvas 集成 + Toolbar 入口 + locales → typecheck → Commit
