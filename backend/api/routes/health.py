"""
backend/api/routes/health.py
GET /api/health  →  { status, version }
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthOut(BaseModel):
    status:  str
    version: str


@router.get("/health", response_model=HealthOut)
async def health():
    return HealthOut(status="ok", version="1.0.0")