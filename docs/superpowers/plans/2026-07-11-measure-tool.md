# 测量工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 距离/面积测量：点击加点、双击结束、右键撤销、实时读数、多段保留、退出清理。

**Architecture:** 独立于 MapboxDraw：`measureStore`（mode/vertices/completed，全 WGS-84）+ `MeasureLayer.tsx`（自管 `measure-` source/layers + 事件）+ `MeasureBanner`（顶部读数条）。计算在 `utils/geodesy.ts`（haversine + 球面面积，vitest）。GCJ-02：渲染前正变换，`e.lngLat` 存储前用新增 `gcj02ToWgs84` 逆解。规格见 `docs/superpowers/specs/2026-07-11-measure-tool-design.md`。

---

### Task 1: geodesy 纯函数 + gcj02 逆变换（TDD）

**Files:**
- Create: `src/renderer/src/utils/geodesy.ts`（`haversineDistance(a,b)` 米、`pathLength(coords)`、`sphericalArea(ring)` 米²、`formatDistance(m)`、`formatArea(m2)`）
- Modify: `src/renderer/src/utils/coordTransform.ts`（`gcj02ToWgs84` 迭代逆解）
- Test: `src/renderer/src/utils/__tests__/geodesy.test.ts`

- [ ] 失败测试（京沪距离 ±0.5%、1°×1° 球面四边形面积、格式分档、GCJ 逆变换往返 <1e-6°）→ 实现 → 通过 → Commit

### Task 2: measureStore + MeasureLayer + Toolbar

**Files:**
- Create: `src/renderer/src/stores/measureStore.ts`
- Create: `src/renderer/src/components/MapCanvas/MeasureLayer.tsx`（含读数 Banner）
- Modify: `src/renderer/src/components/MapCanvas/MapCanvas.tsx`（挂载、click/右键/hover guard：measureModeRef）
- Modify: `src/renderer/src/components/Toolbar/Toolbar.tsx`（测距/测面按钮，激活时 drawMode→off，互斥）
- Modify: locales（`measure.*`；toolbar.measure / measureArea 已有键）

store：`{ mode:'off'|'distance'|'area', vertices, completed[], setMode, addVertex, undoVertex, finishSegment, clearAll }`；切 mode 清空全部。
MeasureLayer：click 加点（Amap 下逆变换），dblclick 结束段（去重末点），contextmenu 撤销，mousemove 橡皮筋；线 #fa8c16 虚线、面半透明、顶点白边圆点；渲染时按 provider 正变换；style.load 重挂。

- [ ] 实现 + typecheck + tests → Commit `feat: 距离/面积测量工具`
