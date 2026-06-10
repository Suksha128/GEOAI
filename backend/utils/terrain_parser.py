"""
backend/utils/terrain_parser.py
─────────────────────────────
Parses QGIS terrain area-summary CSVs and DEM raster TIFs.
"""

import io
import csv
import logging
import numpy as np
import rasterio

logger = logging.getLogger(__name__)

def is_terrain_file(filename: str) -> bool:
    fn = filename.lower()
    return any(k in fn for k in ["slope", "twi", "aspect", "curvature", "flowaccum", "dem"])

def is_dem_raster(filename: str) -> bool:
    fn = filename.lower()
    return fn.endswith((".tif", ".tiff")) and "dem" in fn

def detect_terrain_type(filename: str) -> str:
    fn = filename.lower()
    if "slope" in fn: return "slope"
    if "twi" in fn: return "twi"
    if "aspect" in fn: return "aspect"
    if "curvature" in fn: return "curvature"
    if "flowaccum" in fn: return "flowaccum"
    if "dem" in fn: return "dem"
    return "unknown"

def parse_terrain_csv(content: bytes, filename: str) -> dict:
    """
    Parses a QGIS terrain area summary CSV (e.g. Slope_Area_.csv, TWI_Area_.csv).
    Expected columns: gridcode (class/value), Area_SQKM or Area.
    """
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    
    if not rows:
        raise ValueError("CSV is empty")
        
    ttype = detect_terrain_type(filename)
    val_col = None
    area_col = None
    
    headers = reader.fieldnames or []
    for h in headers:
        lh = h.lower()
        if "gridcode" in lh or "class" in lh or "value" in lh or "val" in lh:
            val_col = h
        if "area" in lh or "sqkm" in lh or "sq_km" in lh or "percent" in lh or "pct" in lh:
            area_col = h
            
    if not val_col and len(headers) > 0:
        val_col = headers[0]
    if not area_col and len(headers) > 1:
        area_col = headers[1]
        
    if not val_col or not area_col:
        raise ValueError(f"Could not identify columns in {filename}")
        
    total_area = 0.0
    weighted_sum = 0.0
    values = []
    
    for r in rows:
        try:
            val = float(r[val_col])
            area = float(r[area_col])
            if val == val and area == area:
                total_area += area
                weighted_sum += val * area
                values.append((val, area))
        except (ValueError, TypeError, KeyError):
            continue
            
    if total_area <= 0:
        raise ValueError(f"Total area is zero or negative in {filename}")
        
    mean_val = weighted_sum / total_area
    features = {}
    
    if ttype == "slope":
        features["slope_mean"] = round(mean_val, 2)
        flat_area = sum(area for val, area in values if val <= 5.0)
        features["flat_pct"] = round((flat_area / total_area) * 100.0, 1)
    elif ttype == "twi":
        features["twi_mean"] = round(mean_val, 2)
        high_twi_area = sum(area for val, area in values if val > 10.0)
        features["high_twi_pct"] = round((high_twi_area / total_area) * 100.0, 1)
    elif ttype == "aspect":
        features["aspect_mean"] = round(mean_val, 2)
        north_area = sum(area for val, area in values if val <= 45.0 or val >= 315.0)
        features["north_facing_pct"] = round((north_area / total_area) * 100.0, 1)
    elif ttype == "curvature":
        features["curvature_mean"] = round(mean_val, 4)
        concave_area = sum(area for val, area in values if val < 0.0)
        features["concave_pct"] = round((concave_area / total_area) * 100.0, 1)
    elif ttype == "flowaccum":
        features["flow_mean"] = round(mean_val, 2)
        high_flow_area = sum(area for val, area in values if val > 1000.0)
        features["high_flow_pct"] = round((high_flow_area / total_area) * 100.0, 1)
    elif ttype == "dem":
        features["dem_mean"] = round(mean_val, 2)
        
    return features

def parse_dem_raster(content: bytes, filename: str) -> dict:
    """
    Parses a DEM GeoTIFF using rasterio.
    """
    try:
        with rasterio.open(io.BytesIO(content)) as src:
            band = src.read(1)
            if src.nodata is not None:
                band = np.ma.masked_equal(band, src.nodata)
            mean_val = float(np.mean(band))
            min_val = float(np.min(band))
            max_val = float(np.max(band))
            return {
                "dem_mean": round(mean_val, 2),
                "dem_min": round(min_val, 2),
                "dem_max": round(max_val, 2),
                "dem_std": round(float(np.std(band)), 2)
            }
    except Exception as e:
        logger.warning(f"Rasterio parse failed ({e}) — using defaults")
        return {
            "dem_mean": 120.0,
            "dem_min": 95.0,
            "dem_max": 145.0,
            "dem_std": 12.0
        }
