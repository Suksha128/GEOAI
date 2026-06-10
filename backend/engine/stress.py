"""
backend/engine/stress.py
────────────────────────
Predicts crop stress metrics.
"""

def predict_stress(row: dict) -> dict:
    ndvi = float(row.get("ndvi_mean") or 0.5)
    temp = float(row.get("temp_avg") or 25.0)
    moist = float(row.get("moisture_pct") or 40.0)
    
    stress_score = 0.0
    if ndvi < 0.3:
        stress_score += 0.4
    elif ndvi < 0.5:
        stress_score += 0.2
        
    if temp > 35.0:
        stress_score += 0.2
        
    if moist < 20.0:
        stress_score += 0.3
    elif moist > 80.0:
        stress_score += 0.2
        
    stress_score = round(max(0.0, min(1.0, stress_score)), 2)
    status = "Severe" if stress_score > 0.7 else ("Moderate" if stress_score > 0.3 else "Low")
    
    return {
        "stress_prob": stress_score,
        "stress_status": status,
        "crop_health_index": round((1.0 - stress_score) * 100, 1)
    }
