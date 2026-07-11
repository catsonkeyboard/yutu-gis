from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import sql as sql_service

router = APIRouter()


class RegisterRequest(BaseModel):
    name: str
    geojson: dict
    layer_id: str | None = None


class QueryRequest(BaseModel):
    sql: str
    limit: int = 1000


class FileRequest(BaseModel):
    path: str
    name: str | None = None


@router.get("/status")
async def status():
    return {"spatial": sql_service.spatial_enabled()}


@router.get("/tables")
async def tables():
    return {"tables": sql_service.list_tables()}


@router.post("/tables")
async def register_table(req: RegisterRequest):
    try:
        return sql_service.register_layer(req.name, req.geojson, req.layer_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"注册图层失败：{e}")


@router.post("/files")
async def register_file(req: FileRequest):
    """Register a local file (GPKG/SHP/GeoJSON/CSV/Parquet…) as a lazy view."""
    try:
        return sql_service.register_file(req.path, req.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取文件失败：{e}")


@router.post("/query")
async def query(req: QueryRequest):
    try:
        return sql_service.run_query(req.sql, req.limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class CalculateRequest(BaseModel):
    geojson: dict
    expression: str
    field: str


@router.post("/calculate")
async def calculate_field(req: CalculateRequest):
    """Field calculator: add a computed column and return the new FeatureCollection."""
    try:
        return sql_service.calculate_field(req.geojson, req.expression, req.field)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class ExportQueryRequest(BaseModel):
    sql: str
    path: str


@router.post("/export")
async def export_query(req: ExportQueryRequest):
    """Export the full (uncapped) query result to a CSV file."""
    try:
        return sql_service.export_query(req.sql, req.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/query/geojson")
async def query_geojson(req: QueryRequest):
    try:
        return sql_service.query_as_geojson(req.sql)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
