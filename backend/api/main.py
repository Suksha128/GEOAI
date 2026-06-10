"""
backend/api/main.py
-------------------
FastAPI application entry point.
Run:   uvicorn api.main:app --reload --port 8000
Docs:  http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from api.routes import health, upload, weather, analysis, fields

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("GeoAI Platform starting …")
    yield
    logger.info("GeoAI Platform stopped.")


app = FastAPI(
    title="GeoAI Platform",
    description="Geospatial Decision Intelligence for Agriculture",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router,    prefix="/api",          tags=["health"])
app.include_router(upload.router,    prefix="/api/upload",   tags=["upload"])
app.include_router(weather.router,   prefix="/api/weather",  tags=["weather"])
app.include_router(analysis.router,  prefix="/api/analysis", tags=["analysis"])
app.include_router(fields.router,    prefix="/api/fields",   tags=["fields"])