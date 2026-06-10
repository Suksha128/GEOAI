"""
backend/engine/waterlogging_model.py
--------------------------------------
Waterlogging risk classifier.

Terrain inputs come from the parsed area-summary CSVs:
  twi_mean        from TWI_Area_.csv   (weighted mean TWI)
  high_twi_pct    from TWI_Area_.csv   (% area with TWI > 10)
  slope_mean      from Slope_Area_.csv (weighted mean slope)
  flat_pct        from Slope_Area_.csv (% area with slope 0-5°)
  flow_mean       from FlowAccum_Area_.csv
  high_flow_pct   from FlowAccum_Area_.csv
  dem_mean        from DEM raster or DEM_Area_.csv
  north_facing_pct from Aspect_Area_.csv
  concave_pct     from Curvature_Area_.csv

Weather inputs (from Open-Meteo 1-year archive):
  rainfall_7d, ami, spi_3, kharif_rain_mm

Optional spectral:
  ndwi_mean (from drone bands)
"""

from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


def _g(row: dict, keys: list[str], default: float = 0.0) -> float:
    for k in keys:
        v = row.get(k)
        if v is not None:
            try:
                f = float(v)
                if f == f:
                    return f
            except (ValueError, TypeError):
                pass
    return default


def predict_waterlogging(row: dict) -> dict:
    # Terrain (from QGIS area CSVs)
    twi          = _g(row, ["twi_mean", "twi"],                  7.0)
    high_twi_pct = _g(row, ["high_twi_pct"],                     0.0)
    slope        = _g(row, ["slope_mean", "slope"],              5.0)
    flat_pct     = _g(row, ["flat_pct"],                         50.0)
    flow_mean    = _g(row, ["flow_mean"],                        200.0)
    high_flow    = _g(row, ["high_flow_pct"],                    0.0)
    concave_pct  = _g(row, ["concave_pct"],                      0.0)
    north_pct    = _g(row, ["north_facing_pct"],                 0.0)
    dem          = _g(row, ["dem_mean", "dem"],                  120.0)
    # Soil
    clay         = _g(row, ["clay_pct", "clay"],                 28.0)
    moist        = _g(row, ["moisture_pct", "moisture"],         40.0)
    # Weather
    rain7        = _g(row, ["rainfall_7d", "rain7"],             20.0)
    ami          = _g(row, ["ami"],                              40.0)
    spi3         = _g(row, ["spi_3"],                            0.0)
    kharif       = _g(row, ["kharif_rain_mm"],                   800.0)
    # Spectral
    ndwi         = _g(row, ["ndwi_mean", "ndwi"],                0.0)

    # ── Weighted score ────────────────────────────────────────────────────────
    score = (
        min(1.0, twi / 15.0)             * 0.22 +
        min(1.0, high_twi_pct / 60.0)   * 0.12 +
        max(0.0, 1 - slope / 18.0)       * 0.15 +
        min(1.0, flat_pct / 80.0)        * 0.08 +
        min(1.0, rain7 / 90.0)           * 0.16 +
        min(1.0, ami / 120.0)            * 0.12 +
        min(1.0, clay / 55.0)            * 0.08 +
        min(1.0, moist / 80.0)           * 0.04 +
        min(1.0, high_flow / 30.0)       * 0.03
    )

    # Interaction boosts
    if slope < 3.0 and rain7 > 50.0:        score += 0.07
    if ndwi > 0.2:                          score += 0.05
    if ami > 80.0 and rain7 > 30.0:         score += 0.04
    if north_pct > 30:                      score += 0.02
    if concave_pct > 20:                    score += 0.03
    if kharif > 1200:                       score += 0.03
    if spi3 > 1.0:                          score += 0.02
    if high_twi_pct > 40 and rain7 > 40:    score += 0.04

    score    = round(min(1.0, max(0.0, score)), 3)
    severity = "High" if score > 0.62 else ("Moderate" if score > 0.38 else "Low")
    risk     = 1 if score > 0.48 else 0
    conf     = int(72 + score * 20)

    causes: list[str] = []
    if twi > 10.5:
        causes.append(f"Low-lying terrain traps water (TWI mean {twi:.1f})")
    if high_twi_pct > 30:
        causes.append(f"{high_twi_pct:.0f}% of farm area has very high TWI (flood-prone terrain)")
    if flat_pct > 70:
        causes.append(f"{flat_pct:.0f}% of farm is near-flat — water cannot drain")
    if rain7 > 55:
        causes.append(f"Heavy recent rainfall — {rain7:.0f} mm in past 7 days")
    if ami > 70:
        causes.append(f"Soil pre-saturated from prior weeks (AMI {ami:.0f})")
    if clay > 42:
        causes.append(f"High clay content ({clay:.0f}%) blocks drainage")
    if high_flow > 20:
        causes.append(f"Large upstream catchment — {high_flow:.0f}% of area has high flow accumulation")
    if concave_pct > 20:
        causes.append(f"Concave terrain ({concave_pct:.0f}% of area) channels runoff inward")
    if ndwi > 0.2:
        causes.append("Spectral water index confirms surface wetness")
    if kharif > 1200:
        causes.append(f"High-rainfall zone — {kharif:.0f} mm this Kharif season")

    if not causes:
        causes = ["Combination of moderate terrain and moisture factors"]

    return {
        "wl_prob":       score,
        "wl_risk":       risk,
        "wl_severity":   severity,
        "wl_confidence": conf,
        "wl_causes":     causes[:3],
    }