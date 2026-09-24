from __future__ import annotations

import logging
import re
from typing import Any

_SECRET_RE = re.compile(
    r"(Bearer\s+)[A-Za-z0-9._\-]+|(hf_[A-Za-z0-9]+)|(MIRA_API_KEY[=:]\s*\S+)|(HF_TOKEN[=:]\s*\S+)",
    re.IGNORECASE,
)


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        redacted = _SECRET_RE.sub(_redact_match, msg)
        if redacted != msg:
            record.msg = redacted
            record.args = ()
        return True


def _redact_match(match: re.Match[str]) -> str:
    if match.group(1):
        return f"{match.group(1)}***"
    return "***"


def setup_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        force=True,
    )
    redact = RedactFilter()
    root = logging.getLogger()
    root.addFilter(redact)
    for handler in root.handlers:
        handler.addFilter(redact)


def log_generation(
    logger: logging.Logger,
    *,
    job_id: str,
    gpu: str | None,
    model: str,
    frames: int,
    width: int,
    height: int,
    steps: int,
    generation_s: float | None,
    encoding_s: float | None,
    total_s: float | None,
    vram_before_mb: float | None,
    vram_after_mb: float | None,
    error: str | None = None,
    **extra: Any,
) -> None:
    payload = (
        "job_id=%s gpu=%s model=%s frames=%s resolution=%sx%s steps=%s "
        "generation_s=%s encoding_s=%s total_s=%s vram_before_mb=%s vram_after_mb=%s"
    )
    args: list[Any] = [
        job_id,
        gpu,
        model,
        frames,
        width,
        height,
        steps,
        f"{generation_s:.3f}" if generation_s is not None else "-",
        f"{encoding_s:.3f}" if encoding_s is not None else "-",
        f"{total_s:.3f}" if total_s is not None else "-",
        f"{vram_before_mb:.0f}" if vram_before_mb is not None else "-",
        f"{vram_after_mb:.0f}" if vram_after_mb is not None else "-",
    ]
    if error:
        logger.error(payload + " error=%s", *args, error)
    else:
        logger.info(payload, *args)
    if extra:
        logger.info("job_id=%s extra=%s", job_id, extra)
