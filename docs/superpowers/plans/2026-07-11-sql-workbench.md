# SQL 工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DuckDB（+spatial）后端 SQL 查询分析：图层→表、SELECT 白名单查询、结果表格/转图层。

**Architecture:** 见 `docs/superpowers/specs/2026-07-11-sql-workbench-design.md`。后端单连接+锁；spatial 经 ST_Read 导入，几何列 GEOMETRY；降级路径 TEXT。前端底部面板（与属性表互斥）。

---

### Task 1: 后端 sql 服务（TDD）
- Modify: `python/requirements.txt`（duckdb>=1.1，已装）
- Create: `python/services/sql.py`、`python/tests/test_sql.py`、`python/routers/sql.py`
- Modify: `python/main.py`（include_router prefix /sql）
- [ ] 失败测试（注册回读/净化去重/白名单/truncated/几何转 GeoJSON/query_as_geojson）→ 实现 → `pytest` 通过 → Commit

### Task 2: 前端面板
- Create: `src/renderer/src/stores/sqlPanelStore.ts`、`components/SqlWorkbench/SqlPanel.tsx`
- Modify: `api.ts`（5 个 sql 接口）、`Toolbar.tsx`（ConsoleSqlOutlined，与属性表互斥）、`App.tsx`（底部挂载）、locales（`sql.*`）
- [ ] 实现 + typecheck + vitest → Commit
- [ ] 冒烟：dev 启动，实测 /sql 接口链路 → CLAUDE.md 增补 → Commit
