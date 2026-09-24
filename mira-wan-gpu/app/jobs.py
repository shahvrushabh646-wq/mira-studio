from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from app.errors import AppError
from app.schemas import GENERATION_TYPE, MODEL_DISPLAY, PROVIDER
from app.storage import save_job_metadata

logger = logging.getLogger("mira.jobs")

_lock = threading.Lock()
_jobs: dict[str, Job] = {}


@dataclass
class Job:
    job_id: str
    status: str = "queued"
    prompt: str = ""
    negative_prompt: str = ""
    frames: int = 16
    native_frames: int = 17
    width: int = 1280
    height: int = 720
    steps: int = 40
    guidance_scale: float = 3.5
    seed: int | None = None
    fps: int = 16
    progress: int = 0
    video_url: str | None = None
    error: str | None = None
    message: str | None = None
    provider: str = PROVIDER
    model: str = MODEL_DISPLAY
    generation_type: str = GENERATION_TYPE
    continuity_used: bool = False
    continuity_mode: str = "unsupported"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    generation_seconds: float | None = None
    encoding_seconds: float | None = None
    total_seconds: float | None = None
    vram_before_mb: float | None = None
    vram_after_mb: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)
    cancel_event: threading.Event = field(default_factory=threading.Event)

    def to_public_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "job_id": self.job_id,
            "status": self.status,
            "provider": self.provider,
            "model": self.model,
            "generation_type": self.generation_type,
            "progress": self.progress,
            "frames": self.frames,
            "native_frames": self.native_frames,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "steps": self.steps,
            "seed": self.seed,
            "prompt": self.prompt,
            "continuity_used": self.continuity_used,
            "continuity_mode": self.continuity_mode,
        }
        if self.status == "completed":
            payload["video_url"] = self.video_url
        else:
            payload["video_url"] = self.video_url
        if self.error:
            payload["error"] = self.error
            payload["message"] = self.message
        if self.generation_seconds is not None:
            payload["generation_seconds"] = self.generation_seconds
        if self.encoding_seconds is not None:
            payload["encoding_seconds"] = self.encoding_seconds
        if self.total_seconds is not None:
            payload["total_seconds"] = self.total_seconds
        if self.extra:
            payload["extra"] = self.extra
        return payload

    def to_metadata(self) -> dict[str, Any]:
        data = self.to_public_dict()
        data["created_at"] = self.created_at
        data["updated_at"] = self.updated_at
        data["negative_prompt"] = self.negative_prompt
        data["vram_before_mb"] = self.vram_before_mb
        data["vram_after_mb"] = self.vram_after_mb
        return data


def create_job(**kwargs: Any) -> Job:
    job = Job(**kwargs)
    with _lock:
        _jobs[job.job_id] = job
    persist(job)
    return job


def get_job(job_id: str) -> Job:
    with _lock:
        job = _jobs.get(job_id)
    if job is None:
        raise AppError("NOT_FOUND", f"Job {job_id} was not found.", status_code=404)
    return job


def get_job_or_none(job_id: str) -> Job | None:
    with _lock:
        return _jobs.get(job_id)


def update_job(job_id: str, **fields: Any) -> Job:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise AppError("NOT_FOUND", f"Job {job_id} was not found.", status_code=404)
        for key, value in fields.items():
            setattr(job, key, value)
        job.updated_at = time.time()
    persist(job)
    return job


def persist(job: Job) -> None:
    try:
        save_job_metadata(job.job_id, job.to_metadata())
    except Exception as exc:
        logger.warning("failed to persist metadata for %s: %s", job.job_id, exc)


def list_jobs() -> list[Job]:
    with _lock:
        return list(_jobs.values())


def active_count() -> int:
    active = {
        "queued",
        "loading_model",
        "preparing",
        "generating",
        "encoding",
    }
    with _lock:
        return sum(1 for j in _jobs.values() if j.status in active)


def queued_count() -> int:
    with _lock:
        return sum(1 for j in _jobs.values() if j.status == "queued")


def reset_registry() -> None:
    with _lock:
        _jobs.clear()
