"""
backend/engine/analyser.py
──────────────────────────
Orchestrates all machine learning and physical rule models for uploaded fields.
"""

from engine.waterlog import predict_waterlogging
from engine.yield_model import predict_yield
from engine.stress import predict_stress
from engine.suitability import predict_suitability

def analyse_all_fields(rows: list[dict]) -> list[dict]:
    for row in rows:
        # 1. Run waterlogging risk prediction
        wl_res = predict_waterlogging(row)
        row.update(wl_res)
        
        # 2. Run yield potential prediction
        yield_res = predict_yield(row)
        row.update(yield_res)
        
        # 3. Run stress assessment
        stress_res = predict_stress(row)
        row.update(stress_res)
        
        # 4. Run crop suitability analysis
        suit_res = predict_suitability(row)
        row.update(suit_res)
        
    return rows
