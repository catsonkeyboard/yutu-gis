# 地图瓦片下载功能 实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 YutuGIS 中新增"地图瓦片下载"功能——右键菜单选定当前视图范围,选择缩放级别区间和瓦片源,将 XYZ 栅格瓦片批量下载为 MBTiles 文件或 z/x/y 目录,带实时进度、取消和断点续传(去重跳过)。

**Architecture:** 参考 MapTilesDownloader 的"bbox → 瓦片行列号 → 并发下载 → SQLite/目录写入 + 轮询进度"模式,映射到 YutuGIS 现有架构:Python FastAPI 后端新增 `/tiles/*` 路由(asyncio 并发下载引擎 + 内存任务注册表),渲染进程新增 `TilesDownloadModal`(复用右键菜单捕获 bounds 的 OSM 提取模式),保存路径通过已有的 `saveFileDialog` / `openDirectoryDialog` IPC 获取。

**Tech Stack:** Python(httpx 异步下载、stdlib sqlite3 写 MBTiles、pytest)、React + Ant Design(Modal/Slider/Progress)、现有 zustand stores。

**设计取舍(相对参考项目的裁剪,YAGNI):**
- 只支持 `{z}/{x}/{y}` 占位符,不做 quadkey(现有瓦片源都不需要;Bing 未接入)
- 不做 2x retina 四合一拼接、不做 GeoTIFF 拼接(后续可加)
- 选区复用"右键菜单 + 当前视图 bounds"模式(与 OSM 要素提取一致),弹窗内可手动微调 bbox;画矩形选区留作后续增强
- 进度用轮询(500ms),与项目现有 fetch 风格一致,不引入 WebSocket/SSE
- 输出格式:MBTiles(推荐,QGIS/MapLibre 直接可用)和 z/x/y 目录两种;参考项目的 "Repo" 格式不做

**注意事项:**
- OSM 官方瓦片服务的使用政策不鼓励批量下载,并发固定为 6、瓦片总数硬上限 200,000,前端超过 10,000 显示警告
- 高德瓦片本身是 GCJ-02 网格切片,下载即原样保存,**不涉及**坐标转换(转换只在把 WGS-84 矢量叠加到高德底图时发生)
- 下载引擎写文件在 Python 后端进行,路径由渲染进程通过 IPC 对话框取得后作为字符串传给后端(同机进程,无安全问题)

---

## 文件结构

| 操作 | 路径 | 职责 |
|---|---|---|
| Create | `python/services/netutil.py` | 共享 HTTP 代理 mounts(从 osm.py 提取) |
| Modify | `python/services/osm.py` | 改用 netutil 的代理 mounts |
| Create | `python/services/tiles.py` | 瓦片数学(经纬度→行列号、计数、迭代)+ MBTiles/目录两种 Writer |
| Create | `python/services/tile_tasks.py` | 异步下载引擎、任务状态、任务注册表 |
| Create | `python/routers/tiles.py` | `/tiles/download`、`/tiles/tasks/{id}`、`/tiles/tasks/{id}/cancel` |
| Modify | `python/main.py` | 挂载 tiles 路由 |
| Create | `python/tests/test_tiles.py` | 瓦片数学 + Writer 单测 |
| Create | `python/tests/test_tile_tasks.py` | 下载引擎单测(mock 网络) |
| Create | `python/tests/test_tiles_router.py` | 路由集成测试 |
| Create | `src/renderer/src/utils/tileMath.ts` | 前端瓦片计数估算 |
| Modify | `src/renderer/src/components/MapCanvas/tileProviders.ts` | 新增 `getTileUrlTemplate()` |
| Modify | `src/renderer/src/services/api.ts` | 三个 fetch 封装 |
| Create | `src/renderer/src/components/TilesDownload/TilesDownloadModal.tsx` | 下载弹窗(表单 + 进度 + 取消) |
| Modify | `src/renderer/src/components/MapCanvas/MapContextMenu.tsx` | 右键菜单加"下载地图瓦片" |
| Modify | `src/renderer/src/components/MapCanvas/MapCanvas.tsx` | 透传 `onTilesDownload` |
| Modify | `src/renderer/src/App.tsx` | 弹窗状态与装配 |
| Modify | `src/renderer/src/locales/zh.json` / `en.json` | 菜单项文案 |
| Modify | `CLAUDE.md` | 功能文档 |

---

### Task 1: 共享代理工具 netutil.py

**Files:**
- Create: `python/services/netutil.py`
- Modify: `python/services/osm.py:8-18`

- [ ] **Step 1: 创建 netutil.py**

```python
"""Shared HTTP networking helpers."""
import urllib.request
import httpx


def build_proxy_mounts() -> dict:
    """Convert urllib system proxies to httpx mounts format."""
    raw = urllib.request.getproxies()
    mounts = {}
    if "https" in raw:
        mounts["https://"] = httpx.AsyncHTTPTransport(proxy=raw["https"], verify=False)
    if "http" in raw:
        mounts["http://"] = httpx.AsyncHTTPTransport(proxy=raw["http"])
    return mounts


PROXY_MOUNTS = build_proxy_mounts()
```

- [ ] **Step 2: osm.py 改为引用 netutil**

删除 `python/services/osm.py` 中的 `_build_proxy_mounts` 函数定义和 `_PROXY_MOUNTS = _build_proxy_mounts()` 以及 `import urllib.request`,替换为:

```python
from services.netutil import PROXY_MOUNTS as _PROXY_MOUNTS
```

(保留 `_PROXY_MOUNTS` 这个名字,osm.py 其余引用处不用改。)

- [ ] **Step 3: 跑现有测试确认无回归**

Run: `cd python && .venv/bin/python -m pytest tests/ -v`
Expected: 全部 PASS(现有 test_osm_service / test_osm_endpoint 等不受影响)

- [ ] **Step 4: Commit**

```bash
git add python/services/netutil.py python/services/osm.py
git commit -m "refactor: extract shared proxy mounts to services/netutil"
```

---

### Task 2: 瓦片数学(services/tiles.py 第一部分)

**Files:**
- Create: `python/services/tiles.py`
- Test: `python/tests/test_tiles.py`

- [ ] **Step 1: 写失败的测试**

创建 `python/tests/test_tiles.py`:

```python
# python/tests/test_tiles.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.tiles import deg2num, tile_range, count_tiles, iter_tiles, detect_format


def test_deg2num_origin_zoom0():
    assert deg2num(0.0, 0.0, 0) == (0, 0)


def test_deg2num_known_beijing_z10():
    # 北京 (39.9093, 116.3974) 在 z10 对应 OSM 瓦片 10/843/388
    assert deg2num(39.9093, 116.3974, 10) == (843, 388)


def test_deg2num_clamps_polar_latitude():
    # 超出 Web Mercator 纬度极限时收敛到边界瓦片，不越界
    x, y = deg2num(89.9, 0.0, 2)
    assert y == 0
    x, y = deg2num(-89.9, 0.0, 2)
    assert y == 3


def test_tile_range_orders_min_max():
    x_min, y_min, x_max, y_max = tile_range(39.8, 116.2, 40.0, 116.6, 10)
    assert x_min <= x_max and y_min <= y_max


def test_count_tiles_matches_iter():
    args = (39.8, 116.2, 40.0, 116.6, 8, 10)
    assert count_tiles(*args) == len(list(iter_tiles(*args)))
    assert count_tiles(*args) > 0


def test_detect_format():
    assert detect_format(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8) == "png"
    assert detect_format(b"\xff\xd8\xff\xe0" + b"\x00" * 8) == "jpg"
    assert detect_format(b"RIFF\x00\x00\x00\x00WEBP") == "webp"
    assert detect_format(b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00") == "png"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd python && .venv/bin/python -m pytest tests/test_tiles.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.tiles'`

- [ ] **Step 3: 实现瓦片数学**

创建 `python/services/tiles.py`:

```python
"""
Map tile download support: tile math and output writers (MBTiles / directory).
"""
import json
import math
import sqlite3
from pathlib import Path

MAX_LAT = 85.05112878  # Web Mercator latitude limit


def deg2num(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    """WGS-84 lat/lon → XYZ tile (column, row) at the given zoom."""
    lat = max(min(lat, MAX_LAT), -MAX_LAT)
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_range(
    south: float, west: float, north: float, east: float, zoom: int
) -> tuple[int, int, int, int]:
    """bbox → inclusive (x_min, y_min, x_max, y_max). North edge has the smaller y."""
    x_min, y_min = deg2num(north, west, zoom)
    x_max, y_max = deg2num(south, east, zoom)
    return x_min, y_min, x_max, y_max


def count_tiles(
    south: float, west: float, north: float, east: float, min_zoom: int, max_zoom: int
) -> int:
    total = 0
    for z in range(min_zoom, max_zoom + 1):
        x_min, y_min, x_max, y_max = tile_range(south, west, north, east, z)
        total += (x_max - x_min + 1) * (y_max - y_min + 1)
    return total


def iter_tiles(
    south: float, west: float, north: float, east: float, min_zoom: int, max_zoom: int
):
    """Yield (z, x, y) for every tile of the bbox across the zoom range."""
    for z in range(min_zoom, max_zoom + 1):
        x_min, y_min, x_max, y_max = tile_range(south, west, north, east, z)
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                yield z, x, y


def detect_format(data: bytes) -> str:
    """Sniff image format from magic bytes; tile servers lie in Content-Type."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return "png"
```

- [ ] **Step 4: 运行确认通过**

Run: `cd python && .venv/bin/python -m pytest tests/test_tiles.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add python/services/tiles.py python/tests/test_tiles.py
git commit -m "feat: add tile math (deg2num, tile ranges, format sniffing)"
```

---

### Task 3: MBTiles 与目录 Writer(services/tiles.py 第二部分)

**Files:**
- Modify: `python/services/tiles.py`(追加两个类)
- Test: `python/tests/test_tiles.py`(追加测试)

- [ ] **Step 1: 追加失败的测试**

在 `python/tests/test_tiles.py` 末尾追加:

```python
import sqlite3
import json
from services.tiles import MBTilesWriter, DirectoryWriter

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def test_mbtiles_writer_roundtrip(tmp_path):
    path = str(tmp_path / "t.mbtiles")
    w = MBTilesWriter(path, "test")
    assert not w.has_tile(10, 843, 387)
    w.write_tile(10, 843, 387, PNG)
    assert w.has_tile(10, 843, 387)
    w.close((39.8, 116.2, 40.0, 116.6), 10, 10)

    conn = sqlite3.connect(path)
    # MBTiles 规范：tiles 表使用 TMS 行号，XYZ y=387 在 z10 → row = 1024-387-1 = 636
    row = conn.execute(
        "SELECT tile_data FROM tiles WHERE zoom_level=10 AND tile_column=843 AND tile_row=636"
    ).fetchone()
    assert row is not None and bytes(row[0]) == PNG
    meta = dict(conn.execute("SELECT name, value FROM metadata").fetchall())
    assert meta["format"] == "png"
    assert meta["bounds"] == "116.2,39.8,116.6,40.0"
    assert meta["minzoom"] == "10" and meta["maxzoom"] == "10"
    conn.close()


def test_mbtiles_writer_resume_keeps_existing(tmp_path):
    path = str(tmp_path / "t.mbtiles")
    w1 = MBTilesWriter(path, "test")
    w1.write_tile(10, 1, 2, PNG)
    w1.close((0, 0, 1, 1), 10, 10)
    # 重新打开同一文件：已有瓦片可被 has_tile 识别（断点续传）
    w2 = MBTilesWriter(path, "test")
    assert w2.has_tile(10, 1, 2)
    w2.close((0, 0, 1, 1), 10, 10)


def test_directory_writer_roundtrip(tmp_path):
    root = str(tmp_path / "tiles")
    w = DirectoryWriter(root, "test")
    assert not w.has_tile(10, 843, 387)
    w.write_tile(10, 843, 387, PNG)
    assert w.has_tile(10, 843, 387)
    w.close((39.8, 116.2, 40.0, 116.6), 10, 10)

    tile_file = tmp_path / "tiles" / "10" / "843" / "387.png"
    assert tile_file.read_bytes() == PNG
    meta = json.loads((tmp_path / "tiles" / "metadata.json").read_text())
    assert meta["format"] == "png"
    assert meta["scheme"] == "xyz"
    assert meta["bounds"] == "116.2,39.8,116.6,40.0"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd python && .venv/bin/python -m pytest tests/test_tiles.py -v`
Expected: FAIL — `ImportError: cannot import name 'MBTilesWriter'`

- [ ] **Step 3: 在 services/tiles.py 末尾追加两个 Writer**

```python
class MBTilesWriter:
    """Write tiles into an MBTiles (SQLite) file.

    MBTiles stores rows in TMS scheme, so XYZ y is inverted on write.
    Re-opening an existing file resumes it: has_tile() sees prior tiles.
    Single event-loop thread writes only — no locking needed.
    """

    def __init__(self, path: str, name: str):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.format: str | None = None
        cur = self.conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS metadata (name text, value text)")
        cur.execute(
            "CREATE TABLE IF NOT EXISTS tiles "
            "(zoom_level integer, tile_column integer, tile_row integer, tile_data blob)"
        )
        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles "
            "(zoom_level, tile_column, tile_row)"
        )
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS metadata_name ON metadata (name)")
        self._set_meta("name", name)
        self._set_meta("type", "baselayer")
        self._set_meta("version", "1")
        self.conn.commit()

    def _set_meta(self, key: str, value) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)", (key, str(value))
        )

    def has_tile(self, z: int, x: int, y: int) -> bool:
        row = (2 ** z) - y - 1
        cur = self.conn.execute(
            "SELECT 1 FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1",
            (z, x, row),
        )
        return cur.fetchone() is not None

    def write_tile(self, z: int, x: int, y: int, data: bytes) -> None:
        if self.format is None:
            self.format = detect_format(data)
        row = (2 ** z) - y - 1
        self.conn.execute(
            "INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) "
            "VALUES (?, ?, ?, ?)",
            (z, x, row, sqlite3.Binary(data)),
        )

    def close(self, bounds: tuple, min_zoom: int, max_zoom: int) -> None:
        south, west, north, east = bounds
        if self.format is None:
            # Resume run where every tile was skipped — keep the existing format
            row = self.conn.execute("SELECT value FROM metadata WHERE name='format'").fetchone()
            self.format = row[0] if row else "png"
        self._set_meta("format", self.format)
        self._set_meta("bounds", f"{west},{south},{east},{north}")
        self._set_meta("center", f"{(west + east) / 2},{(south + north) / 2},{min_zoom}")
        self._set_meta("minzoom", min_zoom)
        self._set_meta("maxzoom", max_zoom)
        self.conn.commit()
        self.conn.close()


class DirectoryWriter:
    """Write tiles as <root>/{z}/{x}/{y}.<ext> plus a metadata.json."""

    def __init__(self, root: str, name: str):
        self.root = Path(root)
        self.name = name
        self.format: str | None = None
        self.root.mkdir(parents=True, exist_ok=True)

    def _tile_path(self, z: int, x: int, y: int) -> Path:
        return self.root / str(z) / str(x) / f"{y}.{self.format or 'png'}"

    def has_tile(self, z: int, x: int, y: int) -> bool:
        # format 未知（本次尚未写入任何瓦片）时按 png 猜测路径，猜不中就重新下载，无害
        return self._tile_path(z, x, y).exists()

    def write_tile(self, z: int, x: int, y: int, data: bytes) -> None:
        if self.format is None:
            self.format = detect_format(data)
        path = self._tile_path(z, x, y)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def close(self, bounds: tuple, min_zoom: int, max_zoom: int) -> None:
        south, west, north, east = bounds
        meta = {
            "name": self.name,
            "format": self.format or "png",
            "bounds": f"{west},{south},{east},{north}",
            "minzoom": min_zoom,
            "maxzoom": max_zoom,
            "scheme": "xyz",
            "tilesize": 256,
            "profile": "mercator",
        }
        (self.root / "metadata.json").write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
        )
```

- [ ] **Step 4: 运行确认通过**

Run: `cd python && .venv/bin/python -m pytest tests/test_tiles.py -v`
Expected: 9 PASS

- [ ] **Step 5: Commit**

```bash
git add python/services/tiles.py python/tests/test_tiles.py
git commit -m "feat: add MBTiles and directory tile writers"
```

---

### Task 4: 异步下载引擎与任务注册表(services/tile_tasks.py)

**Files:**
- Create: `python/services/tile_tasks.py`
- Test: `python/tests/test_tile_tasks.py`

- [ ] **Step 1: 写失败的测试**

创建 `python/tests/test_tile_tasks.py`:

```python
# python/tests/test_tile_tasks.py
import asyncio
import sys, os
from unittest.mock import patch, AsyncMock
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services import tile_tasks
from services.tiles import MBTilesWriter

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def test_qualify_url():
    assert (
        tile_tasks.qualify_url("https://a.b/{z}/{x}/{y}.png", 10, 843, 387)
        == "https://a.b/10/843/387.png"
    )
    assert (
        tile_tasks.qualify_url("https://mt0.google.com/vt?x={x}&y={y}&z={z}", 3, 1, 2)
        == "https://mt0.google.com/vt?x=1&y=2&z=3"
    )


async def _wait_done(task, timeout=5.0):
    for _ in range(int(timeout / 0.05)):
        if task.status != "running":
            return
        await asyncio.sleep(0.05)
    raise TimeoutError(f"task stuck: {task.status}")


async def test_download_completes(tmp_path):
    writer = MBTilesWriter(str(tmp_path / "t.mbtiles"), "test")
    with patch.object(tile_tasks, "_fetch_tile", new=AsyncMock(return_value=PNG)):
        # bbox 很小 → z10 单瓦片，z11 也很少
        task = tile_tasks.start_download(
            writer, "https://a.b/{z}/{x}/{y}.png", 39.90, 116.39, 39.91, 116.40, 10, 11
        )
        assert task.total >= 2
        await _wait_done(task)
    assert task.status == "completed"
    assert task.done == task.total
    assert task.failed == 0
    state = tile_tasks.get_task(task.task_id)
    assert state is task


async def test_download_counts_failures(tmp_path):
    writer = MBTilesWriter(str(tmp_path / "t.mbtiles"), "test")
    with patch.object(tile_tasks, "_fetch_tile", new=AsyncMock(return_value=None)):
        task = tile_tasks.start_download(
            writer, "https://a.b/{z}/{x}/{y}.png", 39.90, 116.39, 39.91, 116.40, 10, 10
        )
        await _wait_done(task)
    assert task.status == "completed"
    assert task.failed == task.total
    assert task.done == 0


async def test_download_cancel(tmp_path):
    writer = MBTilesWriter(str(tmp_path / "t.mbtiles"), "test")

    async def slow_fetch(client, url):
        await asyncio.sleep(0.2)
        return PNG

    with patch.object(tile_tasks, "_fetch_tile", new=slow_fetch):
        # 大一点的范围保证取消时还有剩余瓦片
        task = tile_tasks.start_download(
            writer, "https://a.b/{z}/{x}/{y}.png", 39.5, 116.0, 40.0, 116.5, 12, 12
        )
        await asyncio.sleep(0.05)
        assert tile_tasks.request_cancel(task.task_id) is True
        await _wait_done(task)
    assert task.status == "cancelled"
    assert task.done < task.total


def test_cancel_unknown_task_returns_false():
    assert tile_tasks.request_cancel("nope") is False
```

- [ ] **Step 2: 运行确认失败**

Run: `cd python && .venv/bin/python -m pytest tests/test_tile_tasks.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.tile_tasks'`

- [ ] **Step 3: 实现下载引擎**

创建 `python/services/tile_tasks.py`:

```python
"""
Async tile download engine with an in-memory task registry.

start_download() must be called from a running event loop (FastAPI handler);
the download runs as a background asyncio task and the caller polls TileTask.
"""
import asyncio
import uuid
from dataclasses import dataclass, asdict

import httpx

from services.netutil import PROXY_MOUNTS
from services.tiles import iter_tiles

CONCURRENCY = 6
MAX_RETRIES = 2
TIMEOUT = 20.0

# Browser-like headers — several tile servers reject unknown user agents
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
}


@dataclass
class TileTask:
    task_id: str
    total: int
    done: int = 0
    failed: int = 0
    skipped: int = 0
    status: str = "running"  # running | completed | cancelled | error
    message: str = ""
    cancel_requested: bool = False

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("cancel_requested")
        return d


_tasks: dict[str, TileTask] = {}


def get_task(task_id: str) -> TileTask | None:
    return _tasks.get(task_id)


def request_cancel(task_id: str) -> bool:
    task = _tasks.get(task_id)
    if task is None or task.status != "running":
        return False
    task.cancel_requested = True
    return True


def qualify_url(template: str, z: int, x: int, y: int) -> str:
    return template.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))


async def _fetch_tile(client: httpx.AsyncClient, url: str) -> bytes | None:
    """Fetch one tile with retries. Returns None on permanent failure."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = await client.get(url)
            if resp.status_code == 200 and resp.content:
                return resp.content
            if 400 <= resp.status_code < 500:
                return None  # 4xx won't get better on retry
        except httpx.HTTPError:
            pass
        if attempt < MAX_RETRIES:
            await asyncio.sleep(0.5 * (attempt + 1))
    return None


async def _run(task: TileTask, writer, template: str, tiles: list) -> None:
    tile_iter = iter(tiles)  # shared by workers; next() is atomic in one event loop

    async with httpx.AsyncClient(
        timeout=TIMEOUT, verify=False, headers=HEADERS, mounts=PROXY_MOUNTS or None
    ) as client:

        async def worker() -> None:
            for z, x, y in tile_iter:
                if task.cancel_requested:
                    return
                if writer.has_tile(z, x, y):
                    task.skipped += 1
                    continue
                data = await _fetch_tile(client, qualify_url(template, z, x, y))
                if data is None:
                    task.failed += 1
                else:
                    writer.write_tile(z, x, y, data)
                    task.done += 1

        await asyncio.gather(*(worker() for _ in range(CONCURRENCY)))


def start_download(
    writer,
    template: str,
    south: float,
    west: float,
    north: float,
    east: float,
    min_zoom: int,
    max_zoom: int,
) -> TileTask:
    tiles = list(iter_tiles(south, west, north, east, min_zoom, max_zoom))
    task = TileTask(task_id=uuid.uuid4().hex, total=len(tiles))
    _tasks[task.task_id] = task

    async def runner() -> None:
        try:
            await _run(task, writer, template, tiles)
            writer.close((south, west, north, east), min_zoom, max_zoom)
            task.status = "cancelled" if task.cancel_requested else "completed"
        except Exception as e:
            task.status = "error"
            task.message = str(e)

    asyncio.get_running_loop().create_task(runner())
    return task
```

- [ ] **Step 4: 运行确认通过**

Run: `cd python && .venv/bin/python -m pytest tests/test_tile_tasks.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add python/services/tile_tasks.py python/tests/test_tile_tasks.py
git commit -m "feat: add async tile download engine with task registry"
```

---

### Task 5: FastAPI 路由(routers/tiles.py)

**Files:**
- Create: `python/routers/tiles.py`
- Modify: `python/main.py:5,17`
- Test: `python/tests/test_tiles_router.py`

- [ ] **Step 1: 写失败的测试**

创建 `python/tests/test_tiles_router.py`:

```python
# python/tests/test_tiles_router.py
import time
import sys, os
from unittest.mock import patch, AsyncMock
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from main import app
from services import tile_tasks

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _req(tmp_path, **overrides):
    body = {
        "south": 39.90, "west": 116.39, "north": 39.91, "east": 116.40,
        "min_zoom": 10, "max_zoom": 11,
        "url_template": "https://a.b/{z}/{x}/{y}.png",
        "output": "mbtiles",
        "path": str(tmp_path / "out.mbtiles"),
        "name": "test",
    }
    body.update(overrides)
    return body


def test_download_lifecycle(tmp_path):
    with patch.object(tile_tasks, "_fetch_tile", new=AsyncMock(return_value=PNG)):
        # 用 context manager 保持事件循环存活，后台任务才能跑完
        with TestClient(app) as client:
            resp = client.post("/tiles/download", json=_req(tmp_path))
            assert resp.status_code == 200
            data = resp.json()
            task_id = data["task_id"]
            assert data["total"] >= 2

            for _ in range(100):
                state = client.get(f"/tiles/tasks/{task_id}").json()
                if state["status"] != "running":
                    break
                time.sleep(0.05)
            assert state["status"] == "completed"
            assert state["done"] == data["total"]
    assert (tmp_path / "out.mbtiles").exists()


def test_download_rejects_bad_bbox(tmp_path):
    with TestClient(app) as client:
        resp = client.post("/tiles/download", json=_req(tmp_path, south=40.0, north=39.0))
        assert resp.status_code == 400


def test_download_rejects_bad_template(tmp_path):
    with TestClient(app) as client:
        resp = client.post("/tiles/download", json=_req(tmp_path, url_template="https://a.b/no-placeholders"))
        assert resp.status_code == 400


def test_download_rejects_too_many_tiles(tmp_path):
    with TestClient(app) as client:
        resp = client.post(
            "/tiles/download",
            json=_req(tmp_path, south=-80, west=-179, north=80, east=179, min_zoom=1, max_zoom=14),
        )
        assert resp.status_code == 400
        assert "瓦片数量过多" in resp.json()["detail"]


def test_get_unknown_task_404():
    with TestClient(app) as client:
        assert client.get("/tiles/tasks/nope").status_code == 404
        assert client.post("/tiles/tasks/nope/cancel").status_code == 404
```

- [ ] **Step 2: 运行确认失败**

Run: `cd python && .venv/bin/python -m pytest tests/test_tiles_router.py -v`
Expected: FAIL — `/tiles/download` 返回 404(路由未挂载)

- [ ] **Step 3: 实现路由**

创建 `python/routers/tiles.py`:

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import tile_tasks
from services.tiles import MBTilesWriter, DirectoryWriter, count_tiles

router = APIRouter()

MAX_TILES = 200_000


class TileDownloadRequest(BaseModel):
    south: float
    west: float
    north: float
    east: float
    min_zoom: int
    max_zoom: int
    url_template: str
    output: str  # "mbtiles" | "directory"
    path: str    # .mbtiles file path, or output directory
    name: str = "tiles"


@router.post("/download")
async def start_download(req: TileDownloadRequest):
    if req.south >= req.north or req.west >= req.east:
        raise HTTPException(status_code=400, detail="无效的范围：要求 south < north 且 west < east")
    if not (0 <= req.min_zoom <= req.max_zoom <= 22):
        raise HTTPException(status_code=400, detail="无效的缩放级别范围")
    if any(p not in req.url_template for p in ("{z}", "{x}", "{y}")):
        raise HTTPException(status_code=400, detail="URL 模板必须包含 {z}、{x}、{y} 占位符")

    total = count_tiles(req.south, req.west, req.north, req.east, req.min_zoom, req.max_zoom)
    if total > MAX_TILES:
        raise HTTPException(
            status_code=400,
            detail=f"瓦片数量过多（{total} > {MAX_TILES}），请缩小范围或降低最大缩放级别",
        )

    try:
        if req.output == "mbtiles":
            writer = MBTilesWriter(req.path, req.name)
        elif req.output == "directory":
            writer = DirectoryWriter(req.path, req.name)
        else:
            raise HTTPException(status_code=400, detail=f"不支持的输出格式：{req.output}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法创建输出文件：{e}")

    task = tile_tasks.start_download(
        writer, req.url_template,
        req.south, req.west, req.north, req.east,
        req.min_zoom, req.max_zoom,
    )
    return {"task_id": task.task_id, "total": task.total}


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task = tile_tasks.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task.to_dict()


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    if not tile_tasks.request_cancel(task_id):
        raise HTTPException(status_code=404, detail="任务不存在或已结束")
    return {"ok": True}
```

修改 `python/main.py` 两处:

```python
from routers import health, data, tiles
```

```python
app.include_router(tiles.router, prefix="/tiles")
```

- [ ] **Step 4: 运行全部后端测试**

Run: `cd python && .venv/bin/python -m pytest tests/ -v`
Expected: 全部 PASS(新增 5 个 + 既有测试)

- [ ] **Step 5: Commit**

```bash
git add python/routers/tiles.py python/main.py python/tests/test_tiles_router.py
git commit -m "feat: add /tiles download API (start, progress, cancel)"
```

---

### Task 6: 前端瓦片计数、URL 模板与 API 封装

**Files:**
- Create: `src/renderer/src/utils/tileMath.ts`
- Modify: `src/renderer/src/components/MapCanvas/tileProviders.ts`(末尾追加函数)
- Modify: `src/renderer/src/services/api.ts`(末尾追加)

- [ ] **Step 1: 创建 tileMath.ts**

```typescript
/**
 * Tile math for download size estimation.
 * Mirrors python/services/tiles.py — keep the two in sync.
 */

const MAX_LAT = 85.05112878

export function deg2num(lat: number, lon: number, zoom: number): [number, number] {
  const clamped = Math.max(Math.min(lat, MAX_LAT), -MAX_LAT)
  const n = Math.pow(2, zoom)
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (clamped * Math.PI) / 180
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n)
  return [Math.min(Math.max(x, 0), n - 1), Math.min(Math.max(y, 0), n - 1)]
}

export function countTiles(
  south: number,
  west: number,
  north: number,
  east: number,
  minZoom: number,
  maxZoom: number
): number {
  let total = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const [xMin, yMin] = deg2num(north, west, z)
    const [xMax, yMax] = deg2num(south, east, z)
    total += (xMax - xMin + 1) * (yMax - yMin + 1)
  }
  return total
}
```

- [ ] **Step 2: tileProviders.ts 末尾追加模板提取函数**

```typescript
/** Extract the raw {z}/{x}/{y} tile URL template for a provider (for tile download). */
export function getTileUrlTemplate(provider: MapProvider, apiKeys: ApiKeys): string {
  const style = getTileStyle(provider, apiKeys)
  const source = Object.values(style.sources)[0] as { tiles?: string[] }
  return source.tiles?.[0] ?? ''
}
```

- [ ] **Step 3: api.ts 末尾追加**

```typescript
// ---------------------------------------------------------------------------
// Map tile download
// ---------------------------------------------------------------------------

export interface TileDownloadRequest {
  south: number
  west: number
  north: number
  east: number
  min_zoom: number
  max_zoom: number
  url_template: string
  output: 'mbtiles' | 'directory'
  path: string
  name: string
}

export interface TileTaskState {
  task_id: string
  total: number
  done: number
  failed: number
  skipped: number
  status: 'running' | 'completed' | 'cancelled' | 'error'
  message: string
}

export async function startTileDownload(
  req: TileDownloadRequest
): Promise<{ task_id: string; total: number }> {
  return postJson('/tiles/download', req)
}

export async function getTileTask(taskId: string): Promise<TileTaskState> {
  const resp = await fetch(`${baseUrl}/tiles/tasks/${taskId}`)
  if (!resp.ok) throw new Error(await resp.text())
  return resp.json() as Promise<TileTaskState>
}

export async function cancelTileTask(taskId: string): Promise<void> {
  const resp = await fetch(`${baseUrl}/tiles/tasks/${taskId}/cancel`, { method: 'POST' })
  if (!resp.ok) throw new Error(await resp.text())
}
```

- [ ] **Step 4: 类型检查**

Run: `npm run typecheck`
Expected: PASS(0 errors)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/utils/tileMath.ts src/renderer/src/components/MapCanvas/tileProviders.ts src/renderer/src/services/api.ts
git commit -m "feat: add tile download API client and tile count estimation"
```

---

### Task 7: TilesDownloadModal 组件

**Files:**
- Create: `src/renderer/src/components/TilesDownload/TilesDownloadModal.tsx`

- [ ] **Step 1: 创建组件**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal, Form, InputNumber, Slider, Select, Radio, Input, Button, Space,
  Typography, Progress, message
} from 'antd'
import { DownloadOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getTileUrlTemplate, type MapProvider } from '../MapCanvas/tileProviders'
import { countTiles } from '../../utils/tileMath'
import {
  startTileDownload, getTileTask, cancelTileTask, type TileTaskState
} from '../../services/api'

const { Text } = Typography

const WARN_TILES = 10_000
const MAX_TILES = 200_000 // 与后端 routers/tiles.py MAX_TILES 保持一致

const SOURCE_OPTIONS: { value: MapProvider | 'custom'; label: string }[] = [
  { value: 'osm', label: 'OSM 街道图' },
  { value: 'google-street', label: 'Google 街道图' },
  { value: 'google-satellite', label: 'Google 卫星图' },
  { value: 'amap-street', label: '高德街道图' },
  { value: 'amap-satellite', label: '高德影像图' },
  { value: 'amap-terrain', label: '高德地形图' },
  { value: 'custom', label: '自定义 URL 模板' }
]

interface Props {
  open: boolean
  bounds: [number, number, number, number] | null // [south, west, north, east]
  onClose: () => void
}

export default function TilesDownloadModal({ open, bounds, onClose }: Props) {
  const provider = useMapStore((s) => s.provider)
  const apiKeys = useSettingsStore((s) => s.apiKeys)

  const [south, setSouth] = useState(0)
  const [west, setWest] = useState(0)
  const [north, setNorth] = useState(0)
  const [east, setEast] = useState(0)
  const [zoomRange, setZoomRange] = useState<[number, number]>([10, 14])
  const [source, setSource] = useState<MapProvider | 'custom'>('osm')
  const [customTemplate, setCustomTemplate] = useState('')
  const [output, setOutput] = useState<'mbtiles' | 'directory'>('mbtiles')
  const [path, setPath] = useState('')

  const [task, setTask] = useState<TileTaskState | null>(null)
  const [starting, setStarting] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 打开时用右键捕获的视图范围和当前底图初始化表单
  useEffect(() => {
    if (open && bounds) {
      setSouth(parseFloat(bounds[0].toFixed(6)))
      setWest(parseFloat(bounds[1].toFixed(6)))
      setNorth(parseFloat(bounds[2].toFixed(6)))
      setEast(parseFloat(bounds[3].toFixed(6)))
      setSource(provider)
    }
  }, [open, bounds, provider])

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }
  useEffect(() => stopPolling, [])

  const urlTemplate =
    source === 'custom' ? customTemplate.trim() : getTileUrlTemplate(source, apiKeys)

  const estimate = useMemo(() => {
    if (south >= north || west >= east) return 0
    return countTiles(south, west, north, east, zoomRange[0], zoomRange[1])
  }, [south, west, north, east, zoomRange])

  const running = task?.status === 'running'
  const canStart =
    !running && !starting && estimate > 0 && estimate <= MAX_TILES &&
    path !== '' && urlTemplate.includes('{z}')

  const handlePickPath = async () => {
    if (output === 'mbtiles') {
      const p = await window.electronAPI.saveFileDialog([
        { name: 'MBTiles', extensions: ['mbtiles'] }
      ])
      if (p) setPath(p)
    } else {
      const p = await window.electronAPI.openDirectoryDialog()
      if (p) setPath(p)
    }
  }

  const handleStart = async () => {
    setStarting(true)
    setTask(null)
    try {
      const { task_id } = await startTileDownload({
        south, west, north, east,
        min_zoom: zoomRange[0], max_zoom: zoomRange[1],
        url_template: urlTemplate,
        output, path,
        name: path.split('/').pop()?.replace(/\.mbtiles$/, '') || 'tiles'
      })
      pollTimer.current = setInterval(async () => {
        try {
          const state = await getTileTask(task_id)
          setTask(state)
          if (state.status !== 'running') {
            stopPolling()
            if (state.status === 'completed') {
              message.success(
                `下载完成：成功 ${state.done}，跳过 ${state.skipped}，失败 ${state.failed}`
              )
            } else if (state.status === 'cancelled') {
              message.info('下载已取消，已下载的瓦片已保留（重新开始会自动跳过）')
            } else {
              message.error(`下载出错：${state.message}`)
            }
          }
        } catch {
          // 单次轮询失败忽略，下个周期重试
        }
      }, 500)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const handleCancel = async () => {
    if (task && running) {
      try {
        await cancelTileTask(task.task_id)
      } catch {
        // 任务可能刚好已结束
      }
    }
  }

  const handleClose = () => {
    if (running) {
      message.warning('下载进行中，请先取消或等待完成')
      return
    }
    stopPolling()
    setTask(null)
    setPath('')
    onClose()
  }

  const progressPercent = task && task.total > 0
    ? Math.round(((task.done + task.failed + task.skipped) / task.total) * 100)
    : 0

  return (
    <Modal
      title="下载地图瓦片"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={520}
      maskClosable={false}
    >
      <Form layout="vertical" size="small">
        <Form.Item label="范围（WGS-84，来自右键时的地图视图，可微调）" style={{ marginBottom: 8 }}>
          <Space wrap>
            <InputNumber addonBefore="南" value={south} onChange={(v) => setSouth(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
            <InputNumber addonBefore="北" value={north} onChange={(v) => setNorth(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
            <InputNumber addonBefore="西" value={west} onChange={(v) => setWest(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
            <InputNumber addonBefore="东" value={east} onChange={(v) => setEast(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
          </Space>
        </Form.Item>

        <Form.Item label={`缩放级别 ${zoomRange[0]} ~ ${zoomRange[1]}`} style={{ marginBottom: 8 }}>
          <Slider range min={0} max={19} value={zoomRange} onChange={(v) => setZoomRange(v as [number, number])} disabled={running} />
        </Form.Item>

        <Form.Item label="瓦片源" style={{ marginBottom: 8 }}>
          <Select value={source} options={SOURCE_OPTIONS} onChange={setSource} disabled={running} />
        </Form.Item>

        {source === 'custom' && (
          <Form.Item label="URL 模板（须包含 {z} {x} {y}）" style={{ marginBottom: 8 }}>
            <Input
              placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
              value={customTemplate}
              onChange={(e) => setCustomTemplate(e.target.value)}
              disabled={running}
            />
          </Form.Item>
        )}

        <Form.Item label="输出格式" style={{ marginBottom: 8 }}>
          <Radio.Group
            value={output}
            onChange={(e) => { setOutput(e.target.value); setPath('') }}
            disabled={running}
          >
            <Radio.Button value="mbtiles">MBTiles 文件</Radio.Button>
            <Radio.Button value="directory">z/x/y 目录</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="保存位置" style={{ marginBottom: 8 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input value={path} readOnly placeholder="点击右侧按钮选择" />
            <Button icon={<FolderOpenOutlined />} onClick={handlePickPath} disabled={running}>
              选择
            </Button>
          </Space.Compact>
        </Form.Item>

        <div style={{ marginBottom: 12 }}>
          <Text type={estimate > MAX_TILES ? 'danger' : estimate > WARN_TILES ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
            预计 {estimate.toLocaleString()} 张瓦片
            {estimate > MAX_TILES && ` — 超过上限 ${MAX_TILES.toLocaleString()}，请缩小范围或降低级别`}
            {estimate > WARN_TILES && estimate <= MAX_TILES && ' — 数量较大，下载可能较慢且占用服务器资源'}
          </Text>
        </div>

        {task && (
          <div style={{ marginBottom: 12 }}>
            <Progress
              percent={progressPercent}
              status={task.status === 'error' ? 'exception' : task.status === 'completed' ? 'success' : 'active'}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              成功 {task.done} / 跳过 {task.skipped} / 失败 {task.failed} / 共 {task.total}
            </Text>
          </div>
        )}

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {running ? (
            <Button danger onClick={handleCancel}>取消下载</Button>
          ) : (
            <Button type="primary" icon={<DownloadOutlined />} loading={starting} disabled={!canStart} onClick={handleStart}>
              开始下载
            </Button>
          )}
        </Space>
      </Form>
    </Modal>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TilesDownload/TilesDownloadModal.tsx
git commit -m "feat: add tiles download modal (zoom range, source, output, progress)"
```

---

### Task 8: 右键菜单与 App 装配 + i18n

**Files:**
- Modify: `src/renderer/src/components/MapCanvas/MapContextMenu.tsx`
- Modify: `src/renderer/src/components/MapCanvas/MapCanvas.tsx:23,26,272`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/locales/zh.json` / `src/renderer/src/locales/en.json`

- [ ] **Step 1: MapContextMenu 支持多个菜单项**

将 `MapContextMenu.tsx` 的 Props 和渲染部分改为(保留 `ContextMenuPos` 不变):

```tsx
interface Props {
  pos: ContextMenuPos | null
  onExtract: (bounds: [number, number, number, number]) => void
  onTilesDownload: (bounds: [number, number, number, number]) => void
  onClose: () => void
}

export default function MapContextMenu({ pos, onExtract, onTilesDownload, onClose }: Props) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pos, onClose])

  if (!pos) return null

  const items = [
    { label: t('osm.menuItem'), action: onExtract },
    { label: t('tiles.menuItem'), action: onTilesDownload }
  ]

  const menuWidth = 180
  const menuHeight = 8 + items.length * 32
  const left = pos.x + menuWidth > window.innerWidth ? pos.x - menuWidth : pos.x
  const top = pos.y + menuHeight > window.innerHeight ? pos.y - menuHeight : pos.y

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        top,
        background: '#fff',
        border: '1px solid #e8e8e8',
        borderRadius: 6,
        boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
        zIndex: 1000,
        minWidth: menuWidth,
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: 13,
            color: '#333',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = '#f5f5f5')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
          onClick={() => {
            onClose()
            item.action(pos.bounds)
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: MapCanvas 透传回调**

`MapCanvas.tsx` 三处修改:

Props 接口(第 23 行附近)追加:

```tsx
  onTilesDownload?: (bounds: [number, number, number, number]) => void
```

函数签名(第 26 行附近):

```tsx
export default function MapCanvas({ onSave, onOsmExtract, onTilesDownload }: Props) {
```

`<MapContextMenu>` 渲染处(第 270 行附近)追加 prop:

```tsx
      <MapContextMenu
        pos={contextMenuPos}
        onExtract={(bounds) => onOsmExtract?.(bounds)}
        onTilesDownload={(bounds) => onTilesDownload?.(bounds)}
        onClose={() => setContextMenuPos(null)}
      />
```

- [ ] **Step 3: App.tsx 装配**

参照 `OsmExtractModal` 的既有写法(App.tsx:28-29、374-376、431-434):

导入:

```tsx
import TilesDownloadModal from './components/TilesDownload/TilesDownloadModal'
```

状态(与 osmExtract 状态并排):

```tsx
  const [tilesDownloadOpen, setTilesDownloadOpen] = useState(false)
  const [tilesDownloadBounds, setTilesDownloadBounds] = useState<
    [number, number, number, number] | null
  >(null)
```

`<MapCanvas>` 处追加 prop(onOsmExtract 旁):

```tsx
            onTilesDownload={(bounds) => {
              setTilesDownloadBounds(bounds)
              setTilesDownloadOpen(true)
            }}
```

模态渲染(OsmExtractModal 旁):

```tsx
      <TilesDownloadModal
        open={tilesDownloadOpen}
        bounds={tilesDownloadBounds}
        onClose={() => setTilesDownloadOpen(false)}
      />
```

- [ ] **Step 4: i18n 文案**

`zh.json` 的 `"osm"` 节点后追加:

```json
  "tiles": {
    "menuItem": "下载地图瓦片"
  },
```

`en.json` 对应位置追加:

```json
  "tiles": {
    "menuItem": "Download Map Tiles"
  },
```

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/MapCanvas/MapContextMenu.tsx src/renderer/src/components/MapCanvas/MapCanvas.tsx src/renderer/src/App.tsx src/renderer/src/locales/zh.json src/renderer/src/locales/en.json
git commit -m "feat: wire tiles download into map context menu"
```

---

### Task 9: 文档与端到端验证

**Files:**
- Modify: `CLAUDE.md`(OSM Feature Extraction 章节之后)

- [ ] **Step 1: CLAUDE.md 追加功能文档**

在 "OSM Feature Extraction" 章节后追加:

```markdown
---

## Map Tiles Download

Right-click on map → "下载地图瓦片" → pick zoom range / source / output → download XYZ raster tiles.

### Data flow
```
Right-click (drawMode must be 'off') → ContextMenuPos { x, y, bounds }
  → TilesDownloadModal (bbox editable, zoom range slider, source select, output format)
  → POST /tiles/download { south, west, north, east, min_zoom, max_zoom,
                           url_template, output: 'mbtiles'|'directory', path, name }
      → python/services/tile_tasks.py: asyncio engine, 6 concurrent workers,
        2 retries per tile, browser-like UA headers
      → python/services/tiles.py: MBTilesWriter (sqlite3, TMS y-inversion)
        or DirectoryWriter ({z}/{x}/{y}.<ext> + metadata.json)
  → renderer polls GET /tiles/tasks/{id} every 500 ms → Progress bar
  → POST /tiles/tasks/{id}/cancel to cancel (already-written tiles are kept)
```

### Key behaviors
- Tile count hard limit: 200,000 per request (MAX_TILES in routers/tiles.py,
  mirrored in TilesDownloadModal.tsx); UI warns above 10,000.
- Resume: re-running against the same .mbtiles file / directory skips existing
  tiles (`has_tile` dedup) — cancel + restart is safe.
- URL templates come from tileProviders.ts `getTileUrlTemplate()` or a custom
  `{z}/{x}/{y}` template typed by the user. Only XYZ placeholders supported
  (no quadkey).
- Amap tiles are GCJ-02 grid tiles downloaded as-is — no coordinate conversion
  is involved in tile download.
- Tile image format (png/jpg/webp) is sniffed from magic bytes, not headers.
```

- [ ] **Step 2: 全量测试**

Run: `cd python && .venv/bin/python -m pytest tests/ -v && cd .. && npm run typecheck`
Expected: 后端全部 PASS,前端 0 error

- [ ] **Step 3: 手动端到端验证**

1. `npm run dev` 启动应用
2. 缩放到一个小城市范围(如 z12 视图),右键 → "下载地图瓦片"
3. 确认 bbox 已按当前视图预填,瓦片估算数随 zoom 滑块实时变化
4. 瓦片源选 OSM,缩放 10~13,输出 MBTiles,选择保存路径,开始下载
5. 观察进度条推进到 100%,提示"下载完成"
6. `sqlite3 <文件>.mbtiles "SELECT COUNT(*) FROM tiles; SELECT * FROM metadata;"` 验证内容
7. 再次对同一文件下载相同范围 → 全部"跳过",秒级完成(断点续传)
8. 下载中点"取消下载" → 状态变为已取消,文件保留
9. 输出格式切"z/x/y 目录"再跑一遍,确认目录结构 `{z}/{x}/{y}.png` 与 metadata.json
10. (可选)将 .mbtiles 拖入 QGIS 验证可正常显示

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document map tiles download feature"
```

---

## 后续增强(本期不做)

- 画矩形/多边形选区(MapboxDraw rectangle mode),按多边形裁剪瓦片列表(Turf booleanDisjoint)
- 将下载好的 MBTiles 作为离线底图加载(MapLibre 需自定义 protocol 从 sqlite 读瓦片)
- quadkey 占位符支持(接入 Bing 时)
- 2x retina 四合一拼接、GeoTIFF 拼接导出
- 并发数/重试次数做成设置项
