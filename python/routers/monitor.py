from fastapi import APIRouter, HTTPException, Query
from services import monitor as monitor_service

router = APIRouter()


@router.get("/earthquakes")
async def earthquakes(feed: str = Query("all_day")):
    """USGS earthquake feed as a slimmed GeoJSON FeatureCollection."""
    try:
        return await monitor_service.fetch_earthquakes(feed)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"地震数据获取失败：{e}")


@router.get("/typhoons")
async def typhoons():
    """Active (or most recent) west-Pacific typhoon tracks as GeoJSON."""
    try:
        return await monitor_service.fetch_typhoons()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"台风数据获取失败：{e}")


@router.get("/fires")
async def fires(key: str = Query(...)):
    """NASA FIRMS wildfire detections (last 24 h) as GeoJSON."""
    try:
        return await monitor_service.fetch_fires(key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"火点数据获取失败：{e}")


@router.get("/gdacs")
async def gdacs():
    """GDACS global disaster alerts as GeoJSON points."""
    try:
        return await monitor_service.fetch_gdacs()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"灾害警报获取失败：{e}")


@router.get("/waqi")
async def waqi(
    token: str = Query(...),
    south: float = Query(...),
    west: float = Query(...),
    north: float = Query(...),
    east: float = Query(...),
):
    """WAQI air-quality stations within a bounding box as GeoJSON."""
    try:
        return await monitor_service.fetch_waqi(token, south, west, north, east)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"空气质量数据获取失败：{e}")


@router.get("/rainviewer")
async def rainviewer():
    """Latest RainViewer precipitation radar frame (XYZ tile URL template)."""
    try:
        return await monitor_service.fetch_rainviewer()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"雷达数据获取失败：{e}")
