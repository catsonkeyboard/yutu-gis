# SQL 图层同步版本跳过（图层数据链路优化 · 阶段1）设计

日期：2026-10-12 · 背景：大图层（10 万+要素）场景下，SQL 面板每次打开/手动同步
（`SqlPanel.syncLayers`）把**全部** geojson 图层无条件重注册：渲染进程 JSON 序列化
整个 FeatureCollection → HTTP 传输 → 临时文件落盘 → DuckDB `ST_Read` 全量物化。
单个 10 万要素图层即秒级。三阶段优化路线（工程侧车、Python 内容寻址图层库）中的
阶段1：用版本号让未变图层零成本跳过，零格式变更。

## 目标

- "同步图层"（面板打开时自动 + 手动按钮）对未变化图层**零成本**：无序列化、
  无传输、无临时文件、无 DuckDB 导入。
- 版本号在 `layerStore` 集中维护，自动覆盖所有数据变更入口，调用方零配合。

## 非目标（YAGNI）

- 工程文件格式变更 / 大图层侧车存储（阶段2，另行立项）。
- Python 侧内容寻址图层库 / SQL 注册视图化（阶段3，另行立项）。
- 图层删除后在 DuckDB 侧回收表（维持现状：表保留至覆盖注册或后端重启）。
- `sourceVersion` 持久化进 `.yutugis`（v1 格式不动；加载后的图层拿新版本号，
  首次同步照常注册）。

## 方案

### 前端：`layerStore.sourceVersion`

- `Layer.sourceVersion?: number`，由**模块级单调递增计数器**分配（非每图层自增）。
- `addLayer` 打戳（缺省 `++seq`）；`setSource` / `appendFeatures` 重新打戳；
  其余动作（style / rename / opacity / visible / reorder）不动版本。
- 全局计数器（而非每图层 1,2,3…）的 reason：「删除图层后重建同 id 图层」必然
  拿到全新版本号，避免与服务端按 layer_id 残留的旧版本相等 → 错误跳过。
- raster 图层同样打戳（无害，规则唯一）。

### API

`POST /sql/tables` 请求体新增可选 `version: number`：

```
sqlRegisterTable(name, geojson, layerId, version?)
```

### 后端：`python/services/sql.py`

- `_tables[table]` 元信息增加 `source_version` 字段。
- `register_layer(name, geojson, layer_id=None, version=None)`：
  `layer_id` 与 `version` 均提供、且与该 layer_id 已注册表的 `source_version`
  相等 → 直接返回缓存元信息 `{table, columns, rows, kind: 'layer'}`，不触碰
  DuckDB；否则走原注册路径并记录新 `source_version`。
- `version` 缺省（旧调用方 / 既有测试）→ 维持现状全量注册，向后兼容。
- 跳过判断在 spatial / 降级分派**之前**，两条注册路径同等受益。

## 边界

- 后端重启（应用重启）清空 `_tables` → 首次同步全量，自愈；无跨会话脏数据。
- 同 id 图层 remove → re-add：全局计数器保证版本不同 → 正常重注册。
- 并发：`register_layer` 全程持 `_lock`，与现状一致。
- `register_file`（惰性视图，按路径幂等）不受影响。

## 测试

- pytest（`python/tests/test_sql.py::TestRegister`）：
  - 同 layer_id + 同 version + 不同数据 → 跳过（行数保持旧值，证明未替换）；
  - 同 layer_id + 新 version → 重注册（新数据生效）；
  - 不带 version → 每次全量注册（现状回归）。
- vitest（`stores/__tests__/layerStore.test.ts`）：
  - `addLayer` 打戳；`setSource` / `appendFeatures` 递增；`setStyle` 不动；
  - 删除后重建同 id 图层 → 版本号不同。
