# 卷帘对比（Swipe）设计

日期：2026-07-11 · 优先级 P2 · 参考 GeoLibre "Swipe 插件"

## 目标

选择一个图层做"卷帘层"，拖动垂直分割线左右对比：左侧显示不含卷帘层的地图，
右侧显示卷帘层（叠在同一底图上）。用于影像对比、新旧数据对比。

## 方案（决策）

MapLibre 单地图无法按屏幕区域裁剪图层。采用 **双地图 + CSS clip-path** 方案
（maplibre-gl-compare 同原理，自实现 ~200 行避免依赖）：

- 主地图保持现状，但卷帘激活时**隐藏卷帘层**（renderLayers 过滤）。
- 叠加一个只读副地图（同容器绝对定位、同 style/provider），只渲染底图 + 卷帘层，
  容器 `clip-path: inset(0 0 0 <x>px)`（只露出分割线右侧）。
- 相机双向同步：主图 `move` → `jumpTo` 副图（副图关闭交互 `interactive: false`，
  单向同步即可，无回环）。
- 分割线：绝对定位竖条 + 拖拽手柄，拖动更新 clip-path。

## 状态

`stores/swipeStore.ts`：`{ enabled, layerId: string | null, position: number (0-1), setEnabled, setLayer, setPosition }`。
卷帘层被删除时自动退出（layerStore 订阅或 SwipeLayer effect 校验）。

## UI

- 工具栏 `PicCenterOutlined` 按钮开关；开启时弹出小 Popover 选卷帘层
  （geojson + raster 均可选），选定后显示分割线。
- 关闭（再点按钮 / Popover 内关闭）→ 副地图销毁、主图恢复渲染卷帘层。

## 实现位置

`components/MapCanvas/SwipeOverlay.tsx`（挂在 MapCanvas 内，拿 mapInstance）：
负责副地图生命周期、相机同步、分割线 DOM；副地图图层渲染复用 renderLayers 的
单图层版本（抽出 `renderSingleLayer(map, layer, provider)` 供两处调用）。
MapCanvas.renderLayers 增加参数跳过 swipe layerId。

## 边界

- GCJ-02：副地图 provider 与主图一致，转换逻辑复用，无额外处理。
- 双 WebGL 上下文内存翻倍：可接受（桌面）；swipe 关闭即销毁副图。
- 绘制/测量模式激活时禁用卷帘按钮（交互冲突）。

## 测试

手工验收为主：影像 vs 街道底图上的 mbtiles 对比、拖动流畅、退出恢复。
store 行为写 vitest。
