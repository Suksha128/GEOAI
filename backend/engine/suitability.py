"""
backend/engine/suitability.py
─────────────────────────────
Calculates suitability parameters.
"""

def predict_suitability(row: dict) -> dict:
    ph = float(row.get("ph") or 6.5)
    twi = float(row.get("twi_mean") or 7.0)
    
    ph_score = max(0.0, 1.0 - abs(ph - 6.5) * 0.5)
    twi_score = max(0.0, 1.0 - abs(twi - 6.5) * 0.3)
    
    suitability_score = round((ph_score * 0.5 + twi_score * 0.5), 2)
    status = "Highly Suitable" if suitability_score > 0.75 else ("Suitable" if suitability_score > 0.45 else "Marginal")
    
    return {
        "suitability_score": suitability_score,
        "suitability_status": status
    }
