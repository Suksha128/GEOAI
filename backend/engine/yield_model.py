"""
backend/engine/yield.py
───────────────────────
Calculates predicted yield potentials for crop zones.
"""

def predict_yield(row: dict) -> dict:
    ndvi = float(row.get("ndvi_mean") or 0.5)
    twi = float(row.get("twi_mean") or 7.0)
    slope = float(row.get("slope_mean") or 5.0)
    nitrogen = float(row.get("nitrogen") or 45.0)
    wl_prob = float(row.get("wl_prob") or 0.0)
    
    # Base yield model
    base_yield = ndvi * 6.5 + (twi * 0.2) - (slope * 0.05)
    
    # Soil nitrogen fertilizer boost
    n_factor = min(1.3, max(0.7, nitrogen / 60.0))
    predicted = base_yield * n_factor
    
    # Waterlogging penalty
    if wl_prob > 0.6:
        predicted *= (1.0 - (wl_prob - 0.5) * 0.6)
        
    predicted = round(max(0.5, min(12.0, predicted)), 2)
    
    return {
        "yield_potential": predicted,
        "yield_forecast": round(predicted * 0.95, 2),
        "yield_units": "metric_tons_per_hectare"
    }
