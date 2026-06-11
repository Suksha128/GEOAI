from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .config import settings
from .routers import upload, pipeline, models, chat

app = FastAPI(
    title="GeoAI Platform API",
    description="Automated drone photogrammetry and GIS decision-support backend",
    version="1.0.0"
)

# Enable CORS for local cross-origin development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(upload.router)
app.include_router(pipeline.router)
app.include_router(models.router)
app.include_router(chat.router)

# Resolve Frontend Root directory (Parent directory of /backend)
FRONTEND_DIR = settings.BASE_DIR.parent

# Serve Frontend files statically when accessed at root
@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")

# Mount css and js folders
app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
