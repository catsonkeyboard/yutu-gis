# SQL 工作台（DuckDB 空间查询）设计

日期：2026-07-11 · 参考 GeoLibre "SQL Workspace"（其用 DuckDB-WASM；本项目按总览文档
决策，在常驻 Python 后端直接引入 DuckDB Python 包，成本远低于 WASM 方案）

## 目标

对已加载的矢量图层执行 SQL 查询与空间分析：图层注册为 DuckDB 表，支持
DuckDB Spatial 的全部空间函数（ST_Area/ST_Buffer/ST_Intersects/空间 JOIN 等），
结果以表格展示，含几何的结果可一键添加为地图图层。

## 非目标（YAGNI）

- 写语句（INSERT/UPDATE/CREATE TABLE）：v1 仅允许 SELECT / WITH / SHOW /
  DESCRIBE —— 工作台定位是查询分析，不做数据编辑。
- SQL 编辑器语法高亮/自动补全（不引 monaco 等依赖，用 TextArea；表清单点击
  插入弥补）。
- 查询历史持久化（会话内即可）。

## 后端

依赖：`duckdb>=1.1`（已装 1.5.4）。spatial 扩展首次使用时 `INSTALL spatial`
自动下载（需一次网络）；下载失败时降级运行：几何列以 GeoJSON TEXT 存储，
属性 SQL 可用、空间函数不可用，`/sql/status` 返回 `spatial: false` 供前端提示。

`python/services/sql.py`（模块级单连接 `duckdb.connect()` 内存库 + `threading.Lock`）：

```
register_layer(name, geojson) -> { table, columns: [{name, type}], rows }
  - 表名净化：保留中英文数字，其他字符→_，去重后缀 _2；CREATE OR REPLACE
  - spatial 可用：geojson 写临时文件 → CREATE TABLE ... AS SELECT * FROM ST_Read(file)
    （GDAL 推断属性类型，几何列名 geom，类型 GEOMETRY）
  - 降级路径：属性列类型推断（int/float/str，同 export.py 策略），逐行 INSERT，
    几何存 TEXT 列 geom_json
list_tables() -> [{ table, columns, rows }]
run_query(sql, limit=1000) -> { columns: [{name,type}], rows: [[...]], row_count, truncated }
  - 语句白名单校验（首个关键词 SELECT/WITH/SHOW/DESCRIBE，拒绝分号后第二条语句）
  - CREATE OR REPLACE TEMP VIEW _result AS <sql> → DESCRIBE 拿列类型
  - GEOMETRY 列在 SELECT 包装层转 ST_AsGeoJSON 返回；LIMIT limit+1 判 truncated
query_as_geojson(sql, cap=100_000) -> FeatureCollection
  - 取第一个 GEOMETRY 列为几何，其余列进 properties；无几何列 → ValueError
```

路由 `python/routers/sql.py`，prefix `/sql`：

```
GET  /sql/status            → { spatial: bool }
POST /sql/tables            { name, geojson } → register_layer 结果
GET  /sql/tables            → { tables: [...] }
POST /sql/query             { sql, limit? } → run_query 结果
POST /sql/query/geojson     { sql } → FeatureCollection
```

错误统一 400 + detail（DuckDB 报错信息直接透传，含行列位置，对分析师友好）。

## 前端

- **入口**：工具栏 `ConsoleSqlOutlined` 按钮。面板为**底部面板**（同属性表模式，
  高度可拖 220–600），与属性表互斥（打开一个关闭另一个——都占底部）。
- `stores/sqlPanelStore.ts`：`{ open, height, sql }`（sql 文本进 store，关面板不丢）。
- `components/SqlWorkbench/SqlPanel.tsx`：
  - 左栏（180px）：已注册表清单（表名+行数，展开列名/类型），点击表名/列名插入
    编辑器光标处；顶部"同步图层"按钮把当前全部 geojson 图层 POST 注册（自动执行
    一次于面板首次打开时）。
  - 右区：TextArea（等宽字体，Cmd/Ctrl+Enter 执行）+ 工具行（执行按钮、示例查询
    Dropdown、spatial 状态 Tag、行数/耗时）+ 结果 antd Table（虚拟滚动，几何列
    显示截断 WKT/GeoJSON 文本）。
  - **添加为图层**：结果含几何列时可用，调 `/sql/query/geojson` →
    `addLayer`（命名 `SQL_<时间>`）+ fitBounds。
- 示例查询（写死 3 条，占位表名取第一个已注册表）：字段统计 GROUP BY、
  `ST_Area(geom)` 面积计算、两表 `ST_Intersects` 空间 JOIN。
- `api.ts`：`sqlStatus/sqlRegisterTable/sqlListTables/sqlQuery/sqlQueryGeojson`。

## 边界

- 图层重名：净化后同名 → 覆盖注册（与"同步"语义一致，表内容始终跟随图层）。
- 大图层：100k 要素经临时文件 + ST_Read 导入，秒级；查询 LIMIT 保护展示端。
- GCJ-02：注册用 store 中 WGS-84 数据；结果转图层后由 renderLayers 统一处理。
- 后端重启（应用重启）后表清单为空 → 面板打开时自动同步兜底。

## 磁盘文件直查（v1.1 追加）

不把大数据集加载为地图图层，直接对本地文件建**惰性视图**查询：

```
POST /sql/files { path, name? } → { table, columns, rows: null, kind: 'file', path }
```

- `register_file(path)`：按扩展名分派——GIS 格式（gpkg/shp/geojson/json/kml/kmz/
  gpx/fgb）用 `ST_Read`（需 spatial）；`csv` 用 `read_csv_auto`；`parquet` 用
  `read_parquet`（后两者无需 spatial）。`CREATE OR REPLACE VIEW <名> AS SELECT *
  FROM ...`，视图名取文件名净化去重。
- **不做 count(*)**（大文件全表扫描太慢），`rows` 返回 null，前端显示"文件"Tag
  而非行数；列信息经 DESCRIBE（惰性，秒回）。
- 路径为绝对路径（来自 openFileDialog），单机桌面应用不做路径白名单。
- 注册表与图层表共用清单（`kind: 'layer' | 'file'`），同名去重规则一致；
  重复注册同一路径 → 复用原视图名（幂等）。
- 前端：SQL 面板侧栏"打开文件"按钮 → openFileDialog → 注册 → 刷新表清单；
  文件视图行尾加 Tag 区分。
- 边界：文件被删除后查询报 GDAL/IO 错误，透传 detail；不主动失效视图。

## 测试

pytest：表名净化/注册回读（spatial 与降级两路径，spatial 不可用时跳过）、白名单
拒绝 UPDATE、truncated、几何列转 GeoJSON、query_as_geojson 无几何报错。
前端 vitest：store 行为。
