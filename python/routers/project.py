import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services import layer_store

router = APIRouter()


@router.post("/file")
async def write_file(path: str, request: Request):
    """Atomically write the raw request body to disk.

    Used for project layer sidecar files (large GeoJSON). Writes to a temp
    file in the target directory, then os.replace — readers never see a
    half-written file. Parent directories are created as needed.
    """
    target = Path(path)
    data = await request.body()
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(target.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            os.replace(tmp, target)
        except Exception:
            Path(tmp).unlink(missing_ok=True)
            raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"写入文件失败：{e}")
    return {"ok": True, "bytes": len(data)}


@router.get("/file")
async def read_file(path: str):
    """Serve a previously written sidecar file (large GeoJSON layer source)."""
    p = Path(path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail=f"文件不存在：{path}")
    return FileResponse(p, media_type="application/json")


class CleanupRequest(BaseModel):
    dir: str
    keep: list[str]


@router.post("/cleanup")
async def cleanup(req: CleanupRequest):
    """Delete orphan *.geojson files in the sidecar directory.

    Only touches *.geojson files not listed in keep — anything else in the
    directory (or a non-existent directory) is left alone.
    """
    d = Path(req.dir)
    if not d.is_dir():
        return {"removed": 0}
    removed = 0
    for p in d.iterdir():
        if p.is_file() and p.suffix == ".geojson" and p.name not in req.keep:
            p.unlink()
            removed += 1
    return {"removed": removed}



class CopyRequest(BaseModel):
    hash: str
    path: str


@router.post("/copy")
async def copy_from_store(req: CopyRequest):
    """Copy a layer-store entry into the project sidecar directory."""
    try:
        layer_store.copy_out(req.hash, req.path)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"复制失败：{e}")