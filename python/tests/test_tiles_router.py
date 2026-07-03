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
