# 内容寻址图层库与 SQL 免传输注册（图层数据链路优化 · 阶段3）设计

日期：2026-10-13 · 前置：阶段1（sourceVersion 版本跳过）、阶段2（工程侧车 + 懒加载）。
解决剩余的两次全量搬运：SQL 首次注册仍要把整份 FC 从渲染进程 POST 到后端；
大图层首次保存 / 另存仍要渲染进程序列化上传。

## 目标

- FC 在 Python 侧产生的瞬间落**内容寻址图层库**，响应携带 `content_hash`；
  渲染进程不再为同一份数据二次上传。
- SQL 注册：请求只带 `{name, layer_id, version, content_hash}`，后端从图层库
  文件 `CREATE TABLE ... AS SELECT * FROM ST_Read(<store path>)`（物化，保持
  重复查询速度），不再有临时文件；无 hash 时退回 geojson 上传（后端顺手
  入库，同样消灭临时文件路径）。
- 保存：变更的大图层若 `contentHash` 命中图层库 → `POST /project/copy`
  服务端磁盘拷贝进侧车，渲染进程零字节；未命中退回阶段2 的 Blob POST。

## 非目标（YAGNI）

- DuckDB VIEW（惰性）——交互式工作台多次查询，物化 TABLE 更快；注册开销
  已由免传输 + 阶段1 版本跳过消除。
- 渲染进程就地变更（appendFeatures / 筛选另存）的增量入库——变更即失效
  hash，走 Blob 回退，简单正确。
- WFS/OGC 之外的更多生产者；raster/GeoTIFF（无 geojson FC）。
- 工程加载后把侧车文件"认领"回图层库（save-as 场景仍走 Blob，少见）。

## 图层库 `python/services/layer_store.py`

```
STORE_DIR = ~/.yutugis/layers/      文件名 <sha256[:16]>.geojson
put(fc) -> hash | None     要素 ≤ MIN_FEATURES(=2000) 返回 None（不值得存）
                           json iterencode 流式写 tmp → os.replace；hash 即
                           序列化字节的 sha256 前 16 hex；同内容幂等覆盖
path_of(hash) -> Path | None
copy_out(hash, dest)       未知 hash → ValueError(404)；tmp+replace 原子拷贝
gc()                       模块导入时执行：总量 > 2GB 则按 mtime 删最旧至 < 1GB
                           （纯缓存，随时可删，无需引用跟踪）
```

## 生产者接入（响应增加 `content_hash`，仅 >2000 要素时非空）

|端点|响应形态|渲染端消费|
|---|---|---|
|`/data/import`、`/data/import/pbf`|`layers[].content_hash`|`ImportedLayer.contentHash`；applyImport merge 且单图层原样时透传|
|`/data/wfs/features`、`/data/ogc/features`|`{geojson, content_hash}`（原为裸 FC，改 envelope）|`onImport(fc, name, contentHash?)`|
|`/data/osm/extract`|`{geojson, content_hash}`|面板仅当导入 FC 与响应 FC **引用相等**（未筛选、单图层模式）时透传|
|`/analysis/run`|顶层 `content_hash`（与 `skipped` 同级）|`source: result.contentHash ? result : {…features}`|
|`/sql/query/geojson`|`{geojson, content_hash}`|addAsLayer 透传|
|`/sql/calculate`|`{geojson, content_hash}`|`setSource(id, fc, contentHash)`|

## SQL 注册（`POST /sql/tables`）

```
{name, layer_id?, version?, content_hash?, geojson?}
```

- 版本跳过（阶段1）不变，先行判断。
- `content_hash` 命中 → 直接用库文件；否则 `geojson` 必填 → `put()` 入库
  （无大小门槛，统一路径）→ `CREATE OR REPLACE TABLE ... AS SELECT * FROM
  ST_Read(?)`。`_register_spatial` 的临时文件逻辑删除。
- 降级路径（无 spatial，逐行 INSERT）不变，仍需 geojson。
- `SqlPanel.syncLayers`：`contentHash` 存在 → 不传 geojson（请求体几十字节）。

## 保存（`saveProject`）

变更大图层：有 `contentHash` → 先试 `copyProjectFile(dest, hash)`，失败
（404/网络）回退 `fcToBlob` POST；无 hash → 直接 Blob POST（阶段2 路径）。

`POST /project/copy {hash, path}`：`layer_store.copy_out`，自动建目录。

## 渲染端 store 语义

- `Layer.contentHash?: string`；`addLayer` 透传；`setSource(id, source,
  contentHash?)` 第三参设置/清除；`appendFeatures` **清除** hash（数据已变）。
- hash 生命周期：服务端产生 → 原样进 store → 任何渲染端数据变更即失效。

## 边界

- 后端重启清空图层库注册？——库是磁盘持久 + 内容寻址，hash 跨会话有效；
  但 Python 后端随应用重启，gc 只按容量，不按会话。
- merge/筛选产生的合成 FC 不带 hash → 走回退路径，行为与阶段2 完全一致。
- `content_hash` 与 `sourceVersion` 独立：hash 指字节内容，version 指变更代数。
- 大 FC 顶层外来成员（analysis 的 `skipped`）随 `source: result` 进内存，
  MapLibre 遍历 features 不受影响；>2000 要素必走侧车，不会写入工程文件。

## 测试

- pytest：`test_layer_store.py`（小 FC 返回 None、put 幂等去重、copy_out
  404/成功、gc 容量淘汰）；test_sql 增加 hash 注册/geojson 回退；test_project
  增加 /project/copy。
- vitest：layerStore contentHash 透传/清除；saveProject copy 优先 + 回退。
