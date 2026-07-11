# 降水雷达时间滑块动画设计

日期：2026-07-11 · 优先级 P2 · 参考 GeoLibre "Time Slider" 插件

## 目标

把数据监控中的"降水雷达"（RainViewer）从单帧升级为可播放的时序动画：过去
~2 小时实况帧 + 短时预报帧，悬浮播放条控制播放/暂停/拖动。

## 数据

RainViewer weather-maps.json 本身返回 `radar.past[]`（约 13 帧，10 分钟间隔）与
`radar.nowcast[]`（约 3 帧预报）。现后端 `GET /monitor/rainviewer` 只取最后一帧
（services/monitor.py），改为返回全部：

```
GET /monitor/rainviewer
→ { "frames": [ { "time": 1730000000, "template": "https://tilecache.rainviewer.com/v2/radar/<path>/256/{z}/{x}/{y}/2/1_1.png", "nowcast": false }, ... ] }
```

保留字段兼容：继续返回顶层 `template`（最后实况帧），MonitorLayer 老逻辑可渐进
迁移。

## 状态（monitorStore 扩展）

```ts
radarFrames: { time: number; template: string; nowcast: boolean }[]
radarIndex: number          // 当前帧
radarPlaying: boolean
setRadarFrames / setRadarIndex / setRadarPlaying
```

雷达开关关闭时清空 frames、停止播放（沿用"toggle off 清缓存"约定）。
帧列表每 10 分钟随现有雷达刷新周期更新（刷新后 index 重置到最后实况帧）。

## 渲染（MonitorLayer）

- 为**每一帧**添加 raster source/layer（`monitor-radar-f{i}`，插入位置沿用现有
  raster 规则），仅当前帧 `raster-opacity: 0.75`，其余 0（opacity 切换避免
  add/remove 闪烁；~16 帧源的内存可接受，瓦片懒加载）。
- 播放：`setInterval` 600ms 递进 index 循环；MapCanvas 不参与，逻辑在
  MonitorLayer 内 useEffect。
- 帧切换用 `setPaintProperty`，不重建。style.load 重建时按当前 index 恢复。

## UI

`components/MapCanvas/RadarTimelineBar.tsx`：雷达开关开启时显示在地图底部居中
（StatusBar 上方）的悬浮条：播放/暂停按钮、Slider（marks 在整点）、当前帧时间
（本地时区 HH:mm，预报帧加"预报"Tag）。拖动 Slider 时暂停播放。

## 测试

vitest：store 帧推进/循环/关闭清理。手工：播放流畅、切底图后恢复、Amap 底图
（WGS-84 栅格固有偏移，维持现有 caveat）。
