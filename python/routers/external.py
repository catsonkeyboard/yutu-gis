"""HTTP endpoints for external services (OpenSky / adsb.fi / geocoding).

Migrated from the Electron main process (2026-09-24) — see
docs/plans/2026-09-24-main-process-network-migration.md.
"""

from fastapi import APIRouter, HTTPException, Query

from services import external as external_service

router = APIRouter()


@router.post("/opensky/token")
async def opensky_token(body: dict):
    """Exchange OpenSky client credentials for an access token (cached server-side)."""
    client_id = str(body.get("client_id") or "").strip()
    client_secret = str(body.get("client_secret") or "").strip()
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="client_id 与 client_secret 均不能为空")
    try:
        return await external_service.fetch_opensky_token(client_id, client_secret)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenSky 认证失败：{e}")


@router.get("/opensky/states")
async def opensky_states(
    lamin: float = Query(...),
    lomin: float = Query(...),
    lamax: float = Query(...),
    lomax: float = Query(...),
    client_id: str = Query(""),
    client_secret: str = Query(""),
):
    """OpenSky state vectors for a bbox. Credentials optional (anonymous mode)."""
    try:
        return await external_service.fetch_opensky_states(
            lamin, lomin, lamax, lomax, client_id, client_secret
        )
    except PermissionError:
        # Renderer treats this sentinel as "re-authenticate"; credentials travel
        # with every call, so a retry self-heals.
        raise HTTPException(status_code=401, detail="TOKEN_EXPIRED")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenSky 数据获取失败：{e}")


@router.get("/adsbfi/locations")
async def adsbfi_locations(
    lat: float = Query(...),
    lon: float = Query(...),
    dist_nm: int = Query(..., ge=1, le=250),
):
    """adsb.fi aircraft within `dist_nm` nautical miles of (lat, lon)."""
    try:
        return await external_service.fetch_adsbfi(lat, lon, dist_nm)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"adsb.fi 数据获取失败：{e}")


@router.get("/geocode")
async def geocode(q: str = Query(..., min_length=1), limit: int = Query(5, ge=1, le=20)):
    """Place search: Nominatim primary, Photon fallback."""
    try:
        return await external_service.geocode_search(q, limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
