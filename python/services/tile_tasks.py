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
