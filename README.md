# YutuGIS 舆图

专业 GIS 桌面应用，面向 GIS 数据分析师。支持矢量数据加载与可视化、多源底图切换、WFS/OGC API 远程数据接入、地图要素绘制，以及坐标系自动纠偏。

基于 **Electron + React + Python FastAPI** 架构构建，前端负责地图渲染与交互，Python 后端处理 GIS 数据格式转换与远程服务请求。

---

## 功能特性

### 地图渲染
- 基于 MapLibre GL JS v5，硬件加速矢量瓦片渲染
- 支持 6 种底图切换（右下角下拉选择）：
  - OSM 街道图
  - Google 街道图 / 卫星影像图
  - 高德街道图 / 卫星影像图 / 山地图
- 导航控件（缩放 / 旋转 / 复位）、比例尺
- 状态栏实时显示经纬度、缩放级别

### 坐标系纠偏
- 高德地图使用 GCJ-02（火星坐标系），GeoJSON 数据为 WGS-84
- 切换到高德底图时自动对叠加图层执行 WGS-84 → GCJ-02 转换，消除偏移
- 境外坐标自动跳过转换

### 数据导入
支持本地文件导入（工具栏导入按钮）：

| 格式 | 说明 |
|---|---|
| GeoJSON / JSON | 直接读取 |
| Shapefile (.shp) | 通过 fiona 转换 |
| KML | 通过 fiona 转换 |
| GPX | 通过 fiona 转换 |

导入后自动缩放定位到数据范围。

### WFS / OGC API Features 接入
通过工具栏的连接按钮，连接远程 GIS 服务：

- **WFS 1.x / 2.x**：GetCapabilities 获取图层列表，GetFeature 下载要素
- **OGC API Features**：`/collections` 获取集合列表，`/collections/{id}/items` 下载要素
- 支持多选：一次选择多个图层/集合，每个生成独立图层
- 可设置每图层最大要素数（默认 1000）
- 顺序导入，显示进度条；部分失败不影响其他图层继续导入
- 手动输入模式：未获取图层列表时可直接输入图层名

### 绘制工具
工具栏提供三种绘制模式（可叠加使用）：

| 模式 | 说明 |
|---|---|
| 点（Point） | 单击地图放置点要素 |
| 线（LineString） | 单击添加节点，双击完成 |
| 面（Polygon） | 单击添加顶点，单击起点或双击完成围栏 |

- 地图顶部提示条显示当前模式操作说明，绘制完成后出现 **完成并保存** 按钮
- 保存时可选择追加到当前图层，或输入名称新建图层
- 按同一绘制按钮再次点击或按 `Escape` 取消

### 图层管理
- 左侧图层面板，显示所有已加载图层
- **地图点击选图层**：鼠标悬停要素时光标变为指针，点击后自动选中所属图层，面板联动滚动定位
- 被选中图层要素高亮为橙色，其余为蓝色
- 点击面板图层条目：选中高亮并自动缩放定位到该图层范围
- 显示/隐藏开关、删除、导出 GeoJSON

### 设置
- 界面语言切换：中文 / English
- API Key 管理：Google Maps Key、高德地图 Key（均为可选，留空使用公共服务）
- 设置持久化到 `~/.yutugis/config.json`（跨平台用户目录，不进入 git）

---

## 界面布局

```
┌─────────────────────────────────────────────────────┐
│  工具栏（导入 / 导出 / 连接WFS / 绘制 / 设置）        │
├──────────────┬──────────────────────────────────────┤
│              │  ┌──────────── 绘制提示条 ──────────┐ │
│  图层面板    │  │ 点击添加节点，双击完成  [完成并保存] │ │
│  (220px)     │  └─────────────────────────────────┘ │
│              │           地图画布                   │
│  图层1  👁 ↓ 🗑│        (MapLibre GL)                │
│  图层2  👁 ↓ 🗑│                              ┌────┐ │
│              │                              │底图│ │
│              │                              │切换│ │
│              │                              └────┘ │
├──────────────┴──────────────────────────────────────┤
│  状态栏：经度 / 纬度 / 缩放级别                       │
└─────────────────────────────────────────────────────┘
```

---

## 技术架构

```
Electron 主进程
  ├── 窗口管理、原生菜单
  ├── 启动 Python 子进程（动态端口）
  ├── 加载/保存用户配置（~/.yutugis/config.json）
  └── IPC：文件读取、对话框、配置读写

预加载脚本 (contextBridge)
  └── electronAPI：getPythonPort / readFile / writeFile /
                   openFileDialog / saveFileDialog /
                   loadConfig / saveConfig / onMenuAction

渲染进程 (React 19 + TypeScript)
  ├── MapCanvas     地图渲染（MapLibre GL）+ 绘制工具（MapboxDraw）
  ├── LayerPanel    图层管理面板
  ├── WFSModal      远程服务连接
  ├── Toolbar       工具栏（含绘制模式按钮）
  ├── StatusBar     状态栏
  └── Zustand 状态管理
      ├── layerStore    图层列表、选中状态、appendFeatures
      ├── mapStore      视角、底图、fitBoundsRequest
      ├── drawStore     绘制模式、当前要素集
      └── settingsStore 语言、API Keys（从文件加载，不写 localStorage）

Python 后端 (FastAPI + uvicorn)
  ├── POST /data/import          本地文件 → GeoJSON（fiona）
  ├── POST /data/wfs/layers      WFS GetCapabilities
  ├── POST /data/wfs/features    WFS GetFeature
  ├── POST /data/ogc/collections OGC API /collections
  └── POST /data/ogc/features    OGC API /collections/{id}/items
```

---

## 开发环境要求

| 依赖 | 版本要求 |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Python | 3.12（必须，fiona 无 3.13+ wheels） |
| uv | 最新版（Python 包管理） |

---

## 快速开始

### 1. 安装前端依赖

```bash
npm install
```

### 2. 初始化 Python 环境

```bash
cd python
uv venv --python 3.12
uv pip install -r requirements.txt
cd ..
```

> **注意：** 必须使用 `uv`，不要直接用 `pip install`。Python 版本必须为 3.12，fiona 在 3.13+ 无预编译包。

### 3. 启动开发模式

```bash
npm run dev
```

Electron 主进程会自动启动 Python 后端（随机端口），等待健康检查通过后再显示窗口。首次启动会在 `~/.yutugis/` 创建 `config.json`。

---

## 构建打包

```bash
# 类型检查
npm run typecheck

# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

打包产物在 `dist/` 目录。Python 后端在打包时需编译为独立可执行文件（`python-backend`）放入 `resources/`，当前开发阶段使用 `.venv` 直接运行。

---

## 常用命令

```bash
npm run dev          # 开发模式
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化
npm run test         # 运行测试（vitest）
npm run build        # 构建（含 typecheck）
```

---

## 项目结构

```
yutugis/
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── index.ts            # 入口，窗口创建
│   │   ├── config.ts           # 用户配置读写（~/.yutugis/config.json）
│   │   ├── python.ts           # Python 子进程管理
│   │   ├── menu.ts             # 原生菜单
│   │   └── ipc.ts              # IPC 处理器
│   ├── preload/
│   │   ├── index.ts            # contextBridge
│   │   └── index.d.ts          # electronAPI 类型声明
│   └── renderer/src/
│       ├── App.tsx             # 根组件，启动加载配置
│       ├── components/
│       │   ├── MapCanvas/      # 地图 + 绘制工具 + 底图切换器
│       │   ├── LayerPanel/     # 图层管理面板
│       │   ├── Toolbar/        # 工具栏（含绘制按钮）
│       │   ├── WFS/            # WFS/OGC 连接弹窗
│       │   ├── Settings/       # 设置弹窗
│       │   └── StatusBar/      # 状态栏
│       ├── stores/
│       │   ├── layerStore.ts   # 图层状态（含 appendFeatures）
│       │   ├── mapStore.ts     # 地图状态（视角、底图、fitBounds）
│       │   ├── drawStore.ts    # 绘制状态（模式、要素集）
│       │   └── settingsStore.ts# 设置（运行时状态，由文件配置初始化）
│       ├── services/
│       │   └── api.ts          # Python 后端 API 客户端
│       └── utils/
│           ├── geo.ts          # GeoJSON 边界计算
│           └── coordTransform.ts # WGS-84 ↔ GCJ-02 转换
├── python/
│   ├── main.py                 # FastAPI 应用入口
│   ├── routers/
│   │   └── data.py             # 数据接口路由
│   ├── services/
│   │   ├── gis.py              # 文件格式转换（fiona）
│   │   └── wfs.py              # WFS/OGC 请求（httpx）
│   ├── requirements.txt
│   └── .venv/                  # uv 管理的虚拟环境（不入 git）
├── docs/plans/                 # 设计文档
├── CLAUDE.md                   # AI 协作指南
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

---

## 用户配置文件

应用启动后自动在用户目录下创建配置文件，**不进入版本控制**：

| 平台 | 路径 |
|---|---|
| macOS / Linux | `~/.yutugis/config.json` |
| Windows | `C:\Users\<用户名>\.yutugis\config.json` |

```json
{
  "language": "zh",
  "googleMap": {
    "apiKey": ""
  },
  "amap": {
    "apiKey": ""
  }
}
```

---

## 注意事项

- **SOCKS 代理**：Python 后端使用 `httpx[socks]`，支持系统 SOCKS 代理，WFS 请求可正常穿透
- **SSL 证书**：WFS 请求默认跳过 SSL 验证（`verify=False`），兼容企业内网自签名证书
- **剪贴板**：应用包含原生 Edit 菜单，`Cmd+C/V/X` 在所有输入框中均可用
- **文件读取**：渲染进程通过 IPC 读取本地文件，不受 CSP `file://` 限制
- **API Key**：Google Maps 和高德地图 Key 均为可选，留空使用公共瓦片服务；Key 存储在本地配置文件中，不上传

---

## License

MIT
