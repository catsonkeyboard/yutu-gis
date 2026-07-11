# 工程文件（.yutugis）设计

日期：2026-07-11 · 优先级 P0 · 参考 GeoLibre "Projects (.geolibre.json)"

## 目标

把当前工作区（图层 + 样式 + 地图状态）保存为单个 `.yutugis` JSON 文件，可重新
打开恢复。接通工具栏"打开/保存"两个空壳按钮与 File 菜单。

## 文件格式

```jsonc
{
  "app": "yutugis-project",
  "version": 1,
  "savedAt": "2026-07-11T12:00:00Z",
  "map": { "center": [lon, lat], "zoom": 8, "provider": "osm" },
  "layers": [
    { "kind": "geojson", "id": "...", "name": "...", "visible": true, "opacity": 1,
      "style": { ... } | null,
      "source": { FeatureCollection 内联 } },
    { "kind": "raster", "id": "...", "name": "...", "visible": true, "opacity": 1,
      "path": "/abs/path/to.mbtiles" }   // 重新打开时重注册
  ]
}
```

- geojson 图层内联全部数据（自包含，移动文件仍可打开）。
- raster（离线地图）只存 `path`：数据量太大不可内联。打开时重新
  `POST /tiles/sources { path }` 注册；文件缺失则该图层跳过并警告。
- **前置改动**：`importOfflineMap` 需把源文件 `path` 存入 layer（新增
  `Layer.sourcePath?: string`），否则保存时无从取路径。GeoTIFF（P2-10）同机制。

## 交互

- **保存**：工具栏 Save 按钮 / 菜单 File→保存工程 → `saveFileDialog`
  （扩展名 yutugis）→ 序列化 → `writeFile`。无图层也允许保存（只存视图）。
- **打开**：Open 按钮 / File→打开工程 → `openFileDialog` → `readFile` → 校验
  `app === 'yutugis-project'` 与 version → 若当前有图层，Modal.confirm
  "打开工程将替换当前图层" → `layerStore.reset()` → 逐图层恢复（raster 先重注册）
  → 恢复 map 状态。MapCanvas 初始化后修改 center/zoom state 不会驱动地图跳转，
  且 `fitBoundsRequest` 无法精确恢复 zoom —— 因此 mapStore 新增
  `jumpToRequest: { center, zoom, timestamp }` + `requestJumpTo(center, zoom)`，
  MapCanvas 监听执行 `map.jumpTo`（书签功能 P1-7 复用该机制）。
- **菜单**：`menu.ts` File 菜单增加"打开工程/保存工程"，走现有 `onMenuAction`
  通道（action: 'open-project' / 'save-project'），App.tsx 监听调用同一处理函数
  （现有 onMenuAction listener 已有骨架）。

## 实现位置

- `src/renderer/src/services/project.ts`：`serializeProject()`、
  `loadProject(json): Promise<{ warnings: string[] }>`（纯逻辑 + store 调用，
  文件对话框留在 App.tsx）。
- raster 重注册复用 `importOfflineMap` 内部逻辑（抽出 `registerTileSource(path)`
  返回 layer source 数据，导入与工程恢复共用）。

## 边界与错误

- JSON 解析失败 / app 标识不符 → message.error("不是有效的舆图工程文件")。
- version > 1 → 提示用新版应用打开（向前兼容拒绝）。
- raster path 失效 → 收集 warning，打开完成后 message.warning 列出跳过项。
- 大工程（内联几十 MB）：JSON.stringify 同步可接受（桌面端）；不做压缩（YAGNI）。

## 测试

vitest：serialize→load 往返（mock electronAPI 与 fetch）、版本拒绝、raster 缺失
跳过。手工：保存含样式/raster 的工程 → 重启应用 → 打开恢复。
