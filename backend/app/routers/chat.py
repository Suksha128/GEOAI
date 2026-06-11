from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os
from ..config import settings

router = APIRouter(prefix="/api/chat", tags=["Chat"])

class ChatRequest(BaseModel):
    message: str
    context: dict = {}

@router.post("")
async def chat_response(request: ChatRequest):
    # Try getting API keys from environment
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    groq_key = os.getenv("GROQ_API_KEY", "")
    
    user_msg = request.message
    system_prompt = (
        "You are the GeoAI Agricultural Expert Assistant. You analyze drone GIS reports and "
        "provide agronomic advice on crop management, soil erosion, waterlogging mitigation, "
        "and yield optimization. Keep answers professional, concise, structured, and helpful."
    )
    
    # Option 1: Use Gemini 1.5 Flash (Free Tier - 15 RPM / 1,500 RPD / 1M token context)
    if gemini_key:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": f"{system_prompt}\n\nUser: {user_msg}"}]}
            ]
        }
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(url, json=payload, headers=headers, timeout=12.0)
                if res.status_code == 200:
                    data = res.json()
                    ai_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    return {"response": ai_text, "source": "Gemini 1.5 Flash (Free Cloud)"}
        except Exception:
            pass

    # Option 2: Use Groq Llama 3 (Free Tier - 14,400 requests/day)
    if groq_key:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama3-8b-8192",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg}
            ]
        }
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(url, json=payload, headers=headers, timeout=12.0)
                if res.status_code == 200:
                    data = res.json()
                    ai_text = data["choices"][0]["message"]["content"]
                    return {"response": ai_text, "source": "Groq Llama 3 (Free Cloud)"}
        except Exception:
            pass

    # Option 3: Local Ollama (Offline fallback)
    try:
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": "llama3.2:3b",
            "prompt": f"{system_prompt}\n\nUser: {user_msg}",
            "stream": False
        }
        async with httpx.AsyncClient() as client:
            res = await client.post(url, json=payload, timeout=6.0)
            if res.status_code == 200:
                data = res.json()
                return {"response": data["response"], "source": "Local Ollama (Offline)"}
    except Exception:
        pass

    # Option 4: Rule-based fallback if no API keys are set and local LLM is offline
    lower_msg = user_msg.lower()
    if "water" in lower_msg or "drain" in lower_msg or "flood" in lower_msg:
        response = (
            "**Waterlogging Mitigation Advice:**\n\n"
            "1. **Surface Drainage:** Install contour ditches and open channels to redirect excess surface runoff.\n"
            "2. **Subsurface Tiling:** Install perforated plastic pipes (tile drains) 3-4 feet deep to lower the water table.\n"
            "3. **Cover Crops:** Plant deep-rooted cover crops like Radish or Rye to increase soil porosity.\n"
            "4. **Crop Selection:** Switch to flood-tolerant varieties like select soybean cultivars or sugarcane."
        )
    elif "erosion" in lower_msg or "slope" in lower_msg or "soil" in lower_msg:
        response = (
            "**Erosion Control Advice:**\n\n"
            "1. **Contour Farming:** Plow and plant crops along the contour lines of the slope to slow water runoff.\n"
            "2. **Terracing:** Create step-like ridges on steeper slopes to catch water and soil.\n"
            "3. **Mulching:** Apply organic residues to the soil surface to absorb raindrop impact and lock moisture.\n"
            "4. **Windbreaks:** Plant rows of trees or shrubs along field borders to reduce wind-driven soil loss."
        )
    elif "yield" in lower_msg or "fertilizer" in lower_msg or "nutrient" in lower_msg:
        response = (
            "**Yield Optimization Advice:**\n\n"
            "1. **Variable Rate Nitrogen:** Apply fertilizer based on NDVI vigor maps (low NDVI zones need targeted nitrogen boosts).\n"
            "2. **pH Management:** Target lime applications to neutralize acidic soil patches detected in zones under 6.0 pH.\n"
            "3. **Rotational Sowing:** Rotate cereals with legumes (e.g. Peas, Beans) to naturally fix soil nitrogen levels."
        )
    else:
        response = (
            "Hello! I am your GeoAI Agri-Assistant. Ask me about:\n\n"
            "* **Waterlogging mitigation** and surface drainage design.\n"
            "* **Soil erosion controls** on sloped terrain.\n"
            "* **NDVI crop vigor** and targeted fertilizer application."
        )
    return {"response": response, "source": "Rule-Based Expert System"}
