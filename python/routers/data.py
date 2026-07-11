import tempfile
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from services.gis import file_to_layers
from services import wfs as wfs_service
from services import osm as osm_service
from services import pbf as pbf_service
from services import export as export_service

router = APIRouter()


# ---------------------------------------------------------------------------
# File import
# ---------------------------------------------------------------------------

@router.post("/import")
async def import_file(file: UploadFile = File(...)):
    filename = file.filename or 'file.geojson'
    suffix = Path(filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        layers = file_to_layers(tmp_path, filename)
        return {'layers': layers}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)


class PbfImportRequest(BaseModel):
    path: str


@router.post("/import/pbf")
async def import_pbf(req: PbfImportRequest):
    """Parse a local .osm.pbf extract into GeoJSON layers.

    The file is read directly from disk (no upload) — PBF extracts are
    large and the backend runs on the same machine.
    """
    try:
        return pbf_service.pbf_to_layers(req.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PBF 解析失败：{e}")


# ---------------------------------------------------------------------------
# Layer export (SHP / GPKG / KML / CSV — GeoJSON is written by the renderer)
# ---------------------------------------------------------------------------

class ExportRequest(BaseModel):
    geojson: dict
    format: str
    path: str   # target directory
    name: str   # base file name (sanitized server-side)


@router.post("/export")
async def export_layer(req: ExportRequest):
    try:
        files = export_service.export_layer(req.geojson, req.format, req.path, req.name)
        return {'files': files}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"导出失败：{e}")


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
