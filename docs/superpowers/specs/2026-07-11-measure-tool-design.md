# 测量工具设计

日期：2026-07-11 · 优先级 P0 · 参考 GeoLibre "Measure tool"

## 目标

工具栏提供距离/面积测量：地图连续点击加点，实时显示测地距离（km/m）或球面
面积（km²/m²/ha），双击结束，可连续多段测量，退出清理。

## 与绘制工具的关系（决策）

**不复用 MapboxDraw**。绘制工具与 drawStore/保存图层 Modal 深度耦合，测量借用会
触发保存流程。测量用独立的轻量实现：自管 GeoJSON source + 图层 + 点击事件。

## 状态

`stores/measureStore.ts`：

```ts
interface MeasureState {
  mode: 'off' | 'distance' | 'area'
  vertices: [number, number][]      // 当前正在测的线/面顶点（WGS-84）
  result: { value: number; unit: string } | null   // 派生显示由组件算，store 存原始
  setMode(m): void   // 切换时清空 vertices
  addVertex(c): void
  popVertex(): void  // 右键/退格撤销上一点
  finish(): void     // 双击：保留图形与读数，vertices 清空开始下一段? —— 简化：finish 即冻结当前段并入 completed
  completed: { kind: 'distance'|'area'; coords: [number,number][]; value: number }[]
  clearAll(): void
}
```

简化决策：`completed` 保存已完成的测量段（地图上保留显示），"清除"按钮全清；
切换 mode 或关闭测量时全清。

## 地图交互（MapCanvas 内新组件 `MeasureLayer.tsx`）

- `measure-` 前缀的 source/layers：line（虚线 `#fa8c16`）、fill（面测量半透明）、
  vertex circle、以及跟随鼠标的橡皮筋段。
- mode ≠ off 时：
  - 禁用地图点选（`map.on('click')` 现有 handler 增加 `measureModeRef` guard，
    与 drawModeRef 同模式）。
  - click 加顶点；dblclick 结束当前段（防止 dblclick 触发两次 click：结束时去掉
    最后一个重复顶点）；contextmenu 撤销上一点（此时屏蔽右键菜单，现有
    handleContextMenu 加 guard）。
  - mousemove 更新橡皮筋并实时计算读数。
  - cursor: crosshair。
- GCJ-02：渲染坐标经 `convertToGcj02` 转换后写入 source；store 中始终 WGS-84。
  （点击事件拿到的是屏幕坐标对应的底图坐标系位置；Amap 底图下 `e.lngLat` 是
  GCJ-02 —— 需逆转换存储。`coordTransform.ts` 目前只有正向转换，补 `gcj02ToWgs84`
  迭代逆解，~20 行。）

## 计算（`utils/geodesy.ts`，纯函数）

- `haversineDistance(a, b)`：米。累加折线段。
- `sphericalArea(ring)`：球面多边形面积（Karney/turf 同源的球面超额公式），米²。
- 格式化：距离 <1000m 显示 m，否则 km（2 位小数）；面积 <10⁴ m² 显示 m²，
  <10⁶ 显示 ha，否则 km²。

## UI

- 工具栏绘制按钮组后新增两个按钮：`ColumnWidthOutlined` 测距、
  `ExpandOutlined` 测面（激活态 primary；与绘制模式互斥——激活测量时将
  drawMode 置 off，反之亦然）。
- 悬浮读数条（地图顶部居中，仿 DrawHintBanner）：当前模式、实时读数、
  "清除"与"退出"按钮、操作提示（单击加点·双击结束·右键撤销）。

## 测试

vitest：haversine（已知两城距离 ±0.5%）、球面面积（已知多边形）、格式化分档、
gcj02ToWgs84 逆转换往返误差 < 1e-6°。手工：Amap 底图下测量与 OSM 底图结果一致。
