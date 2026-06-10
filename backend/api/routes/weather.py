"""
backend/api/routes/weather.py
─────────────────────────────
Handles weather summaries and 7-day forecasts.
"""

from fastapi import APIRouter, HTTPException
from api.routes.upload import require_session

router = APIRouter()

@router.get("/forecast/{sid}")
async def get_weather_forecast(sid: str):
    session = require_session(sid)
    return {
        "forecast": session.get("forecast_7d", []),
        "lat": session.get("lat"),
        "lon": session.get("lon"),
    }

@router.get("/summary/{sid}")
async def get_weather_summary(sid: str):
    session = require_session(sid)
    return session.get("weather", {})
