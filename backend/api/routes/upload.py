"""
backend/api/routes/upload.py
-----------------------------
Accepts multiple uploaded files + optional lat/lon.

Accepted file types (auto-detected):
  Slope_Area_.csv, TWI_Area_.csv, Aspect_Area_.csv,
  Curvature_Area_.csv, FlowAccum_Area_.csv  → terrain area summaries
  dem.tif / DEM_Area_.csv                   → elevation data
  fields.csv / field_master.csv             → one row per field
  drone_bands.csv                           → red, nir, green per field
  soil_lab.csv                              → ph, nitrogen, clay per field

Pipeline:
  1. Parse every file, detect its type
  2. Extract terrain features from area-summary CSVs and DEM
  3. Merge field-level files by field_id
  4. Compute NDVI/NDWI/EVI from band columns
  5. Fetch 1 year of weather from Open-Meteo (no key needed)
  6. Broadcast terrain + weather to every field row
  7. Run all ML models
  8. Store session, return results

POST /api/upload/files
  form: files (multiple), lat (float), lon (float), years (int 1-5)
"""

import uuid
import logging
from typing import Optional, Annotated

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from utils.file_parser   import parse_uploaded_file, detect_file_type
from utils.terrain_parser import (
    parse_terrain_csv, parse_dem_raster,
    is_terrain_file, is_dem_raster, detect_terrain_type,
)
from utils.merger        import merge_file_map
from utils.weather_client import WeatherClient
from engine.ndvi_calculator import compute_ndvi_for_all
from engine.analyser        import analyse_all_fields
from engine.stats           import compute_farm_stats
from config import settings

logger   = logging.getLogger(__name__)
router   = APIRouter()
_weather = WeatherClient()

# In-memory session store (replace with Redis in production)
_sessions: dict[str, dict] = {}


@router.post("/files")
async def upload_files(
    files: Annotated[list[UploadFile], File()],
    lat:   Optional[float] = Form(None),
    lon:   Optional[float] = Form(None),
    years: int             = Form(1),
):
    if not files:
        raise HTTPException(400, "No files uploaded.")

    # ── 1. Parse every file ───────────────────────────────────────────────────
    file_map:        dict[str, list[dict]] = {}
    terrain_features: dict = {}
    file_meta:        list  = []

    for f in files:
        raw      = await f.read()
        filename = f.filename or "unknown"

        # ── Terrain area-summary CSV ──────────────────────────────────────────
        if is_terrain_file(filename) and not is_dem_raster(filename):
            try:
                feats = parse_terrain_csv(raw, filename)
                terrain_features.update(feats)
                file_meta.append({
                    "name":  filename,
                    "type":  f"terrain_{detect_terrain_type(filename)}",
                    "rows":  1,
                    "columns": len(feats),
                })
                logger.info("Terrain CSV parsed: %s → %d features", filename, len(feats))
                continue
            except ValueError as e:
                raise HTTPException(422, f"Terrain file error ({filename}): {e}")

        # ── DEM GeoTIFF ───────────────────────────────────────────────────────
        if is_dem_raster(filename):
            try:
                feats = parse_dem_raster(raw, filename)
                terrain_features.update(feats)
                file_meta.append({
                    "name":  filename,
                    "type":  "dem_raster",
                    "rows":  1,
                    "columns": len(feats),
                })
                logger.info("DEM raster parsed: %s → %d features", filename, len(feats))
                continue
            except ValueError as e:
                raise HTTPException(422, f"DEM error ({filename}): {e}")

        # ── Field-level CSV / JSON ────────────────────────────────────────────
        try:
            rows, headers = parse_uploaded_file(raw, filename)
        except ValueError as e:
            raise HTTPException(422, str(e))

        ftype = detect_file_type(headers)
        file_map.setdefault(ftype, []).extend(rows)
        file_meta.append({
            "name":    filename,
            "type":    ftype,
            "rows":    len(rows),
            "columns": len(headers),
        })
        logger.info("Field file: %-30s → %-15s (%d rows)", filename, ftype, len(rows))

    # ── 2. Merge field files + broadcast terrain ──────────────────────────────
    merged = merge_file_map(file_map, terrain_features or None)
    if not merged:
        raise HTTPException(
            422,
            "No field rows found. Upload a fields.csv with a field_id column, "
            "or upload terrain CSVs — the system will create one farm-level record."
        )

    # ── 3. Compute NDVI/NDWI/EVI from band columns ───────────────────────────
    merged = compute_ndvi_for_all(merged)

    # ── 4. Fetch 1-year weather from Open-Meteo (free, no key) ───────────────
    farm_lat = lat   or settings.default_lat
    farm_lon = lon   or settings.default_lon
    years    = max(1, min(5, years))

    weather_summary: dict = {}
    try:
        weather_summary = await _weather.get_farm_summary(farm_lat, farm_lon, years=years)
        logger.info(
            "Weather: %d days | rain_7d=%.1f | SPI3=%.2f | GDD=%.0f | AMI=%.1f",
            weather_summary.get("archive_days", 0),
            weather_summary.get("rainfall_7d",  0),
            weather_summary.get("spi_3",        0),
            weather_summary.get("gdd_season",   0),
            weather_summary.get("ami",          0),
        )
    except Exception as e:
        logger.warning("Weather fetch failed (%s) — using defaults", e)
        weather_summary = _default_weather()

    forecast_7d = []
    try:
        forecast_7d = await _weather.get_forecast_7day(farm_lat, farm_lon)
    except Exception:
        pass

    # Broadcast weather to every field row
    for row in merged:
        for k, v in weather_summary.items():
            if k not in row or row[k] is None:
                row[k] = v

    # ── 5. Run all ML models ──────────────────────────────────────────────────
    analysed = analyse_all_fields(merged)
    stats    = compute_farm_stats(analysed)

    # ── 6. Store session ──────────────────────────────────────────────────────
    sid = str(uuid.uuid4())[:8]
    _sessions[sid] = {
        "fields":          analysed,
        "stats":           stats,
        "files":           file_meta,
        "terrain_features": terrain_features,
        "weather":         weather_summary,
        "forecast_7d":     forecast_7d,
        "lat":             farm_lat,
        "lon":             farm_lon,
    }

    return JSONResponse({
        "session_id":      sid,
        "files_loaded":    file_meta,
        "fields_count":    len(analysed),
        "terrain_summary": {
            k: v for k, v in terrain_features.items()
            if not k.startswith("terrain") and not k.startswith("dem_class")
        },
        "weather":         weather_summary,
        "forecast_7d":     forecast_7d,
        "stats":           stats,
        "fields":          analysed,
    })


@router.get("/session/{sid}")
async def get_session(sid: str):
    if sid not in _sessions:
        raise HTTPException(404, "Session not found.")
    return _sessions[sid]


def require_session(sid: str) -> dict:
    """Used by analysis and fields routes."""
    if sid not in _sessions:
        raise HTTPException(404, f"Session '{sid}' not found.")
    return _sessions[sid]


def _default_weather() -> dict:
    return {
        "rainfall_7d": 18.0, "rainfall_30d": 62.0, "rainfall_90d": 195.0,
        "temp_avg": 29.5, "temp_avg_7d": 29.5, "temp_max_7d": 34.0,
        "humidity": 68.0, "dry_days_14": 3, "wind_kmh": 11.0, "et0_7d_mm": 28.0,
        "kharif_rain_mm": 820.0, "rabi_rain_mm": 210.0,
        "annual_rain_mm": 1180.0, "monsoon_onset_doy": 158,
        "monsoon_total_mm": 780.0, "spi_3": -0.3, "spi_6": 0.1,
        "gdd_season": 1820.0, "ami": 42.0, "aridity_index": 0.81,
        "heat_days_year": 28, "chi": 3,
        "prev_day_rain": [0.0, 4.2, 0.0, 0.0, 12.1, 0.0, 1.8],
        "forecast_rain_7d": [0.0, 0.0, 6.5, 2.1, 0.0, 0.0, 8.3],
        "weather_source": "dummy", "archive_days": 0,
    }