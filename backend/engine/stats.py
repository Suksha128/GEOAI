"""
backend/engine/stats.py
───────────────────────
Calculates aggregated farm statistics.
"""

def compute_farm_stats(fields: list[dict]) -> dict:
    if not fields:
        return {
            "total_fields": 0,
            "total_area_ha": 0.0,
            "average_ndvi": 0.0,
            "high_risk_fields": 0,
            "average_yield": 0.0
        }
        
    total_fields = len(fields)
    total_area = sum(float(f.get("area_ha") or 0.0) for f in fields)
    
    ndvis = [float(f["ndvi_mean"]) for f in fields if f.get("ndvi_mean") is not None]
    avg_ndvi = round(sum(ndvis) / len(ndvis), 3) if ndvis else 0.5
    
    high_risk = sum(1 for f in fields if f.get("wl_risk") == 1)
    
    yields = [float(f["yield_potential"]) for f in fields if f.get("yield_potential") is not None]
    avg_yield = round(sum(yields) / len(yields), 2) if yields else 0.0
    
    zones = {}
    crops = {}
    for f in fields:
        z = f.get("zone") or "Default"
        zones[z] = zones.get(z, 0) + 1
        c = f.get("crop_type") or "Default"
        crops[c] = crops.get(c, 0) + 1
        
    return {
        "total_fields": total_fields,
        "total_area_ha": round(total_area, 2),
        "average_ndvi": avg_ndvi,
        "high_risk_fields": high_risk,
        "average_yield": avg_yield,
        "zones_distribution": zones,
        "crops_distribution": crops
    }
