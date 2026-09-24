from __future__ import annotations

import logging
import shutil
import subprocess
from typing import Any

from app.config import settings
from app.errors import AppError

logger = logging.getLogger("mira.gpu")

_profile_cache: dict[str, Any] | None = None


def query_nvidia_smi() -> dict[str, Any] | None:
    if not shutil.which("nvidia-smi"):
        return None
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.free,memory.used,temperature.gpu,utilization.gpu,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=8,
            check=True,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError, OSError) as exc:
        logger.info("nvidia-smi unavailable: %s", exc)
        return None
    line = (result.stdout or "").strip().splitlines()
    if not line:
        return None
    parts = [p.strip() for p in line[0].split(",")]
    if len(parts) < 4:
        return None

    def _num(value: str) -> float | None:
        if value in ("", "N/A", "[N/A]", "None"):
            return None
        try:
            return float(value)
        except ValueError:
            return None

    total_mb = _num(parts[1]) or 0.0
    free_mb = _num(parts[2]) or 0.0
    used_mb = _num(parts[3]) or 0.0
    return {
        "name": parts[0],
        "total_vram_mb": total_mb,
        "free_vram_mb": free_mb,
        "used_vram_mb": used_mb,
        "temperature": _num(parts[4]) if len(parts) > 4 else None,
        "utilization": _num(parts[5]) if len(parts) > 5 else None,
        "driver": parts[6] if len(parts) > 6 else None,
    }


def _torch_cuda_info() -> dict[str, Any] | None:
    try:
        import torch  # lazy
    except Exception:
        return None
    try:
        if not torch.cuda.is_available():
            return {
                "cuda": False,
                "bf16": False,
                "name": None,
                "total_vram_mb": 0.0,
                "free_vram_mb": 0.0,
                "used_vram_mb": 0.0,
            }
        props = torch.cuda.get_device_properties(0)
        free_b, total_b = torch.cuda.mem_get_info()
        return {
            "cuda": True,
            "bf16": bool(torch.cuda.is_bf16_supported()),
            "name": props.name,
            "total_vram_mb": total_b / (1024 * 1024),
            "free_vram_mb": free_b / (1024 * 1024),
            "used_vram_mb": (total_b - free_b) / (1024 * 1024),
        }
    except Exception as exc:
        logger.info("torch CUDA probe failed: %s", exc)
        return None


def is_cuda_available() -> bool:
    smi = query_nvidia_smi()
    if smi and (smi.get("total_vram_mb") or 0) > 0:
        return True
    info = _torch_cuda_info()
    return bool(info and info.get("cuda"))


def is_bf16_supported() -> bool:
    info = _torch_cuda_info()
    if info is not None:
        return bool(info.get("bf16"))
    return False


def _build_profile(
    gpu_name: str,
    vram_gb: float,
    *,
    cuda: bool,
    dtype: str,
    free_vram_gb: float,
    smi: dict[str, Any] | None,
) -> dict[str, Any]:
    if vram_gb >= 40:
        max_frames = 81
        max_resolution = "1280x720"
        offload: str | None = None
    elif vram_gb >= 24:
        max_frames = 81
        max_resolution = "1280x720"
        offload = "cpu"
    elif vram_gb >= 16:
        max_frames = 33
        max_resolution = "832x480"
        offload = "cpu"
    elif vram_gb >= 10:
        max_frames = 17
        max_resolution = "640x384"
        offload = "sequential"
    else:
        max_frames = 0
        max_resolution = "640x384"
        offload = "sequential"

    from app.config import settings

    recommended_steps = 8 if settings.ENABLE_LIGHTNING else 40
    return {
        "gpu_name": gpu_name,
        "vram_gb": round(vram_gb, 2),
        "free_vram_gb": round(free_vram_gb, 2),
        "dtype": dtype,
        "max_frames": max_frames,
        "max_resolution": max_resolution,
        "recommended_steps": recommended_steps,
        "offload": offload,
        "cuda": cuda,
        "temperature": smi.get("temperature") if smi else None,
        "utilization": smi.get("utilization") if smi else None,
        "driver": smi.get("driver") if smi else None,
        "total_vram_mb": smi.get("total_vram_mb") if smi else round(vram_gb * 1024, 1),
        "free_vram_mb": smi.get("free_vram_mb") if smi else round(free_vram_gb * 1024, 1),
        "used_vram_mb": smi.get("used_vram_mb") if smi else None,
    }


def get_gpu_profile(*, refresh: bool = False) -> dict[str, Any]:
    """Detect GPU at runtime. Never hardcode a GPU model."""
    global _profile_cache
    smi = query_nvidia_smi()
    torch_info = _torch_cuda_info()

    gpu_name = "none"
    total_mb = 0.0
    free_mb = 0.0
    cuda = False
    if smi:
        gpu_name = smi.get("name") or "nvidia-smi"
        total_mb = float(smi.get("total_vram_mb") or 0)
        free_mb = float(smi.get("free_vram_mb") or 0)
        cuda = total_mb > 0
    if torch_info:
        cuda = bool(torch_info.get("cuda")) or cuda
        if torch_info.get("name"):
            gpu_name = torch_info["name"]
        if torch_info.get("total_vram_mb"):
            total_mb = float(torch_info["total_vram_mb"])
        if torch_info.get("free_vram_mb") is not None:
            free_mb = float(torch_info["free_vram_mb"])

    vram_gb = total_mb / 1024.0 if total_mb else 0.0
    free_vram_gb = free_mb / 1024.0 if free_mb else 0.0
    dtype = "bf16" if is_bf16_supported() else "fp16"
    profile = _build_profile(
        gpu_name,
        vram_gb,
        cuda=cuda,
        dtype=dtype,
        free_vram_gb=free_vram_gb,
        smi=smi,
    )
    if not refresh and _profile_cache is not None:
        # Keep static fields; refresh free memory / utilization.
        merged = dict(_profile_cache)
        for key in (
            "free_vram_gb",
            "free_vram_mb",
            "used_vram_mb",
            "temperature",
            "utilization",
            "cuda",
            "vram_gb",
            "total_vram_mb",
            "gpu_name",
            "dtype",
            "max_frames",
            "max_resolution",
            "offload",
            "recommended_steps",
        ):
            if key in profile:
                merged[key] = profile[key]
        _profile_cache = merged
        return merged
    _profile_cache = profile
    return profile


def reset_gpu_cache() -> None:
    global _profile_cache
    _profile_cache = None


def parse_resolution(text: str) -> tuple[int, int]:
    w_s, h_s = text.lower().split("x")
    return int(w_s), int(h_s)


def recommendations(profile: dict[str, Any] | None = None) -> tuple[int, str, int]:
    profile = profile or get_gpu_profile()
    vram = float(profile.get("vram_gb") or 0)
    steps = int(profile.get("recommended_steps") or 40)
    if vram >= 24:
        return 64, "1280x720", steps
    if vram >= 16:
        return 32, "832x480", steps
    if vram >= 10:
        return 16, "640x384", steps
    return 16, "640x384", steps


def check_vram_for_request(width: int, height: int, native_frames: int, steps: int) -> None:
    """Raise INSUFFICIENT_VRAM / CUDA_UNAVAILABLE before generation."""
    profile = get_gpu_profile(refresh=True)
    rec_frames, rec_res, rec_steps = recommendations(profile)
    extra = {
        "recommended_frames": rec_frames,
        "recommended_resolution": rec_res,
        "recommended_steps": rec_steps,
    }
    if not profile.get("cuda"):
        raise AppError(
            "CUDA_UNAVAILABLE",
            "No CUDA GPU is available. Wan 2.2 image-to-video cannot run without CUDA.",
            status_code=503,
        )
    vram = float(profile.get("vram_gb") or 0)
    if vram < settings.MIN_VRAM_GB:
        raise AppError(
            "INSUFFICIENT_VRAM",
            (
                f"Detected {vram:.1f} GB VRAM, below the configured "
                f"{settings.MIN_VRAM_GB:.0f} GB minimum for this Wan 2.2 model setup."
            ),
            status_code=400,
            **extra,
        )

    max_frames = int(profile.get("max_frames") or 0)
    max_w, max_h = parse_resolution(str(profile.get("max_resolution") or "640x384"))
    max_pixels = max_w * max_h
    pixels = width * height

    too_many_frames = native_frames > max_frames
    too_large_res = pixels > max_pixels

    free_gb = float(profile.get("free_vram_gb") or 0)
    # Heuristic: 14B I2V roughly needs ~8GB weights + scale with pixels*frames.
    estimated = max(
        settings.MIN_VRAM_GB,
        8.0 + (pixels * native_frames) / (1280 * 720 * 81) * 16.0,
    )
    offload = profile.get("offload")
    if offload == "cpu":
        estimated *= 0.7
    elif offload == "sequential":
        estimated *= 0.5
    tight_free = free_gb > 0 and estimated > (free_gb + 1.5)

    if too_many_frames or too_large_res or tight_free:
        reason = []
        if too_many_frames:
            reason.append(f"{native_frames} frames exceeds GPU max {max_frames}")
        if too_large_res:
            reason.append(f"{width}x{height} exceeds GPU max {max_w}x{max_h}")
        if tight_free and not (too_many_frames or too_large_res):
            reason.append(
                f"estimated {estimated:.1f} GB exceeds free {free_gb:.1f} GB"
            )
        raise AppError(
            "INSUFFICIENT_VRAM",
            "Not enough GPU memory for this request: " + "; ".join(reason) + ".",
            status_code=400,
            **extra,
        )


def gpu_snapshot() -> dict[str, Any]:
    smi = query_nvidia_smi()
    profile = get_gpu_profile(refresh=True)
    return {
        "name": profile.get("gpu_name"),
        "total_vram_mb": profile.get("total_vram_mb"),
        "free_vram_mb": profile.get("free_vram_mb"),
        "used_vram_mb": profile.get("used_vram_mb") if profile.get("used_vram_mb") is not None else (
            (smi or {}).get("used_vram_mb")
        ),
        "cuda": bool(profile.get("cuda")),
        "temperature": profile.get("temperature"),
        "utilization": profile.get("utilization"),
        "driver": profile.get("driver"),
        "dtype": profile.get("dtype"),
        "offload": profile.get("offload"),
        "max_frames": profile.get("max_frames"),
        "max_resolution": profile.get("max_resolution"),
    }
