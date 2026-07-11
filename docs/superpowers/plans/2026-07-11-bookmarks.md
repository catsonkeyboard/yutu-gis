# 空间书签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 工具栏星标下拉：保存/跳转/删除地图视角书签，持久化到 `~/.yutugis/config.json`。

**Architecture:** config 增加 `bookmarks[]` + 新 IPC `config:update`（读-合并-写局部更新，顺带修复 SettingsModal 全量覆写会抹掉未知键的问题）；`bookmarkStore`（add/remove/jumpTo/setAll，变更後 `updateConfig({bookmarks})`）；Toolbar `StarOutlined` 受控 Popover（仿 MonitorDropdown）。规格见 `docs/superpowers/specs/2026-07-11-bookmarks-design.md`。

---

### Task 1: config 层
- Modify: `src/main/config.ts`（`AppConfig.bookmarks: BookmarkEntry[]` + `updateConfig(partial)`）
- Modify: `src/main/ipc.ts`（`config:update`）、`src/preload/index.ts` / `index.d.ts`（`updateConfig`）
- Modify: `src/renderer/src/components/Settings/SettingsModal.tsx`（saveConfig → updateConfig）
- [ ] 实现 + typecheck → Commit

### Task 2: store + UI
- Create: `src/renderer/src/stores/bookmarkStore.ts`（上限 50；jumpTo: setProvider + requestJumpTo）
- Create: `src/renderer/src/components/Toolbar/BookmarkDropdown.tsx`
- Modify: `src/renderer/src/components/Toolbar/Toolbar.tsx`（挂载）、`src/renderer/src/App.tsx`（启动 setAll(cfg.bookmarks)）
- Modify: locales（`bookmark.*`）
- [ ] store 测试 + 实现 + typecheck → Commit
