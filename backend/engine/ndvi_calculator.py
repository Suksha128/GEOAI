"""
backend/engine/ndvi_calculator.py
-----------------------------------
Computes NDVI, NDWI, EVI, SAVI from raw band reflectance means
exported by drone software (Metashape, Pix4D, DJI Terra).

Called once after file merging, before ML models run.
"""

from __future__ import annotations
import math
import logging

logger = logging.getLogger(__name__)

NDVI_STATUS = {
    "Bare Soil":   (0.00, 0.15),
    "Sparse":      (0.15, 0.30),
    "Moderate":    (0.30, 0.50),
    "Healthy":     (0.50, 0.70),
    "Very Dense":  (0.70, 1.00),
}


def _f(v) -> float | None:
    if v is None:
        return None
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (ValueError, TypeError):
        return None


def compute_ndvi(red: float, nir: float) -> float | None:
    d = nir + red
    if not d:
        return None
    return round(max(-1.0, min(1.0, (nir - red) / d)), 4)


def compute_ndwi(green: float, nir: float) -> float | None:
    d = green + nir
    if not d:
        return None
    return round(max(-1.0, min(1.0, (green - nir) / d)), 4)


def compute_evi(red: float, nir: float, blue: float) -> float | None:
    d = nir + 6 * red - 7.5 * blue + 1
    if not d:
        return None
    return round(max(-1.0, min(1.0, 2.5 * (nir - red) / d)), 4)


def compute_savi(red: float, nir: float, L: float = 0.5) -> float | None:
    d = nir + red + L
    if not d:
        return None
    return round(max(-1.0, min(1.0, ((nir - red) / d) * (1 + L))), 4)


def ndvi_status(ndvi: float | None) -> str:
    if ndvi is None:
        return "Unknown"
    for label, (lo, hi) in NDVI_STATUS.items():
        if lo <= ndvi < hi:
            return label
    return "Very Dense"


def compute_ndvi_for_row(row: dict) -> dict:
    red   = _f(row.get("red_mean"))
    nir   = _f(row.get("nir_mean"))
    green = _f(row.get("green_mean"))
    blue  = _f(row.get("blue_mean"))

    if row.get("ndvi_mean") is None and red is not None and nir is not None:
        row["ndvi_mean"]      = compute_ndvi(red, nir)
        row["ndvi_computed"]  = True

    if row.get("ndwi_mean") is None and green is not None and nir is not None:
        row["ndwi_mean"] = compute_ndwi(green, nir)

    if row.get("evi_mean") is None and all(v is not None for v in (red, nir, blue)):
        row["evi_mean"] = compute_evi(red, nir, blue)

    if row.get("savi_mean") is None and red is not None and nir is not None:
        row["savi_mean"] = compute_savi(red, nir)

    row["vegetation_status"] = ndvi_status(_f(row.get("ndvi_mean")))
    return row


def compute_ndvi_for_all(rows: list[dict]) -> list[dict]:
    computed = 0
    for row in rows:
        had = row.get("ndvi_mean") is not None
        compute_ndvi_for_row(row)
        if not had and row.get("ndvi_mean") is not None:
            computed += 1
    if computed:
        logger.info("NDVI computed from band data for %d fields", computed)
    else:
        logger.info("No band data — NDVI not computed (terrain-only mode)")
    return rows