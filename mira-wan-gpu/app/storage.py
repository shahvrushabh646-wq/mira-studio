from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any

from app.config import settings
from app.errors import AppError

logger = logging.getLogger("mira.storage")

JOB_ID_RE = re.compile(r"^mira_[a-zA-Z0-9_-]+$")


def ensure_dirs() -> None:
    for path in (
        settings.DATA_ROOT,
        settings.OUTPUT_DIR,
        settings.jobs_dir,
        settings.uploads_dir,
        settings.cache_dir,
        settings.MODEL_CACHE_DIR,
    ):
        Path(path).mkdir(parents=True, exist_ok=True)


def new_job_id() -> str:
    return f"mira_{uuid.uuid4().hex}"


def sanitize_job_id(job_id: str | None) -> str:
    if job_id is None or job_id == "":
        return new_job_id()
    job_id = job_id.strip()
    if not JOB_ID_RE.match(job_id):
        raise AppError(
            "INVALID_JOB_ID",
            "job_id must match mira_[a-zA-Z0-9_-]+.",
            status_code=400,
        )
    return job_id


def job_dir(job_id: str) -> Path:
    job_id = sanitize_job_id(job_id)
    path = settings.jobs_dir / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def job_output_mp4(job_id: str) -> Path:
    return job_dir(job_id) / "output.mp4"


def public_output_mp4(job_id: str) -> Path:
    settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return settings.OUTPUT_DIR / f"{job_id}.mp4"


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_job_metadata(job_id: str, data: dict[str, Any]) -> None:
    write_json(job_dir(job_id) / "metadata.json", data)


def safe_output_path(filename: str) -> Path:
    """Resolve a file inside OUTPUT_DIR only. Prevents path traversal."""
    if not filename or filename != Path(filename).name:
        raise AppError("NOT_FOUND", "Invalid output filename.", status_code=404)
    if ".." in filename or filename.startswith("/") or "\\" in filename:
        raise AppError("NOT_FOUND", "Invalid output filename.", status_code=404)
    base = settings.OUTPUT_DIR.resolve()
    candidate = (base / filename).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        raise AppError("NOT_FOUND", "Invalid output filename.", status_code=404)
    return candidate


def disk_free_gb(path: Path | None = None) -> float | None:
    target = path or settings.DATA_ROOT
    try:
        import shutil

        usage = shutil.disk_usage(target)
        return round(usage.free / (1024**3), 2)
    except OSError:
        return None
