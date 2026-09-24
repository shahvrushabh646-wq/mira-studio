from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    MIRA_API_KEY: str = ""
    MIRA_FRONTEND_ORIGIN: str = ""

    MODEL_ID: str = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
    MODEL_REVISION: str = ""
    MODEL_CACHE_DIR: Path = Path("/models")

    OUTPUT_DIR: Path = Path("/data/outputs")
    DATA_ROOT: Path = Path("/data")

    MAX_QUEUE_SIZE: int = 20
    MAX_FRAMES: int = 64
    # Conservative floor for the full Wan 2.2 I2V A14B pipeline. Lower only
    # after validating a specific offload/quantization setup with self-test.
    MIN_VRAM_GB: float = 80.0
    DEFAULT_STEPS: int = 8
    DEFAULT_FPS: int = 16
    DEFAULT_WIDTH: int = 832
    DEFAULT_HEIGHT: int = 480
    JOB_RETENTION_HOURS: int = 24

    ENABLE_LIGHTNING: bool = False
    HF_TOKEN: str = ""

    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOAD_MODEL_ON_STARTUP: bool = False

    LIGHTNING_REPO: str = Field(default="lightx2v/Wan2.2-Lightning")

    @property
    def jobs_dir(self) -> Path:
        return self.DATA_ROOT / "jobs"

    @property
    def uploads_dir(self) -> Path:
        return self.DATA_ROOT / "uploads"

    @property
    def cache_dir(self) -> Path:
        return self.DATA_ROOT / "cache"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
