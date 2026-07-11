# 降水雷达时间滑块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RainViewer 雷达从单帧升级为可播放动画（实况 + 短时预报），底部悬浮播放条。

**Architecture:** 后端 `fetch_rainviewer` 增补 `frames[]`（past+nowcast，保留旧字段兼容）；monitorStore 以 `radarFrames/radarIndex/radarPlaying` 取代 `radarFrame`；MonitorLayer 为每帧建 `monitor-radar-f{i}` source/layer，仅当前帧不透明（切帧 setPaintProperty，无闪烁），600ms 播放循环；`RadarTimelineBar` 底部居中（播放/暂停 + Slider + 时间/预报 Tag）。刷新后 index 重置到最后实况帧。规格见 `docs/superpowers/specs/2026-07-11-radar-timeline-design.md`。

---

- [ ] Task 1: 后端 frames 列表（`python/services/monitor.py`）→ pytest（若有 mock 用例则补）→ Commit
- [ ] Task 2: api.ts `fetchRainviewerFrames` + monitorStore 帧状态（vitest：推进循环/关闭清理）→ Commit
- [ ] Task 3: MonitorLayer 多帧渲染 + `RadarTimelineBar.tsx`（MapCanvas 挂载）+ locales → typecheck → Commit
