from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from services import tile_tasks, tile_sources, geotiff_sources
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


# ---------------------------------------------------------------------------
# Offline tile sources (serve local MBTiles / tile directories as layers)
# ---------------------------------------------------------------------------

class TileSourceRequest(BaseModel):
    path: str


@router.post("/sources")
async def register_source(req: TileSourceRequest):
    try:
        src = tile_sources.register(req.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法读取离线地图：{e}")
    return src.to_dict()


@router.get("/sources/{source_id}/{z}/{x}/{y}")
async def get_source_tile(source_id: str, z: int, x: int, y: int):
    src = tile_sources.get(source_id)
    if src is None:
        raise HTTPException(status_code=404, detail="瓦片源不存在")
    data = tile_sources.read_tile(src, z, x, y)
    if data is None:
        raise HTTPException(status_code=404, detail="瓦片不存在")
    media_type = tile_sources.MEDIA_TYPES.get(src.format, "image/png")
    return Response(content=data, media_type=media_type)


# ---------------------------------------------------------------------------
# GeoTIFF / COG sources (rendered on the fly via rasterio)
# ---------------------------------------------------------------------------

class GeoTiffRequest(BaseModel):
    path: str


@router.post("/geotiff")
async def register_geotiff(req: GeoTiffRequest):
    try:
        return geotiff_sources.register(req.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法读取 GeoTIFF：{e}")


@router.get("/geotiff/{source_id}/{z}/{x}/{y}.png")
async def get_geotiff_tile(source_id: str, z: int, x: int, y: int):
    src = geotiff_sources.get(source_id)
    if src is None:
        raise HTTPException(status_code=404, detail="GeoTIFF 源不存在")
    data = geotiff_sources.render_tile(src, z, x, y)
    if data is None:
        raise HTTPException(status_code=404, detail="瓦片超出影像范围")
    return Response(content=data, media_type="image/png")
