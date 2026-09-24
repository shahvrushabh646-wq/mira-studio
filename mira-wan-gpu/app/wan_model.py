"""Wan 2.2 image-to-video loader and generator.

Torch and diffusers are imported lazily so FastAPI and tests can start without CUDA.
This module never writes dummy / Ken Burns / zoom-pan frames.
"""

from __future__ import annotations

import inspect
import logging
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image

from app.config import settings
from app.errors import AppError
from app.gpu import get_gpu_profile, is_cuda_available
from app.schemas import MODEL_DISPLAY

logger = logging.getLogger("mira.wan")

_pipe: Any = None
_load_lock = threading.Lock()
_infer_lock = threading.Lock()
_continuity_mode: str = "unknown"
_lightning_loaded: bool = False
_dtype_name: str = "bf16"


@dataclass
class GenerationResult:
    frames: list[Any]
    continuity_used: bool
    continuity_mode: str
    width: int
    height: int
    native_frames: int
    steps: int


def is_model_loaded() -> bool:
    return _pipe is not None


def continuity_mode() -> str:
    return _continuity_mode


def lightning_loaded() -> bool:
    return _lightning_loaded


def dtype_name() -> str:
    return _dtype_name


def inspect_continuity_mode(pipe: Any) -> str:
    try:
        params = inspect.signature(pipe.__call__).parameters
    except (TypeError, ValueError):
        return "unsupported"
    if "last_image" in params:
        return "last_image"
    return "unsupported"


def compute_resized_hw(
    pipe: Any,
    image_width: int,
    image_height: int,
    max_area: int,
) -> tuple[int, int]:
    """Official Wan resize: snap to VAE spatial * patch size, else multiples of 16."""
    aspect_ratio = image_height / max(image_width, 1)
    mod_value = _mod_value(pipe)
    height = int(round(np.sqrt(max_area * aspect_ratio)) // mod_value * mod_value)
    width = int(round(np.sqrt(max_area / aspect_ratio)) // mod_value * mod_value)
    return max(width, mod_value), max(height, mod_value)


def snap_dimensions(pipe: Any, width: int, height: int) -> tuple[int, int]:
    mod_value = _mod_value(pipe)
    width = int(width // mod_value * mod_value)
    height = int(height // mod_value * mod_value)
    return max(width, mod_value), max(height, mod_value)


def _mod_value(pipe: Any) -> int:
    try:
        spatial = int(pipe.vae_scale_factor_spatial)
        patch = pipe.transformer.config.patch_size[1]
        return max(int(spatial * patch), 1)
    except Exception:
        return 16


def _import_torch_and_diffusers() -> tuple[Any, Any]:
    try:
        import torch
    except Exception as exc:
        raise AppError(
            "MODEL_LOADING",
            f"PyTorch is not installed or failed to import: {exc}",
            status_code=503,
        ) from exc
    try:
        from diffusers import WanImageToVideoPipeline
    except Exception as exc:
        raise AppError(
            "MODEL_LOADING",
            (
                "diffusers.WanImageToVideoPipeline is not available. "
                "Install a recent diffusers (git main) that includes Wan 2.2. "
                f"Details: {exc}"
            ),
            status_code=503,
        ) from exc
    return torch, WanImageToVideoPipeline


def _try_call(obj: Any, name: str, *args: Any, **kwargs: Any) -> bool:
    method = getattr(obj, name, None)
    if method is None or not callable(method):
        return False
    try:
        method(*args, **kwargs)
        return True
    except Exception as exc:
        logger.info("%s failed (ignored): %s", name, exc)
        return False


def _enable_memory_features(pipe: Any, offload: str | None, torch: Any) -> None:
    if offload == "sequential":
        if not _try_call(pipe, "enable_sequential_cpu_offload"):
            _try_call(pipe, "enable_model_cpu_offload")
    elif offload == "cpu":
        if not _try_call(pipe, "enable_model_cpu_offload"):
            try:
                pipe.to("cuda")
            except Exception as exc:
                logger.info("pipe.to(cuda) after offload miss: %s", exc)
    else:
        try:
            pipe.to("cuda")
        except Exception as exc:
            raise AppError(
                "CUDA_UNAVAILABLE",
                f"Failed to move Wan pipeline to CUDA: {exc}",
                status_code=503,
            ) from exc

    _try_call(pipe, "enable_vae_tiling")
    _try_call(pipe, "enable_vae_slicing")
    vae = getattr(pipe, "vae", None)
    if vae is not None:
        _try_call(vae, "enable_tiling")
        _try_call(vae, "enable_slicing")
    _try_call(pipe, "enable_xformers_memory_efficient_attention")
    try:
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    except Exception:
        pass


def _try_load_lightning(pipe: Any) -> bool:
    if not settings.ENABLE_LIGHTNING:
        return False
    if not hasattr(pipe, "load_lora_weights"):
        logger.warning("Pipeline has no load_lora_weights; continuing without Lightning LoRA.")
        return False
    repo = settings.LIGHTNING_REPO
    try:
        pipe.load_lora_weights(repo, adapter_name="lightning")
        try:
            pipe.load_lora_weights(
                repo,
                adapter_name="lightning_2",
                load_into_transformer_2=True,
            )
        except TypeError:
            pass
        except Exception as exc:
            logger.info("Lightning transformer_2 LoRA skipped: %s", exc)
        if hasattr(pipe, "set_adapters"):
            try:
                adapters = ["lightning"]
                if "lightning_2" in getattr(pipe, "get_list_adapters", lambda: {})():
                    adapters.append("lightning_2")
                pipe.set_adapters(adapters)
            except Exception as exc:
                logger.info("set_adapters skipped: %s", exc)
        logger.info("Lightning LoRA loaded from %s", repo)
        return True
    except Exception as exc:
        logger.warning(
            "Lightning LoRA load failed from %s (%s). Continuing without it; using 40 steps.",
            repo,
            exc,
        )
        return False


def load_model(*, force: bool = False) -> Any:
    """Load WanImageToVideoPipeline once. Inspect last_image support at load time."""
    global _pipe, _continuity_mode, _lightning_loaded, _dtype_name
    if _pipe is not None and not force:
        return _pipe
    with _load_lock:
        if _pipe is not None and not force:
            return _pipe
        if not is_cuda_available():
            raise AppError(
                "CUDA_UNAVAILABLE",
                "CUDA is not available. Wan 2.2 cannot be loaded on CPU for production inference.",
                status_code=503,
            )
        torch, WanImageToVideoPipeline = _import_torch_and_diffusers()
        if not torch.cuda.is_available():
            raise AppError(
                "CUDA_UNAVAILABLE",
                "torch.cuda.is_available() is False. Install a CUDA build of PyTorch.",
                status_code=503,
            )
        profile = get_gpu_profile(refresh=True)
        if float(profile.get("vram_gb") or 0) < settings.MIN_VRAM_GB:
            raise AppError(
                "INSUFFICIENT_VRAM",
                f"Detected {profile.get('vram_gb')} GB VRAM; this model setup is configured for at least {settings.MIN_VRAM_GB:.0f} GB.",
                status_code=400,
                recommended_frames=16,
                recommended_resolution="640x384",
                recommended_steps=40,
            )
        if profile.get("dtype") == "bf16" and torch.cuda.is_bf16_supported():
            dtype = torch.bfloat16
            _dtype_name = "bf16"
        else:
            dtype = torch.float16
            _dtype_name = "fp16"

        kwargs: dict[str, Any] = {
            "torch_dtype": dtype,
            "cache_dir": str(settings.MODEL_CACHE_DIR),
        }
        if settings.MODEL_REVISION:
            kwargs["revision"] = settings.MODEL_REVISION
        if settings.HF_TOKEN:
            kwargs["token"] = settings.HF_TOKEN

        logger.info(
            "loading model_id=%s dtype=%s cache=%s gpu=%s vram_gb=%s",
            settings.MODEL_ID,
            _dtype_name,
            settings.MODEL_CACHE_DIR,
            profile.get("gpu_name"),
            profile.get("vram_gb"),
        )
        try:
            pipe = WanImageToVideoPipeline.from_pretrained(settings.MODEL_ID, **kwargs)
        except AppError:
            raise
        except Exception as exc:
            detail = str(exc)
            lowered = detail.lower()
            code = (
                "MODEL_NOT_FOUND"
                if any(token in lowered for token in ("repositorynotfound", "model not found", "404 client error", "401 client error"))
                else "MODEL_LOADING"
            )
            raise AppError(
                code,
                f"Failed to load {settings.MODEL_ID}: {detail}",
                status_code=503,
            ) from exc

        _continuity_mode = inspect_continuity_mode(pipe)
        logger.info("continuity_mode=%s (inspected pipe.__call__)", _continuity_mode)

        _enable_memory_features(pipe, profile.get("offload"), torch)
        _lightning_loaded = _try_load_lightning(pipe)
        _pipe = pipe
        logger.info(
            "model loaded id=%s lightning=%s continuity=%s offload=%s",
            settings.MODEL_ID,
            _lightning_loaded,
            _continuity_mode,
            profile.get("offload"),
        )
        return _pipe


def ensure_model_loaded() -> Any:
    return load_model(force=False)


def resolve_steps(user_steps: int | None) -> int:
    if user_steps is not None:
        return int(user_steps)
    if _lightning_loaded:
        return 8
    if settings.ENABLE_LIGHTNING:
        return int(settings.DEFAULT_STEPS)
    return 40


def _to_pil_frames(frames: Any) -> list[Image.Image]:
    if frames is None:
        raise AppError(
            "REAL_AI_GENERATION_FAILED",
            "Wan pipeline returned no frames.",
            status_code=500,
        )
    seq = list(frames)
    if not seq:
        raise AppError(
            "REAL_AI_GENERATION_FAILED",
            "Wan pipeline returned an empty frame list.",
            status_code=500,
        )
    out: list[Image.Image] = []
    for frame in seq:
        if isinstance(frame, Image.Image):
            out.append(frame.convert("RGB"))
            continue
        arr: Any
        if hasattr(frame, "detach"):
            arr = frame.detach().cpu().numpy()
        else:
            arr = np.asarray(frame)
        if arr.ndim == 3 and arr.shape[0] in (1, 3) and arr.shape[-1] not in (1, 3, 4):
            arr = np.transpose(arr, (1, 2, 0))
        if arr.dtype != np.uint8:
            max_v = float(arr.max()) if arr.size else 0.0
            if max_v <= 1.0:
                arr = (arr * 255.0).clip(0, 255).astype(np.uint8)
            else:
                arr = arr.clip(0, 255).astype(np.uint8)
        if arr.shape[-1] == 4:
            arr = arr[..., :3]
        out.append(Image.fromarray(arr).convert("RGB"))
    return out


def generate_video(
    *,
    image: Image.Image,
    prompt: str,
    negative_prompt: str = "",
    height: int = 720,
    width: int = 1280,
    num_frames: int = 17,
    guidance_scale: float = 3.5,
    num_inference_steps: int | None = None,
    seed: int | None = None,
    last_image: Image.Image | None = None,
    job_id: str | None = None,
) -> GenerationResult:
    """Call the real WanImageToVideoPipeline under torch.inference_mode().

    Never synthesizes dummy frames, zooms, or pans.
    """
    if num_frames == 43:
        raise AppError(
            "INVALID_FRAME_COUNT",
            "Frame count 43 is not a valid Wan 4k+1 length and must never be sent to the model.",
            status_code=400,
        )

    pipe = ensure_model_loaded()
    torch, _ = _import_torch_and_diffusers()
    if not torch.cuda.is_available():
        raise AppError(
            "CUDA_UNAVAILABLE",
            "CUDA became unavailable before generation.",
            status_code=503,
        )

    steps = resolve_steps(num_inference_steps)
    width, height = snap_dimensions(pipe, width, height)
    image = image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    last_resized = None
    if last_image is not None:
        last_resized = last_image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)

    generator = None
    if seed is not None:
        generator = torch.Generator(device="cuda").manual_seed(int(seed))

    call_kwargs: dict[str, Any] = {
        "image": image,
        "prompt": prompt,
        "negative_prompt": negative_prompt or "",
        "height": height,
        "width": width,
        "num_frames": int(num_frames),
        "guidance_scale": float(guidance_scale),
        "num_inference_steps": int(steps),
        "generator": generator,
    }
    used_continuity = False
    mode = inspect_continuity_mode(pipe) if _continuity_mode == "unknown" else _continuity_mode
    if last_resized is not None and mode == "last_image":
        call_kwargs["last_image"] = last_resized
        used_continuity = True
    elif last_resized is not None:
        logger.info(
            "job_id=%s last_image provided but continuity_mode=%s; not passing last_image to the pipeline",
            job_id,
            mode,
        )

    logger.info(
        "job_id=%s generate model=%s frames=%s resolution=%sx%s steps=%s guidance=%s seed=%s continuity_used=%s",
        job_id,
        MODEL_DISPLAY,
        num_frames,
        width,
        height,
        steps,
        guidance_scale,
        seed,
        used_continuity,
    )

    with _infer_lock:
        try:
            with torch.inference_mode():
                output = pipe(**call_kwargs)
        except AppError:
            raise
        except RuntimeError as exc:
            text = str(exc).lower()
            if "out of memory" in text or "cuda oom" in text:
                raise AppError(
                    "INSUFFICIENT_VRAM",
                    f"CUDA out of memory during Wan 2.2 generation: {exc}",
                    status_code=400,
                    recommended_frames=32,
                    recommended_resolution="832x480",
                    recommended_steps=8 if _lightning_loaded else 40,
                ) from exc
            raise AppError(
                "REAL_AI_GENERATION_FAILED",
                f"Wan 2.2 generation failed: {exc}",
                status_code=500,
            ) from exc
        except Exception as exc:
            raise AppError(
                "REAL_AI_GENERATION_FAILED",
                f"Wan 2.2 generation failed: {exc}",
                status_code=500,
            ) from exc

    frames_raw = getattr(output, "frames", None)
    if frames_raw is None and isinstance(output, dict):
        frames_raw = output.get("frames")
    if frames_raw is None:
        raise AppError(
            "REAL_AI_GENERATION_FAILED",
            "Wan pipeline returned no .frames output.",
            status_code=500,
        )
    first = frames_raw[0] if isinstance(frames_raw, (list, tuple)) else frames_raw
    if first is not None and not isinstance(first, Image.Image) and hasattr(first, "__len__") and not hasattr(first, "shape"):
        frame_list = list(first)
    elif isinstance(frames_raw, (list, tuple)) and frames_raw and isinstance(frames_raw[0], Image.Image):
        frame_list = list(frames_raw)
    else:
        frame_list = list(first) if not isinstance(first, Image.Image) else list(frames_raw)

    frames = _to_pil_frames(frame_list)
    return GenerationResult(
        frames=frames,
        continuity_used=used_continuity,
        continuity_mode=mode,
        width=width,
        height=height,
        native_frames=int(num_frames),
        steps=int(steps),
    )
