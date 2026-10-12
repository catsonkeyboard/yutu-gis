# 工程侧车与懒加载（图层数据链路优化 · 阶段2）设计

日期：2026-10-12 · 前置：阶段1（SQL 同步版本跳过，已完成）。解决"大工程保存"：
10 万+要素图层内联进单个 `.yutugis` JSON → 渲染进程 `JSON.stringify` 长阻塞 +
数百 MB 单文件 + 加载时全量 `JSON.parse` 阻塞。

## 目标

- 保存：大图层 geojson 落**侧车文件**（Python 原子写），`.yutugis` 只存小元数据；
  序列化分块让出主线程；未变更图层零重写（增量保存）。
- 加载：元数据秒读；**可见图层**并行按需取数；**隐藏图层**零加载，首次开启
  可见时再取（懒加载）。
- 兼容：v1 工程文件照常打开（全内联）；小图层（≤2000 要素）仍内联，小工程
  保持单文件。

## 非目标（YAGNI）

- Python 内容寻址图层库 / SQL 注册视图化（阶段3）。
- `.yutugis` 打包成单文件容器（ZIP）——维持"元数据 + files 目录"双轨，同
  QGIS 惯例；侧车缺失走 warning（与 raster 缺失同 UX）。
- 隐藏图层懒加载期间的手动取消；GCJ-02 转换不变（store 恒为 WGS-84）。

## 格式 v2

```
ProjectFile {
  ..., version: 2,
  filesDir?: string        // 侧车目录名，相对工程文件所在目录，如 "demo.files"
                           // （仅存在侧车图层时写入）
}
ProjectGeojsonLayer {
  kind: 'geojson', id, name, visible, opacity, style?,
  source?: FeatureCollection   // 内联（≤ INLINE_FEATURE_MAX = 2000 要素）
  sourceFile?: string          // 侧车文件名（"<layerId>.geojson"），与 source 互斥
}
```

侧车绝对路径 = `dirname(工程路径) / filesDir / sourceFile`。layer id 为
`nanoid()`（URL 安全），直接作文件名。

## 保存 `saveProject(filePath)`（services/project.ts）

1. 模块态 `lastSavedPath` + `lastSavedVersions: Map<layerId, sourceVersion>`
   （loadProject 成功后 seed）——同路径重保存时，版本未变的大图层零重写；
   路径变化（另存为）→ 全量重写。
2. 大图层（>2000 要素）且需写入：`fcToBlob()` 分块序列化——逐要素
   `JSON.stringify` 进 parts 数组，每 2000 个 `await setTimeout(0)` 让出主线程，
   `new Blob(parts)` 交给 fetch（避免拼整段大字符串）→ `POST /project/file?path=`
   （raw body）。
3. 元数据（小）最后写：`window.electronAPI.writeFile`。侧车先写、元数据后写，
   保证元数据不引用缺失文件。
4. 成功后 `POST /project/cleanup { dir, keep }` 清理侧车目录中不再被引用的
   `*.geojson`（图层缩小回落内联、图层删除产生的孤儿）。

## 加载 `loadProject(json, projectPath?)`

- v1：行为不变（全内联）。
- v2 侧车图层，按 `visible` 分流：
  - 可见：并行 `GET /project/file?path=`（并发上限 4）填充 source 后入 store；
    失败 → warning「图层无法恢复（路径）」，跳过该图层（同 raster 先例）。
  - 隐藏：入 store 时 source 为空 FC 占位 + `Layer.lazy = { path }`（侧车
    绝对路径，同时写入 `sourcePath`），**不发请求**。
- 成功后 seed `lastSavedVersions` / `lastSavedPath`。
- `projectPath` 缺省（测试/旧调用方）且文件含侧车图层 → warning。

## 懒加载（隐藏图层首次可见）

- `Layer.lazy?: { path: string }`（绝对路径）；layerStore 新增 `clearLazy(id)`。
- `services/project.ts: loadLazyLayers(layers)`：对 `visible && lazy` 图层
  GET 侧车 → `setSource` + `clearLazy`（`sourceVersion` 正常递增，SQL 同步
  语义不受影响）；模块级 in-flight Set 防重复请求。
- `MapCanvas` 新增 effect：`layers` 变化时调 `loadLazyLayers`（renderLayers
  本就只为 visible 图层建 source，占位空 FC 无渲染成本，数据到位后 layers
  变化触发重渲染）。

## 后端 `python/routers/project.py`（prefix `/project`）

```
POST /project/file?path=  raw JSON body → 同目录 tmp + os.replace 原子写（自动建目录）
GET  /project/file?path=  → FileResponse(application/json)；不存在 404
POST /project/cleanup {dir, keep[]} → 删 dir 下不在 keep 的 *.geojson，返回 {removed}
```

路径为渲染进程传来的绝对路径，无白名单（单机桌面应用，同 `/sql/files` 先例）。

## 边界

- 用户只移动 `.yutugis` 不移动 files 目录 → 加载 warning 指明缺失路径。
- `fcToBlob` 丢弃 FC 顶层外来成员（bbox 等）——store 中 FC 均为应用自产，
  仅含 type/features。
- 并发：保存为用户主动动作，无并发写；侧车写失败中止整个保存。
- 隐藏图层懒加载失败 → message.error，图层保持空占位（再次切换可见重试）。
- 阶段1 的 `sourceVersion` 是增量保存与懒加载后 SQL 同步的共同基石。

## 测试

- pytest（`tests/test_project.py`，fastapi TestClient）：写/读回环、原子写
  自动建目录、cleanup 保留 keep 删除孤儿、404。
- vitest：
  - `serializeProject` 大图层 → `sourceFile` + `filesDir`，小图层内联；
  - `loadProject` v2：可见侧车 fetch 填充、隐藏侧车 → lazy 占位零请求、
    v1 兼容、缺失文件 warning；
  - `saveProject` 只 POST 版本变更图层、路径变化全量、成功后 cleanup；
  - `fcToBlob` 输出与 `JSON.stringify(fc)` 逐字节等价（含 >2000 要素走
    yield 路径）；
  - layerStore `clearLazy`。
