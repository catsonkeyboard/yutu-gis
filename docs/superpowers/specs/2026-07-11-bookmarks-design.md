# 空间书签设计

日期：2026-07-11 · 优先级 P1 · 参考 GeoLibre "Bookmarks"

## 目标

一键保存/回跳地图视角。书签 = 名称 + center + zoom + provider，持久化到
`~/.yutugis/config.json`，跨会话可用。

## 决策

- 不保存图层可见性快照（GeoLibre 保存"图层+相机"，但图层是会话态，跨会话恢复
  属于工程文件的职责；书签只管"去哪儿看"，YAGNI）。
- UI 用工具栏 `StarOutlined` 下拉 Popover（仿 MonitorDropdown 的受控 Popover），
  不做悬浮面板——书签是瞬时操作，无需常驻。

## 数据

```ts
interface Bookmark { id: string; name: string; center: [number, number]; zoom: number; provider: MapProvider; createdAt: number }
```

- `stores/bookmarkStore.ts`：`bookmarks[]`、`add(name)`（读 mapStore 当前状态）、
  `remove(id)`、`jumpTo(id)`（setProvider + mapStore.jumpToRequest，复用工程文件
  引入的 jumpTo 机制）、`setAll(list)`（启动加载）。
- 持久化：config.json 增加 `"bookmarks": []`；App.tsx 启动 `loadConfig` 时
  `setAll`；书签增删后防抖 500ms 调 `saveConfig`（config.ts 的 loadConfig 合并
  DEFAULT_CONFIG 已兼容缺失键）。保存时读取现有 config 合并写回，避免覆盖其它
  设置（preload 暴露的 saveConfig 全量写 —— 由 App 层持有最新 config 状态合并）。

## UI

Popover 内容：
- 顶部：Input（书签名，默认"书签 + 时间"）+ "保存当前视图"按钮。
- 列表：名称（点击跳转）+ 删除按钮；空态提示。上限 50 条（超出提示删除旧的）。

## 测试

vitest：add/remove/jumpTo 的 store 行为（mock mapStore）。手工：保存 → 重启 →
下拉可见并可跳转（含 Amap provider 切换）。
