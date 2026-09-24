from __future__ import annotations

import logging
import shutil
import time
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from app import gpu, storage, video, wan_model
from app.config import settings
from app.errors import AppError
from app.jobs import Job, update_job
from app.logging_config import log_generation
from app.schemas import ALLOWED_RESOLUTIONS, map_frame_count, validate_fps

logger = logging.getLogger("mira.inference")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def decode_image(data: bytes, field: str = "image") -> Image.Image:
    if not data:
        raise AppError("INVALID_IMAGE", f"{field} is empty.", status_code=400)
    if len(data) > MAX_UPLOAD_BYTES:
        raise AppError(
            "INVALID_IMAGE",
            f"{field} exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.",
            status_code=400,
        )
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise AppError(
            "INVALID_IMAGE",
            f"{field} is not a valid image (JPEG/PNG/WebP). {exc}",
            status_code=400,
        ) from exc
    if image.width < 8 or image.height < 8:
        raise AppError("INVALID_IMAGE", f"{field} is too small.", status_code=400)
    return image.convert("RGB")


def validate_resolution(width: int, height: int, profile: dict[str, Any] | None = None) -> tuple[int, int]:
    if width <= 0 or height <= 0:
        raise AppError(
            "INVALID_RESOLUTION",
            f"Invalid resolution {width}x{height}.",
            status_code=400,
        )
    profile = profile or gpu.get_gpu_profile()
    max_w, max_h = gpu.parse_resolution(str(profile.get("max_resolution") or "1280x720"))
    max_pixels = max_w * max_h
    if (width, height) in ALLOWED_RESOLUTIONS:
        if profile.get("cuda") and width * height > max_pixels:
            rec_f, rec_r, rec_s = gpu.recommendations(profile)
            raise AppError(
                "INSUFFICIENT_VRAM",
                f"{width}x{height} exceeds this GPU's max {max_w}x{max_h}.",
                status_code=400,
                recommended_frames=rec_f,
                recommended_resolution=rec_r,
                recommended_steps=rec_s,
            )
        return width, height
    if width % 16 != 0 or height % 16 != 0:
        raise AppError(
            "INVALID_RESOLUTION",
            (
                f"{width}x{height} is not an allowed resolution. "
                "Use 1280x720, 832x480, 720x1280, 480x832, or multiples of 16 within the GPU max."
            ),
            status_code=400,
        )
    if max(width, height) > 1280 or min(width, height) < 256:
        raise AppError(
            "INVALID_RESOLUTION",
            f"{width}x{height} is outside the supported range.",
            status_code=400,
        )
    if profile.get("cuda") and width * height > max_pixels:
        rec_f, rec_r, rec_s = gpu.recommendations(profile)
        raise AppError(
            "INSUFFICIENT_VRAM",
            f"{width}x{height} exceeds this GPU's max {max_w}x{max_h}.",
            status_code=400,
            recommended_frames=rec_f,
            recommended_resolution=rec_r,
            recommended_steps=rec_s,
        )
    return width, height


def _cancelled(job: Job) -> bool:
    return job.cancel_event.is_set() or job.status == "cancelled"


def _fail_if_cancelled(job: Job) -> None:
    if _cancelled(job):
        update_job(job.job_id, status="cancelled", progress=0, message="Cancelled.")
        raise AppError("GENERATION_FAILED", "Job cancelled.", status_code=400)


def process_job(job_id: str) -> None:
    from app.jobs import get_job

    job = get_job(job_id)
    t0 = time.time()
    profile = gpu.get_gpu_profile(refresh=True)
    try:
        _fail_if_cancelled(job)
        update_job(job_id, status="loading_model", progress=5)
        wan_model.ensure_model_loaded()
        _fail_if_cancelled(job)

        update_job(job_id, status="preparing", progress=15)
        gpu.check_vram_for_request(job.width, job.height, job.native_frames, job.steps)
        vram_before = gpu.get_gpu_profile(refresh=True).get("used_vram_mb")
        update_job(job_id, vram_before_mb=vram_before)

        work = storage.job_dir(job_id)
        input_path = work / "input.jpg"
        if not input_path.exists():
            raise AppError("INVALID_IMAGE", "Job input image is missing on disk.", status_code=400)
        image = Image.open(input_path).convert("RGB")
        last_image = None
        last_input = work / "last_image.jpg"
        if last_input.exists():
            last_image = Image.open(last_input).convert("RGB")

        _fail_if_cancelled(job)
        update_job(
            job_id,
            status="generating",
            progress=25,
            continuity_mode=wan_model.continuity_mode(),
        )
        gen_t0 = time.time()
        result = wan_model.generate_video(
            image=image,
            prompt=job.prompt,
            negative_prompt=job.negative_prompt,
            height=job.height,
            width=job.width,
            num_frames=job.native_frames,
            guidance_scale=job.guidance_scale,
            num_inference_steps=job.steps,
            seed=job.seed,
            last_image=last_image,
            job_id=job_id,
        )
        gen_s = time.time() - gen_t0
        frames = result.frames if isinstance(result, wan_model.GenerationResult) else result
        continuity_used = (
            result.continuity_used if isinstance(result, wan_model.GenerationResult) else False
        )
        continuity_mode = (
            result.continuity_mode
            if isinstance(result, wan_model.GenerationResult)
            else wan_model.continuity_mode()
        )
        if isinstance(result, wan_model.GenerationResult):
            update_job(
                job_id,
                width=result.width,
                height=result.height,
                steps=result.steps,
                native_frames=result.native_frames,
            )
        update_job(
            job_id,
            generation_seconds=gen_s,
            continuity_used=continuity_used,
            continuity_mode=continuity_mode,
        )

        if _cancelled(job):
            update_job(job_id, status="cancelled", progress=0, message="Cancelled after generation.")
            return

        update_job(job_id, status="encoding", progress=90)
        enc_t0 = time.time()
        job_mp4 = storage.job_output_mp4(job_id)
        video.encode_frames_to_mp4(frames, job_mp4, fps=job.fps)
        public_mp4 = storage.public_output_mp4(job_id)
        shutil.copy2(job_mp4, public_mp4)
        last_frame_path = work / "last_frame.jpg"
        try:
            video.extract_last_frame(job_mp4, last_frame_path)
        except AppError as exc:
            logger.warning("last-frame extract failed job_id=%s: %s", job_id, exc.message)
        enc_s = time.time() - enc_t0
        vram_after = gpu.get_gpu_profile(refresh=True).get("used_vram_mb")
        total_s = time.time() - t0
        update_job(
            job_id,
            status="completed",
            progress=100,
            video_url=f"/outputs/{job_id}.mp4",
            encoding_seconds=enc_s,
            total_seconds=total_s,
            vram_after_mb=vram_after,
        )
        log_generation(
            logger,
            job_id=job_id,
            gpu=str(profile.get("gpu_name")),
            model=settings.MODEL_ID,
            frames=job.native_frames,
            width=job.width,
            height=job.height,
            steps=job.steps,
            generation_s=gen_s,
            encoding_s=enc_s,
            total_s=total_s,
            vram_before_mb=vram_before if isinstance(vram_before, (int, float)) else None,
            vram_after_mb=vram_after if isinstance(vram_after, (int, float)) else None,
        )
    except AppError as exc:
        if get_job(job_id).status == "cancelled":
            return
        extra = dict(exc.extra)
        update_job(
            job_id,
            status="failed",
            error=exc.error,
            message=exc.message,
            extra=extra,
            total_seconds=time.time() - t0,
        )
        log_generation(
            logger,
            job_id=job_id,
            gpu=str(profile.get("gpu_name")),
            model=settings.MODEL_ID,
            frames=job.native_frames,
            width=job.width,
            height=job.height,
            steps=job.steps,
            generation_s=job.generation_seconds,
            encoding_s=job.encoding_seconds,
            total_s=time.time() - t0,
            vram_before_mb=job.vram_before_mb,
            vram_after_mb=job.vram_after_mb,
            error=f"{exc.error}: {exc.message}",
        )
    except Exception as exc:
        logger.exception("unhandled generation error job_id=%s", job_id)
        update_job(
            job_id,
            status="failed",
            error="GENERATION_FAILED",
            message=f"Generation failed: {exc}",
            total_seconds=time.time() - t0,
        )


def advertised_resolutions(profile: dict[str, Any]) -> dict[str, list[str]]:
    max_w, max_h = gpu.parse_resolution(str(profile.get("max_resolution") or "1280x720"))
    max_pixels = max_w * max_h
    landscape = []
    portrait = []
    for w, h in ((1280, 720), (832, 480)):
        if w * h <= max_pixels or not profile.get("cuda"):
            landscape.append(f"{w}x{h}")
    for w, h in ((720, 1280), (480, 832)):
        if w * h <= max_pixels or not profile.get("cuda"):
            portrait.append(f"{w}x{h}")
    if not landscape:
        landscape = [str(profile.get("max_resolution") or "832x480")]
    if not portrait:
        mw, mh = gpu.parse_resolution(landscape[0])
        portrait = [f"{mh}x{mw}"]
    return {"16:9": landscape, "9:16": portrait}


def advertised_max_frames(profile: dict[str, Any]) -> int:
    gpu_max = int(profile.get("max_frames") or settings.MAX_FRAMES)
    if gpu_max <= 0:
        return settings.MAX_FRAMES
    return min(gpu_max if gpu_max >= 64 else gpu_max, max(gpu_max, 16))
