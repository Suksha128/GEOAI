import os
from pathlib import Path

class Settings:
    BASE_DIR = Path(__file__).resolve().parent.parent
    
    # Upload and storage directories
    STORAGE_DIR = BASE_DIR / "storage"
    UPLOAD_DIR = STORAGE_DIR / "uploads"
    PROJECTS_DIR = STORAGE_DIR / "projects"
    
    # Executable paths
    ODM_DOCKER_IMAGE = os.getenv("ODM_DOCKER_IMAGE", "opendronemap/odm:latest")
    WHITEBOX_BIN_PATH = os.getenv("WHITEBOX_BIN_PATH", "") # If empty, WhiteboxTools will auto-download or use path
    
    # Quality Control parameters
    MIN_LAPLACIAN_VAR = float(os.getenv("MIN_LAPLACIAN_VAR", "100.0"))
    EXPOSURE_THRESHOLD = float(os.getenv("EXPOSURE_THRESHOLD", "0.15"))
    
    # Default coordinate anchors
    default_lat = 11.0168
    default_lon = 76.9558
    
    def __init__(self):
        # Ensure base directories exist
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

settings = Settings()
