
"""
backend/utils/file_parser.py
─────────────────────────────
Parses CSV/JSON uploads and maps any real-world column naming
to canonical names used throughout the engine.
 
Usage:
    rows, headers = parse_uploaded_file(file_bytes, "myfile.csv")
    ftype         = detect_file_type(headers)
"""
 
import io
import re
import csv
import json
import logging
from typing import Any
 
logger = logging.getLogger(__name__)
 
# ── File type signatures ──────────────────────────────────────────────────────
FILE_SIGNATURES = {
    "terrain": {
        "label":        "QGIS Terrain Export",
        "keywords":     ["slope","twi","dem","aspect","curvature","flow_accum",
                         "terrain","zonal","ndvi","ndwi"],
        "required_any": ["slope","twi","dem"],
    },
    "drone": {
        "label":        "Drone / Spectral Export",
        "keywords":     ["red","nir","green","blue","band","spectral",
                         "reflectance","flight","canopy","evi","ndvi"],
        "required_any": ["red","nir","band"],
    },
    "soil": {
        "label":        "Soil Lab Report",
        "keywords":     ["ph","nitrogen","phosphorus","potassium",
                         "organic_carbon","clay","sand","ec","lab","npk"],
        "required_any": ["ph","nitrogen"],
    },
    "weather": {
        "label":        "Weather Station Data",
        "keywords":     ["rainfall","rain","temperature","temp","humidity",
                         "wind","solar","date","weather"],
        "required_any": ["rainfall","date"],
    },
    "field_master": {
        "label":        "Field Boundary / Master",
        "keywords":     ["field_id","zone","area","crop","land_use","farm"],
        "required_any": ["field_id","area"],
    },
}
 
# ── Canonical column alias map ────────────────────────────────────────────────
ALIASES: dict[str, list[str]] = {
    # Identifiers
    "field_id":    ["field_id","fieldid","FieldID","FID","OBJECTID","id",
                    "parcel_id","plot_id","farm_id","grid_id"],
    "zone":        ["zone","Zone","region","block","village","taluk","location"],
    "area_ha":     ["area_ha","area","Area","hectares","size_ha","plot_area"],
    "crop_type":   ["crop_type","crop","Crop","cultivation","current_crop"],
    "land_use":    ["land_use","landuse","LandUse","land_cover"],
    # Terrain
    "dem_mean":    ["dem_mean","dem","DEM","elevation","elev","altitude"],
    "slope_mean":  ["slope_mean","slope","Slope","gradient","slope_deg"],
    "aspect_mean": ["aspect_mean","aspect","Aspect"],
    "twi_mean":    ["twi_mean","twi","TWI","topographic_wetness","wetness_index"],
    "flow_accum":  ["flow_accum_mean","flow_accum","flow_accumulation",
                    "drainage_area","upslope_area"],
    "curvature":   ["curvature_mean","curvature","profile_curvature"],
    # Spectral (raw bands — NDVI computed in engine)
    "red_mean":    ["red_mean","red","RED","band3","B3","red_reflectance"],
    "nir_mean":    ["nir_mean","nir","NIR","band4","B4","band5","B5",
                    "near_infrared","nir_reflectance"],
    "green_mean":  ["green_mean","green","GREEN","band2","B2"],
    "blue_mean":   ["blue_mean","blue","BLUE","band1","B1"],
    # Computed spectral (if already exported)
    "ndvi_mean":   ["ndvi_mean","ndvi","NDVI","vegetation_index"],
    "ndwi_mean":   ["ndwi_mean","ndwi","NDWI","water_index"],
    "evi_mean":    ["evi_mean","evi","EVI"],
    "canopy_cover":["canopy_cover_pct","canopy_cover","cover_pct"],
    # Soil
    "ph":          ["ph","pH","soil_ph","PH"],
    "nitrogen":    ["nitrogen_kg_ha","nitrogen","Nitrogen","N","total_N"],
    "phosphorus":  ["phosphorus_ppm","phosphorus","Phosphorus","P"],
    "potassium":   ["potassium_ppm","potassium","Potassium","K"],
    "organic_c":   ["organic_carbon_pct","organic_carbon","OC","soc"],
    "clay_pct":    ["clay_pct","clay","Clay"],
    "sand_pct":    ["sand_pct","sand","Sand"],
    "moisture_pct":["moisture_pct","moisture","soil_moisture","vwc"],
    # Coordinates (for weather)
    "lat":         ["lat","latitude","Lat","LATITUDE"],
    "lon":         ["lon","lng","longitude","Lon","LONGITUDE"],
    # Yield (optional)
    "hist_yield":  ["hist_yield_mean","hist_yield","historical_yield",
                    "avg_yield","mean_yield"],
}
 
 
def _norm(k: str) -> str:
    """Lower-case, replace non-alphanumeric with underscore."""
    return re.sub(r"[^a-z0-9]", "_", k.lower()).strip("_")
 
 
def canonicalise(row: dict[str, Any]) -> dict[str, Any]:
    """Map every alias column name to its canonical name."""
    out = dict(row)
    norm_map = {_norm(k): k for k in row}   # normalised key → original key
 
    for canonical, variants in ALIASES.items():
        if canonical in out:
            continue
        for v in variants:
            nv = _norm(v)
            if nv in norm_map:
                out[canonical] = row[norm_map[nv]]
                break
    return out
 
 
def detect_file_type(headers: list[str]) -> str:
    """Identify file type from column headers."""
    joined = " ".join(_norm(h) for h in headers)
    best, best_score = "field_master", 0
 
    for ftype, sig in FILE_SIGNATURES.items():
        score = sum(1 for kw in sig["keywords"] if kw in joined)
        has_req = any(_norm(r) in joined for r in sig["required_any"])
        if score > best_score and has_req:
            best, best_score = ftype, score
 
    return best
 
 
# ── Parsers ───────────────────────────────────────────────────────────────────
 
def _cast(v: str) -> Any:
    """Try int → float → str."""
    if v is None or str(v).strip() == "":
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        pass
    try:
        return float(v)
    except (ValueError, TypeError):
        pass
    return v
 
 
def _parse_csv(content: bytes) -> tuple[list[dict], list[str]]:
    text    = content.decode("utf-8-sig", errors="replace")
    reader  = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    rows    = [{k: _cast(v) for k, v in row.items()} for row in reader]
    return rows, headers
 
 
def _parse_json(content: bytes) -> tuple[list[dict], list[str]]:
    data = json.loads(content.decode("utf-8"))
    if isinstance(data, dict):
        for key in ("data", "fields", "records", "rows", "features"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
        else:
            data = [data]
    if not data:
        return [], []
    headers = list(data[0].keys())
    return data, headers
 
 
def parse_uploaded_file(
    content: bytes,
    filename: str,
) -> tuple[list[dict], list[str]]:
    """
    Parse raw file bytes into list of row dicts + header list.
    Applies canonical column name mapping to every row.
    Raises ValueError on parse failure.
    """
    fn = (filename or "").lower()
    try:
        if fn.endswith(".json"):
            rows, headers = _parse_json(content)
        else:
            rows, headers = _parse_csv(content)
    except Exception as e:
        raise ValueError(f"Cannot parse '{filename}': {e}") from e
 
    if not rows:
        raise ValueError(f"'{filename}' has no data rows.")
 
    rows = [canonicalise(r) for r in rows]
    return rows, headers