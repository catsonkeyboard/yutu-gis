# 工程文件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.yutugis` 工程文件保存/打开（图层+样式+地图状态），接通工具栏与 File 菜单的空壳按钮。

**Architecture:** `services/project.ts` 提供 `serializeProject()` / `loadProject(json)`（纯 store/api 逻辑，vitest 可测）；文件对话框留在 App.tsx。mapStore 新增 `jumpToRequest` 恢复精确视角；`importOfflineMap` 补 `sourcePath` 使 raster 图层可重注册。规格见 `docs/superpowers/specs/2026-07-11-project-file-design.md`。

**要点：** geojson 内联、raster 只存 path（打开时 `registerTileSource` 重注册，缺失文件跳过收集 warning）；layers 数组按 store 顺序保存，恢复时倒序 addLayer（addLayer 是前插）；version>1 拒绝。

---

### Task 1: mapStore.jumpToRequest + importOfflineMap.sourcePath
- Modify: `src/renderer/src/stores/mapStore.ts`、`src/renderer/src/components/MapCanvas/MapCanvas.tsx`（jumpTo effect）、`src/renderer/src/utils/importOfflineMap.ts`
- [ ] 实现 + mapStore 测试 → Commit

### Task 2: project.ts（TDD）
- Create: `src/renderer/src/services/project.ts`、`src/renderer/src/services/__tests__/project.test.ts`（mock services/api）
- [ ] 失败测试（往返、倒序恢复、版本拒绝、raster 缺失 warning）→ 实现 → 通过 → Commit

### Task 3: App/Toolbar/menu 接线
- Modify: `src/renderer/src/App.tsx`（handleOpenProject/handleSaveProject + onMenuAction 分发 import/export/open/save + 覆盖确认）
- Modify: `src/renderer/src/components/Toolbar/Toolbar.tsx`（open/save 按钮接 props）
- Modify: `src/main/menu.ts`（File 菜单：打开工程 CmdOrCtrl+O、保存工程 CmdOrCtrl+S）
- Modify: locales（`project.*`）
- [ ] 实现 + typecheck → Commit
