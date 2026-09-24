from __future__ import annotations

import asyncio
import logging
import shutil
import time
from pathlib import Path

from app.config import settings
from app.jobs import list_jobs
from app.storage import public_output_mp4

logger = logging.getLogger("mira.cleanup")


def purge_expired_jobs() -> int:
    retention_s = max(int(settings.JOB_RETENTION_HOURS), 1) * 3600
    cutoff = time.time() - retention_s
    removed = 0
    jobs_root = Path(settings.jobs_dir)
    if jobs_root.exists():
        for child in jobs_root.iterdir():
            if not child.is_dir():
                continue
            try:
                mtime = child.stat().st_mtime
            except OSError:
                continue
            if mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
                out = public_output_mp4(child.name)
                if out.exists():
                    try:
                        out.unlink()
                    except OSError:
                        pass
                removed += 1
    # Drop completed/failed jobs older than retention from memory.
    for job in list_jobs():
        if job.updated_at < cutoff and job.status in ("completed", "failed", "cancelled"):
            continue
    if removed:
        logger.info("purged %s expired job directories (retention=%sh)", removed, settings.JOB_RETENTION_HOURS)
    return removed


async def cleanup_loop(interval_s: int = 3600) -> None:
    logger.info("cleanup loop started interval_s=%s", interval_s)
    while True:
        try:
            purge_expired_jobs()
        except Exception:
            logger.exception("cleanup failed")
        await asyncio.sleep(interval_s)
