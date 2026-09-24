from __future__ import annotations

from typing import Any


ERROR_STATUS: dict[str, int] = {
    "AUTH_FAILED": 401,
    "INVALID_IMAGE": 400,
    "INVALID_FRAME_COUNT": 400,
    "INVALID_RESOLUTION": 400,
    "INVALID_JOB_ID": 400,
    "INVALID_FPS": 400,
    "INSUFFICIENT_VRAM": 400,
    "DISK_FULL": 507,
    "QUEUE_FULL": 429,
    "NOT_FOUND": 404,
    "MODEL_NOT_SUPPORTED": 400,
    "MODEL_LOADING": 503,
    "MODEL_NOT_FOUND": 503,
    "FFMPEG_UNAVAILABLE": 503,
    "CUDA_UNAVAILABLE": 503,
    "GENERATION_FAILED": 500,
    "REAL_AI_GENERATION_FAILED": 500,
    "VIDEO_ENCODING_FAILED": 500,
    "STITCH_FAILED": 500,
}


class AppError(Exception):
    """Structured API error. JSON body is always `{error, message, ...}`."""

    def __init__(
        self,
        error: str,
        message: str,
        status_code: int | None = None,
        **extra: Any,
    ) -> None:
        self.error = error
        self.message = message
        self.status_code = status_code if status_code is not None else ERROR_STATUS.get(error, 500)
        self.extra = extra
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"error": self.error, "message": self.message}
        payload.update(self.extra)
        return payload
