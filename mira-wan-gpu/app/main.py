from __future__ import annotations

import asyncio
import logging
import platform
import shutil
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from app import gpu, inference, jobs, queue, storage, video, wan_model
from app.auth import require_auth, warn_if_auth_disabled
from app.cleanup import cleanup_loop
from app.config import settings
from app.errors import AppError
from app.logging_config import setup_logging
from app.schemas import (
    ALLOWED_ASPECT_RATIOS,
    ALLOWED_FPS,
    GENERATION_TYPE,
    MIRA_FRAME_COUNTS,
    MODEL_DISPLAY,
    NATIVE_FRAME_COUNTS,
    PROVIDER,
    map_frame_count,
    validate_fps,
)

logger = logging.getLogger("mira")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    storage.ensure_dirs()
    warn_if_auth_disabled()
    profile = gpu.get_gpu_profile(refresh=True)
    logger.info(
        "startup service=mira-wan-gpu gpu=%s cuda=%s vram_gb=%s model_id=%s",
        profile.get("gpu_name"),
        profile.get("cuda"),
        profile.get("vram_gb"),
        settings.MODEL_ID,
    )
    if settings.LOAD_MODEL_ON_STARTUP:
        try:
            wan_model.load_model()
        except AppError as exc:
            logger.error("startup model load failed error=%s message=%s", exc.error, exc.message)
    worker = await queue.start_worker()
    cleaner = asyncio.create_task(cleanup_loop(), name="mira-cleanup")
    try:
        yield
    finally:
        cleaner.cancel()
        worker.cancel()
        await queue.stop_worker()
        try:
            await cleaner
        except (asyncio.CancelledError, Exception):
            pass


def _cors_origins() -> list[str]:
    origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    extra = (settings.MIRA_FRONTEND_ORIGIN or "").strip()
    if extra:
        origins.append(extra.rstrip("/"))
    # Never allow "*" when an API key is configured.
    return list(dict.fromkeys(origins))


app = FastAPI(
    title="Mira Wan GPU",
    description="Production Wan 2.2 image-to-video inference backend for Mira Studio.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=None,
)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_dict())


@app.get("/health")
async def health() -> dict[str, Any]:
    profile = gpu.get_gpu_profile()
    enough_vram = float(profile.get("vram_gb") or 0) >= settings.MIN_VRAM_GB
    ready = bool(profile.get("cuda")) and enough_vram
    return {
        "status": "ok",
        "service": "mira-wan-gpu",
        "gpu": profile.get("gpu_name"),
        "cuda": bool(profile.get("cuda")),
        "gpu_available": bool(profile.get("cuda")),
        "ready": ready,
        "min_vram_gb": settings.MIN_VRAM_GB,
        "model_loaded": wan_model.is_model_loaded(),
    }


@app.get("/capabilities")
async def capabilities(_: None = Depends(require_auth)) -> dict[str, Any]:
    profile = gpu.get_gpu_profile()
    enough_vram = bool(profile.get("cuda")) and float(profile.get("vram_gb") or 0) >= settings.MIN_VRAM_GB
    mode = wan_model.continuity_mode()
    continuity = mode == "last_image"
    resolutions = inference.advertised_resolutions(profile) if enough_vram else []
    max_frames = settings.MAX_FRAMES
    gpu_max = int(profile.get("max_frames") or 0)
    if profile.get("cuda") and gpu_max > 0:
        max_frames = min(settings.MAX_FRAMES, gpu_max if gpu_max >= 64 else max(gpu_max, 16))
        if gpu_max < 64:
            max_frames = gpu_max
    return {
        "provider": PROVIDER,
        "models": [MODEL_DISPLAY, settings.MODEL_ID],
        "image_to_video": True,
        "frame_counts": [count for count in MIRA_FRAME_COUNTS if enough_vram and count <= max_frames],
        "native_frame_counts": list(NATIVE_FRAME_COUNTS),
        "fps": list(ALLOWED_FPS),
        "aspect_ratios": list(ALLOWED_ASPECT_RATIOS),
        "resolutions": resolutions,
        "max_frames": max_frames,
        "min_vram_gb": settings.MIN_VRAM_GB,
        "gpu": profile.get("gpu_name"),
        "vram_gb": profile.get("vram_gb"),
        "cuda": bool(profile.get("cuda")),
        "continuity": continuity,
        "continuity_mode": mode,
        "long_video": True,
        "dtype": profile.get("dtype"),
        "offload": profile.get("offload"),
        "lightning": wan_model.lightning_loaded(),
        "model_loaded": wan_model.is_model_loaded(),
        "recommended_steps": profile.get("recommended_steps"),
        "max_resolution": profile.get("max_resolution"),
    }


def _form_int(value: str | int | None, default: int | None, name: str) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        raise AppError("INVALID_RESOLUTION" if name in ("width", "height") else "INVALID_FRAME_COUNT",
                       f"Invalid {name}: {value!r}.", status_code=400)


def _form_float(value: str | float | None, default: float, name: str) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        raise AppError("GENERATION_FAILED", f"Invalid {name}: {value!r}.", status_code=400)


@app.post("/generate")
async def generate(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    frames: int | None = Form(None),
    width: int | None = Form(None),
    height: int | None = Form(None),
    steps: int | None = Form(None),
    guidance_scale: float | None = Form(None),
    seed: int | None = Form(None),
    fps: int | None = Form(None),
    last_image: UploadFile | None = File(None),
    job_id: str | None = Form(None),
    _: None = Depends(require_auth),
) -> JSONResponse:
    if not (prompt or "").strip():
        raise AppError("GENERATION_FAILED", "prompt is required.", status_code=400)

    raw = await image.read()
    pil = inference.decode_image(raw, "image")

    last_pil = None
    if last_image is not None and last_image.filename:
        last_raw = await last_image.read()
        if last_raw:
            last_pil = inference.decode_image(last_raw, "last_image")

    frames_i = _form_int(frames, 16, "frames") or 16
    native = map_frame_count(frames_i)
    width_i = _form_int(width, settings.DEFAULT_WIDTH, "width") or settings.DEFAULT_WIDTH
    height_i = _form_int(height, settings.DEFAULT_HEIGHT, "height") or settings.DEFAULT_HEIGHT
    fps_i = validate_fps(_form_int(fps, settings.DEFAULT_FPS, "fps") or settings.DEFAULT_FPS)
    steps_i = _form_int(steps, None, "steps")
    resolved_steps = wan_model.resolve_steps(steps_i)
    if resolved_steps < 1 or resolved_steps > 100:
        raise AppError("GENERATION_FAILED", f"steps {resolved_steps} is out of range 1-100.", status_code=400)
    guidance = _form_float(guidance_scale, 3.5, "guidance_scale")
    seed_i = _form_int(seed, None, "seed")

    profile = gpu.get_gpu_profile(refresh=True)
    width_i, height_i = inference.validate_resolution(width_i, height_i, profile)
    gpu.check_vram_for_request(width_i, height_i, native, resolved_steps)

    jid = storage.sanitize_job_id(job_id)
    work = storage.job_dir(jid)
    pil.save(work / "input.jpg", format="JPEG", quality=95)
    if last_pil is not None:
        last_pil.save(work / "last_image.jpg", format="JPEG", quality=95)

    job = jobs.create_job(
        job_id=jid,
        status="queued",
        prompt=prompt,
        negative_prompt=negative_prompt or "",
        frames=frames_i,
        native_frames=native,
        width=width_i,
        height=height_i,
        steps=resolved_steps,
        guidance_scale=guidance,
        seed=seed_i,
        fps=fps_i,
        continuity_mode=wan_model.continuity_mode(),
        continuity_used=False,
    )
    position = queue.enqueue(job)
    return JSONResponse(
        status_code=202,
        content={"job_id": job.job_id, "status": "queued", "queue_position": position, "provider": PROVIDER},
    )


@app.get("/jobs/{job_id}")
async def get_job(job_id: str, _: None = Depends(require_auth)) -> dict[str, Any]:
    storage.sanitize_job_id(job_id)
    job = jobs.get_job(job_id)
    return job.to_public_dict()


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, _: None = Depends(require_auth)) -> dict[str, Any]:
    storage.sanitize_job_id(job_id)
    job = queue.cancel_job(job_id)
    return job.to_public_dict()


@app.get("/jobs/{job_id}/last-frame")
async def last_frame(job_id: str, _: None = Depends(require_auth)) -> FileResponse:
    storage.sanitize_job_id(job_id)
    job = jobs.get_job(job_id)
    work = storage.job_dir(job_id)
    jpg = work / "last_frame.jpg"
    mp4 = storage.job_output_mp4(job_id)
    if not jpg.exists():
        if job.status != "completed" or not mp4.exists():
            raise AppError(
                "NOT_FOUND",
                "Last frame is not available until the job has completed encoding.",
                status_code=404,
            )
        video.extract_last_frame(mp4, jpg)
    return FileResponse(jpg, media_type="image/jpeg", filename=f"{job_id}_last_frame.jpg")


@app.get("/gpu")
async def gpu_endpoint(_: None = Depends(require_auth)) -> dict[str, Any]:
    return gpu.gpu_snapshot()


@app.get("/diagnostics")
async def diagnostics(_: None = Depends(require_auth)) -> dict[str, Any]:
    profile = gpu.get_gpu_profile(refresh=True)
    pytorch = "not_installed"
    cuda_version = None
    try:
        import torch

        pytorch = getattr(torch, "__version__", "unknown")
        cuda_version = getattr(getattr(torch, "version", None), "cuda", None)
    except Exception:
        pass
    diffusers_v = "not_installed"
    try:
        import diffusers

        diffusers_v = getattr(diffusers, "__version__", "unknown")
    except Exception:
        pass
    ffmpeg_path = None
    try:
        ffmpeg_path = video.find_ffmpeg()
    except AppError:
        ffmpeg_path = None
    return {
        "python": sys.version.split()[0],
        "python_implementation": platform.python_implementation(),
        "pytorch": pytorch,
        "cuda": bool(profile.get("cuda")),
        "cuda_version": cuda_version,
        "gpu": profile.get("gpu_name"),
        "vram": {
            "total_mb": profile.get("total_vram_mb"),
            "free_mb": profile.get("free_vram_mb"),
            "used_mb": profile.get("used_vram_mb"),
            "gb": profile.get("vram_gb"),
        },
        "diffusers": diffusers_v,
        "model_id": settings.MODEL_ID,
        "model_loaded": wan_model.is_model_loaded(),
        "continuity_mode": wan_model.continuity_mode(),
        "lightning": wan_model.lightning_loaded(),
        "ffmpeg": ffmpeg_path or False,
        "disk": {"data_root_free_gb": storage.disk_free_gb()},
        "queue_size": jobs.active_count(),
        "max_queue_size": settings.MAX_QUEUE_SIZE,
        "dtype": wan_model.dtype_name() if wan_model.is_model_loaded() else profile.get("dtype"),
    }


@app.post("/self-test")
async def self_test(_: None = Depends(require_auth)) -> JSONResponse:
    if not gpu.is_cuda_available():
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "CUDA_UNAVAILABLE",
                "message": "CUDA is not available. Real Wan 2.2 generation cannot run on this host.",
                "provider": PROVIDER,
            },
        )
    work_id = storage.new_job_id() + "_selftest"
    work = storage.job_dir(work_id)
    try:
        wan_model.ensure_model_loaded()
        image = Image.new("RGB", (64, 64), (32, 96, 140))
        image.save(work / "input.jpg", format="JPEG", quality=90)
        result = wan_model.generate_video(
            image=image,
            prompt="a slow camera move across a still photograph, cinematic",
            negative_prompt="",
            height=384,
            width=640,
            num_frames=17,
            guidance_scale=3.5,
            num_inference_steps=wan_model.resolve_steps(None),
            seed=0,
            job_id=work_id,
        )
        mp4 = work / "output.mp4"
        video.encode_frames_to_mp4(result.frames, mp4, fps=8)
        public = storage.public_output_mp4(work_id)
        shutil.copy2(mp4, public)
        if not video.is_valid_mp4(mp4):
            raise AppError(
                "VIDEO_ENCODING_FAILED",
                "Self-test encoded a file that is not a valid MP4.",
                status_code=500,
            )
        return JSONResponse(
            content={
                "success": True,
                "job_id": work_id,
                "video_url": f"/outputs/{work_id}.mp4",
                "provider": PROVIDER,
                "model": MODEL_DISPLAY,
                "generation_type": GENERATION_TYPE,
                "native_frames": result.native_frames,
                "steps": result.steps,
            }
        )
    except AppError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, **exc.to_dict(), "provider": PROVIDER},
        )


@app.get("/outputs/{filename}")
async def get_output(filename: str) -> FileResponse:
    path = storage.safe_output_path(filename)
    if not path.exists() or not path.is_file():
        raise AppError("NOT_FOUND", f"Output {filename} was not found.", status_code=404)
    return FileResponse(path, media_type="video/mp4", filename=path.name)


def _collect_stitch_paths(job_ids: list[str], filenames: list[str]) -> list[Path]:
    paths: list[Path] = []
    for jid in job_ids:
        jid = storage.sanitize_job_id(jid)
        mp4 = storage.job_output_mp4(jid)
        public = storage.public_output_mp4(jid)
        if mp4.exists():
            paths.append(mp4)
        elif public.exists():
            paths.append(public)
        else:
            raise AppError("NOT_FOUND", f"No output MP4 for job {jid}.", status_code=404)
    for name in filenames:
        paths.append(storage.safe_output_path(name))
    return paths


@app.post("/stitch")
async def stitch(request: Request, _: None = Depends(require_auth)) -> JSONResponse:
    content_type = (request.headers.get("content-type") or "").lower()
    job_ids: list[str] = []
    filenames: list[str] = []
    if "application/json" in content_type:
        body = await request.json()
        raw_ids = body.get("job_ids") or body.get("jobs") or []
        raw_files = body.get("filenames") or body.get("paths") or []
        if isinstance(raw_ids, str):
            raw_ids = [s.strip() for s in raw_ids.split(",") if s.strip()]
        if isinstance(raw_files, str):
            raw_files = [s.strip() for s in raw_files.split(",") if s.strip()]
        job_ids = [str(x) for x in raw_ids]
        filenames = [Path(str(x)).name for x in raw_files]
    else:
        form = await request.form()
        raw_ids = form.get("job_ids") or form.get("jobs") or ""
        if isinstance(raw_ids, str) and raw_ids:
            job_ids = [s.strip() for s in raw_ids.replace(" ", "").split(",") if s.strip()]
        extra = form.getlist("job_id") if hasattr(form, "getlist") else []
        job_ids.extend(str(x) for x in extra if x)
        raw_files = form.get("filenames") or form.get("paths") or ""
        if isinstance(raw_files, str) and raw_files:
            filenames = [Path(s.strip()).name for s in raw_files.split(",") if s.strip()]

    paths = _collect_stitch_paths(job_ids, filenames)
    if len(paths) < 2:
        raise AppError(
            "STITCH_FAILED",
            "Provide at least two completed job_ids (or output filenames) to stitch a long video.",
            status_code=400,
        )
    stitch_id = storage.new_job_id()
    out = storage.job_output_mp4(stitch_id)
    video.concat_mp4s(paths, out)
    public = storage.public_output_mp4(stitch_id)
    shutil.copy2(out, public)
    job = jobs.create_job(
        job_id=stitch_id,
        status="completed",
        prompt="[stitch]",
        frames=0,
        native_frames=0,
        progress=100,
        video_url=f"/outputs/{stitch_id}.mp4",
        extra={"stitched_from": job_ids or filenames},
    )
    return JSONResponse(
        content={
            "job_id": job.job_id,
            "status": "completed",
            "video_url": job.video_url,
            "provider": PROVIDER,
            "model": MODEL_DISPLAY,
            "generation_type": GENERATION_TYPE,
            "segment_count": len(paths),
        }
    )
