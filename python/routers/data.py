import tempfile
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from services.gis import file_to_geojson
from services import wfs as wfs_service
from services import osm as osm_service

router = APIRouter()


# ---------------------------------------------------------------------------
# File import
# ---------------------------------------------------------------------------

@router.post("/import")
async def import_file(file: UploadFile = File(...)):
    suffix = Path(file.filename or 'file.geojson').suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        return file_to_geojson(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# WFS 1.x / 2.x
# ---------------------------------------------------------------------------

class WFSLayersRequest(BaseModel):
    url: str


class WFSFeaturesRequest(BaseModel):
    url: str
    type_name: str
    max_features: int = 1000


@router.post("/wfs/layers")
async def get_wfs_layers(req: WFSLayersRequest):
    """Return available layer list from WFS GetCapabilities."""
    try:
        layers = await wfs_service.wfs_get_layers(req.url)
        return {'layers': layers}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wfs/features")
async def get_wfs_features(req: WFSFeaturesRequest):
    """Fetch GeoJSON FeatureCollection from a WFS endpoint."""
    try:
        return await wfs_service.wfs_get_features(req.url, req.type_name, req.max_features)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# OGC API Features
# ---------------------------------------------------------------------------

class OGCCollectionsRequest(BaseModel):
    url: str


class OGCFeaturesRequest(BaseModel):
    url: str
    collection_id: str
    max_features: int = 1000


@router.post("/ogc/collections")
async def get_ogc_collections(req: OGCCollectionsRequest):
    """Return collection list from OGC API Features /collections."""
    try:
        collections = await wfs_service.ogc_get_collections(req.url)
        return {'collections': collections}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ogc/features")
async def get_ogc_features(req: OGCFeaturesRequest):
    """Fetch GeoJSON FeatureCollection from OGC API Features."""
    try:
        return await wfs_service.ogc_get_features(req.url, req.collection_id, req.max_features)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# OSM Feature Extraction
# ---------------------------------------------------------------------------

class OsmExtractRequest(BaseModel):
    south: float
    west: float
    north: float
    east: float


@router.post("/osm/extract")
async def osm_extract(req: OsmExtractRequest):
    """Query Overpass API and return GeoJSON FeatureCollection within the given bbox."""
    try:
        return await osm_service.overpass_extract(req.south, req.west, req.north, req.east)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
