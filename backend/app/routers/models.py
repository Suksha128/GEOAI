from fastapi import APIRouter, HTTPException
from .pipeline import active_pipelines

router = APIRouter(prefix="/api/models", tags=["ML Models"])

@router.get("/predictions/{project_id}")
async def get_grid_predictions(project_id: str):
    """Query binned grid zonal metrics and model output probabilities."""
    if project_id not in active_pipelines:
        raise HTTPException(status_code=404, detail="Project ID not found in pipeline manager.")
        
    pipeline_state = active_pipelines[project_id]
    if pipeline_state["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Pipeline is not complete (Current status: {pipeline_state['status']})")
        
    return {
        "project_id": project_id,
        "grid_cells": pipeline_state.get("predicted_grids", [])
    }
