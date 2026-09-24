from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.config import settings
from app.errors import AppError
from app.jobs import Job, active_count, get_job, queued_count, update_job

logger = logging.getLogger("mira.queue")

_queue: asyncio.Queue[str] | None = None
_worker_task: asyncio.Task[Any] | None = None


def get_queue() -> asyncio.Queue[str]:
    global _queue
    if _queue is None:
        _queue = asyncio.Queue()
    return _queue


def queue_size() -> int:
    q = _queue
    return q.qsize() if q is not None else 0


def enqueue(job: Job) -> int:
    if active_count() >= settings.MAX_QUEUE_SIZE:
        raise AppError(
            "QUEUE_FULL",
            f"Queue is full ({settings.MAX_QUEUE_SIZE} active jobs). Try again later.",
            status_code=429,
        )
    q = get_queue()
    q.put_nowait(job.job_id)
    position = queued_count()
    logger.info("enqueued job_id=%s queue_position=%s", job.job_id, position)
    return position


def cancel_job(job_id: str) -> Job:
    job = get_job(job_id)
    if job.status in ("completed", "failed", "cancelled"):
        return job
    job.cancel_event.set()
    if job.status == "queued":
        update_job(job_id, status="cancelled", progress=0, message="Cancelled before generation started.")
        logger.info("cancelled queued job_id=%s", job_id)
        return get_job(job_id)
    update_job(
        job_id,
        message="Cancel requested. Current CUDA kernel will finish; the job will stop before the next stage.",
    )
    logger.info("cancel pending job_id=%s status=%s", job_id, job.status)
    return get_job(job_id)


async def queue_worker() -> None:
    from app.inference import process_job

    q = get_queue()
    logger.info("queue worker started")
    loop = asyncio.get_running_loop()
    while True:
        job_id = await q.get()
        try:
            job = get_job(job_id)
            if job.status == "cancelled" or job.cancel_event.is_set():
                if job.status != "cancelled":
                    update_job(job_id, status="cancelled", progress=0)
                continue
            await loop.run_in_executor(None, process_job, job_id)
        except AppError as exc:
            logger.error("worker AppError job_id=%s error=%s message=%s", job_id, exc.error, exc.message)
            try:
                update_job(job_id, status="failed", error=exc.error, message=exc.message, extra=dict(exc.extra))
            except AppError:
                pass
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("worker crashed job_id=%s", job_id)
            try:
                update_job(
                    job_id,
                    status="failed",
                    error="GENERATION_FAILED",
                    message="The queue worker hit an unexpected error while processing this job.",
                )
            except AppError:
                pass
        finally:
            q.task_done()


async def start_worker() -> asyncio.Task[Any]:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(queue_worker(), name="mira-queue-worker")
    return _worker_task


async def stop_worker() -> None:
    global _worker_task
    if _worker_task is not None:
        _worker_task.cancel()
        try:
            await _worker_task
        except (asyncio.CancelledError, Exception):
            pass
        _worker_task = None
