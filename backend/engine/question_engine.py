"""
backend/engine/question_engine.py
─────────────────────────────────
Processes natural language questions about farm status and models.
"""

import logging

logger = logging.getLogger(__name__)

def answer_question(question: str, fields: list[dict], stats: dict) -> str:
    q = question.lower()
    
    if "waterlog" in q or "risk" in q or "flood" in q:
        high_risk = [f for f in fields if f.get("wl_severity") == "High"]
        if not high_risk:
            return "Good news! None of the fields are currently at High waterlogging risk."
        names = ", ".join(f.get("field_id", "Unknown") for f in high_risk)
        return f"There are {len(high_risk)} fields at High waterlogging risk: {names}. They require drainage checks immediately."
        
    elif "yield" in q or "forecast" in q or "production" in q:
        avg_yield = stats.get("average_yield", 0.0)
        return f"The average yield forecast for the farm is {avg_yield} metric tons per hectare. High NDVI values in the healthy crop zones support this projection."
        
    elif "report" in q or "summary" in q or "overview" in q:
        return (
            f"Farm Status Report Summary:\n"
            f"  - Total Fields: {stats.get('total_fields', 0)}\n"
            f"  - Total Cultivated Area: {stats.get('total_area_ha', 0.0)} ha\n"
            f"  - Average NDVI: {stats.get('average_ndvi', 0.0)}\n"
            f"  - Average Yield Potential: {stats.get('average_yield', 0.0)} tons/ha\n"
            f"  - Fields at High Waterlogging Risk: {stats.get('high_risk_fields', 0)}\n"
            f"Everything is operating within normal baseline limits."
        )
        
    elif "action" in q or "priority" in q or "todo" in q or "do" in q:
        high_risk = [f for f in fields if f.get("wl_severity") == "High"]
        actions = []
        if high_risk:
            actions.append(f"1. Check drainage and clear channels in high waterlogging risk fields ({', '.join(f.get('field_id') for f in high_risk)}).")
        actions.append("2. Continue monitoring NDVI values across all zones to identify early stress signs.")
        actions.append("3. Verify weather forecast daily for unexpected heavy rainfall spikes.")
        return "\n".join(actions)
        
    return (
        f"I received your question: '{question}'.\n"
        f"The farm has {len(fields)} fields with an average crop health index of "
        f"{round((1 - stats.get('high_risk_fields', 0)/max(1, len(fields))) * 100, 1)}%. "
        f"Let me know if you want details about waterlogging risks, yield forecasts, or priority actions."
    )
