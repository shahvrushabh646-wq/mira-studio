from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.errors import AppError


PROVIDER = "mira-wan-gpu"
GENERATION_TYPE = "real_ai_i2v"
MODEL_DISPLAY = "Wan2.2-I2V"

MIRA_FRAME_COUNTS: list[int] = [16, 32, 64]
NATIVE_FRAME_COUNTS: list[int] = [17, 33, 49, 65, 81]
FRAME_MAP: dict[int, int] = {16: 17, 32: 33, 64: 65}
ALLOWED_FRAME_COUNTS: set[int] = set(MIRA_FRAME_COUNTS) | set(NATIVE_FRAME_COUNTS)

ALLOWED_FPS: list[int] = [8, 12, 16, 24]
ALLOWED_ASPECT_RATIOS: list[str] = ["16:9", "9:16"]

ALLOWED_RESOLUTIONS: set[tuple[int, int]] = {
    (1280, 720),
    (832, 480),
    (720, 1280),
    (480, 832),
}

JOB_STATUSES = (
    "queued",
    "loading_model",
    "preparing",
    "generating",
    "encoding",
    "completed",
    "failed",
    "cancelled",
)


def map_frame_count(frames: int) -> int:
    """Map Mira 16/32/64 to Wan 4k+1 native counts. Reject arbitrary values like 43."""
    if frames in FRAME_MAP:
        return FRAME_MAP[frames]
    if frames in NATIVE_FRAME_COUNTS:
        return frames
    raise AppError(
        "INVALID_FRAME_COUNT",
        (
            f"Frame count {frames} is not supported. "
            "Use Mira values 16, 32, 64 (mapped internally to 17, 33, 65) "
            "or native Wan counts 17, 33, 49, 65, 81. "
            "43 and other arbitrary counts are rejected."
        ),
        status_code=400,
    )


def validate_fps(fps: int) -> int:
    if fps not in ALLOWED_FPS:
        raise AppError(
            "INVALID_FPS",
            f"fps {fps} is not supported. Use one of {ALLOWED_FPS}.",
            status_code=400,
        )
    return fps


class HealthResponse(BaseModel):
    status: str
    service: str = "mira-wan-gpu"
    gpu: str | None = None
    cuda: bool = False
    model_loaded: bool = False


class GenerateAccepted(BaseModel):
    job_id: str
    status: str = "queued"
    queue_position: int | None = None
    provider: str = PROVIDER


class JobPublic(BaseModel):
    job_id: str
    status: str
    provider: str = PROVIDER
    model: str = MODEL_DISPLAY
    generation_type: str = GENERATION_TYPE
    progress: int = 0
    frames: int | None = None
    native_frames: int | None = None
    width: int | None = None
    height: int | None = None
    fps: int | None = None
    steps: int | None = None
    seed: int | None = None
    prompt: str | None = None
    video_url: str | None = None
    continuity_used: bool = False
    continuity_mode: str | None = None
    error: str | None = None
    message: str | None = None
    generation_seconds: float | None = None
    encoding_seconds: float | None = None
    total_seconds: float | None = None
    extra: dict[str, Any] = Field(default_factory=dict)
