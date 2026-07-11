# 矢量分析工具箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端 shapely 矢量运算（10 种 op）+ 前端悬浮分析面板，结果生成新图层。

**Architecture:** `python/services/analysis.py` 纯函数 `run_analysis(op, primary, secondary, params)`；路由 `python/routers/analysis.py` 挂 `/analysis`；前端 `AnalysisPanel` 悬浮面板 + `analysisPanelStore`，与瓦片/OSM 面板互斥。规格见 `docs/superpowers/specs/2026-07-11-vector-analysis-design.md`。

**Tech Stack:** shapely 2（make_valid/STRtree/unary_union）、pyproj（UTM 投影）、FastAPI；React + antd。

---

### Task 1: 后端 analysis 服务（TDD）

**Files:**
- Create: `python/services/analysis.py`
- Create: `python/tests/test_analysis.py`
- Create: `python/routers/analysis.py`
- Modify: `python/main.py`（include_router）

核心接口：

```python
def run_analysis(op: str, primary: dict, secondary: dict | None, params: dict) -> dict:
    """返回 FeatureCollection（顶层附 skipped: int）。未知 op / 缺参数抛 ValueError。"""
```

- 输入要素 `make_valid` 清洗；仍无效/空 → 跳过并计入 skipped
- buffer/simplify：图层质心 UTM 带投影往返（±84° 纬度外退化 EPSG:3857）
- overlay 类：叠加层仅取 Polygon/MultiPolygon，STRtree 索引加速
- intersection 属性合并：叠加层键加 `b_` 前缀
- union = 两层要素 append；dissolve 按字段 unary_union
- 空结果几何丢弃（不计 skipped）

- [ ] 写失败测试（每 op 一例 + 负缓冲 + 无效几何 + 未知 op）→ 实现 → `pytest tests/test_analysis.py` 通过
- [ ] 路由 `POST /analysis/run`（pydantic：op/primary/secondary/params），400 透传 ValueError
- [ ] Commit `feat: 矢量分析后端（buffer/clip/overlay/dissolve 等 10 种运算）`

### Task 2: 前端面板与接线

**Files:**
- Create: `src/renderer/src/stores/analysisPanelStore.ts`（open + setOpen）
- Create: `src/renderer/src/components/Analysis/AnalysisPanel.tsx`
- Modify: `src/renderer/src/services/api.ts`（`runAnalysis()`）
- Modify: `src/renderer/src/components/Toolbar/Toolbar.tsx`（`ExperimentOutlined` 开关，三面板互斥）
- Modify: `src/renderer/src/components/MapCanvas/MapCanvas.tsx`（挂载面板）
- Modify: locales（`analysis.*`）

面板要点：运算 Select（分组），主/叠加图层 Select（geojson），动态参数
（距离/容差 InputNumber、dissolve 字段 Select、谓词 Select），执行按钮 loading；
>50,000 要素 Modal.confirm；结果 addLayer `<操作名>_<主图层名>[_<参数>m]` + 选中
+ fitBounds；skipped>0 warning；空结果提示不建层。

- [ ] 实现 + `npm run typecheck` 通过
- [ ] Commit `feat: 矢量分析悬浮面板`
