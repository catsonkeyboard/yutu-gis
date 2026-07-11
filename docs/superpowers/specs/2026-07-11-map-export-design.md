# 地图出图设计（PNG 导出 / 复制剪贴板）

日期：2026-07-11 · 优先级 P1 · 参考 GeoLibre "Export to PNG / Copy to Clipboard"

## 目标

把当前地图视口导出为 PNG 文件或复制到剪贴板，含数据源署名（attribution）。
打印布局排版器（图例/标题块/比例尺输入）不在本轮范围。

## 前置改动

MapCanvas 初始化 Map 时加 `canvasContextAttributes: { preserveDrawingBuffer: true }`
（MapLibre v5 参数；总览·决策 5）。桌面 GPU 下性能损耗可忽略，换取任意时刻可读
canvas。

## 交互

- 工具栏 `CameraOutlined` 按钮 → antd Dropdown 两项：**导出 PNG…**、**复制到剪贴板**。
- 导出：`saveFileDialog([png])` → 合成 → 写文件 → message.success（含路径）。
- 复制：合成 → `navigator.clipboard.write([ClipboardItem])` → message.success。

## 合成（`utils/mapExport.ts`）

1. `map.getCanvas()` 为源；新建 2D canvas 同尺寸 drawImage。
2. 底部右侧绘制 attribution 文本（从当前 provider 推导：OSM "© OpenStreetMap
   contributors"、Google/Amap 对应署名；tileProviders.ts 增加每 provider 的
   attribution 字符串导出），白底黑字小号，半透明背景条。
3. `canvas.toBlob('image/png')`。

## 文件写入

现有 `writeFile(path, content: string)` IPC 只支持文本。新增 IPC
`writeFileBinary(path, data: ArrayBuffer)`（main/ipc.ts + preload 类型），
Blob→ArrayBuffer 后传主进程 `fs.writeFile(Buffer)`。

## 边界

- 剪贴板 API 在 Electron renderer 可用（Chromium ≥ 76 支持 ClipboardItem）；失败
  时 message.error 引导用导出。
- 悬浮面板/DOM 覆盖物（测量读数、面板）不会进入导出图（只取 WebGL canvas），
  MapboxDraw 绘制物与 measure 图层在 canvas 内，会包含 —— 符合预期。
- Amap 底图导出的是 GCJ-02 视图，属正常显示结果，无需处理。

## 测试

手工验收为主（视觉输出）：OSM/Amap 底图各导出一张、检查署名、剪贴板粘贴到
预览/微信可用。`mapExport.ts` 的 attribution 推导写 vitest。
