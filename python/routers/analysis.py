from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.analysis import run_analysis
from services import layer_store

router = APIRouter()


class AnalysisRequest(BaseModel):
    op: str
    primary: dict
    secondary: dict | None = None
    params: dict = {}


@router.post("/run")
async def analysis_run(req: AnalysisRequest):
    """Run a vector analysis operation and return the result FeatureCollection."""
    try:
        result = run_analysis(req.op, req.primary, req.secondary, req.params)
        result['content_hash'] = layer_store.put(result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"分析失败：{e}")
