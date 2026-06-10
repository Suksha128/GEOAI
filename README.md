What files to upload
Terrain files (from QGIS Reclassify + Zonal Histogram)
FileWhat it containsSlope_Area_.csvgridcode, Area_SQKM per slope classTWI_Area_.csvgridcode, Area_SQKM per TWI classAspect_Area_.csvgridcode, Area_SQKM per aspect classCurvature_Area_.csvgridcode, Area_SQKM per curvature classFlowAccum_Area_.csvgridcode, Area_SQKM per flow accumulation classdem.tifRaw DEM GeoTIFF (or DEM_Area_.csv)
Field data files (one row per field)
FileWhat it containsfields.csvfield_id, zone, area_ha, crop_typedrone_bands.csvfield_id, red_mean, nir_mean, green_mean → NDVI computedsoil_lab.csvfield_id, ph, nitrogen, clay_pct (optional)
Weather
Fetched automatically from Open-Meteo. No file needed. No API key needed.
Provide lat/lon coordinates when uploading.

Setup
Step 1 — Create all folders
bashmkdir -p geoai_project/.vscode
mkdir -p geoai_project/backend/api/routes
mkdir -p geoai_project/backend/engine
mkdir -p geoai_project/backend/models
mkdir -p geoai_project/backend/utils
mkdir -p geoai_project/backend/data/raw
mkdir -p geoai_project/backend/data/processed
mkdir -p geoai_project/backend/data/model_store
mkdir -p geoai_project/frontend/public
mkdir -p geoai_project/frontend/src/components/upload
mkdir -p geoai_project/frontend/src/components/chat
mkdir -p geoai_project/frontend/src/components/dashboard
mkdir -p geoai_project/frontend/src/components/fields
mkdir -p geoai_project/frontend/src/components/ui
mkdir -p geoai_project/frontend/src/pages
mkdir -p geoai_project/frontend/src/hooks
mkdir -p geoai_project/frontend/src/utils
mkdir -p geoai_project/frontend/src/assets
mkdir -p geoai_project/scripts
mkdir -p geoai_project/tests/unit
mkdir -p geoai_project/tests/integration
Step 2 — Backend
bashcd geoai_project/backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn api.main:app --reload --port 8000
API docs: http://localhost:8000/docs
Step 3 — Frontend
bashcd geoai_project/frontend
npm install
npm run dev
App: http://localhost:5173
Step 4 — Optional LLM (for better natural language output)
bash# Option A: Local (free, no internet needed)
# Install Ollama from https://ollama.ai
ollama pull llama3.2:3b

# Option B: Groq cloud (free, 14,400 req/day)
# Get key from https://console.groq.com
# Add to .env: GROQ_API_KEY=your_key
The system works without any LLM — template formatter is the fallback.