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
