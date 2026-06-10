"""
backend/config.py
-----------------
Central settings loaded from .env.
Import anywhere: from config import settings
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Farm default coordinates for weather
    default_lat: float = 11.0168
    default_lon: float = 76.9558

    # Optional LLM
    groq_api_key: str = ""

    # App
    app_env:      str       = "development"
    app_port:     int       = 8000
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # Paths
    model_dir: Path = Path("data/model_store")
    data_dir:  Path = Path("data")

    class Config:
        env_file          = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure runtime directories exist
settings.model_dir.mkdir(parents=True, exist_ok=True)
(settings.data_dir / "raw").mkdir(parents=True, exist_ok=True)
(settings.data_dir / "processed").mkdir(parents=True, exist_ok=True)