from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Sequence

from PIL import Image

from app.errors import AppError

logger = logging.getLogger("mira.video")


def find_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and Path(exe).exists():
            return exe
    except Exception as exc:
        logger.info("imageio-ffmpeg not available: %s", exc)
    raise AppError(
        "FFMPEG_UNAVAILABLE",
        "ffmpeg is not installed. Install system ffmpeg or imageio-ffmpeg.",
        status_code=500,
    )


def find_ffprobe() -> str | None:
    path = shutil.which("ffprobe")
    if path:
        return path
    ffmpeg = None
    try:
        ffmpeg = find_ffmpeg()
    except AppError:
        return None
    candidate = str(Path(ffmpeg).parent / "ffprobe")
    return candidate if Path(candidate).exists() else None


def _to_rgb_image(frame: Any) -> Image.Image:
    if isinstance(frame, Image.Image):
        return frame.convert("RGB")
    try:
        import numpy as np
    except Exception as exc:
        raise AppError(
            "VIDEO_ENCODING_FAILED",
            f"Cannot convert frame of type {type(frame)!r}: {exc}",
            status_code=500,
        )
    if hasattr(frame, "detach"):
        frame = frame.detach().cpu().numpy()
    arr = np.asarray(frame)
    if arr.ndim == 3 and arr.shape[0] in (1, 3) and arr.shape[-1] not in (1, 3, 4):
        arr = np.transpose(arr, (1, 2, 0))
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    if arr.shape[-1] == 4:
        arr = arr[..., :3]
    if arr.dtype != np.uint8:
        max_v = float(arr.max()) if arr.size else 0.0
        if max_v <= 1.0:
            arr = (arr * 255.0).clip(0, 255).astype("uint8")
        else:
            arr = arr.clip(0, 255).astype("uint8")
    return Image.fromarray(arr).convert("RGB")


def is_valid_mp4(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 32:
        return False
    try:
        head = path.read_bytes()[:64]
    except OSError:
        return False
    return b"ftyp" in head or b"moov" in head or b"mdat" in head


def encode_frames_to_mp4(
    frames: Sequence[Any],
    output_path: Path,
    fps: int = 16,
) -> Path:
    """Encode frames to H.264 yuv420p +faststart MP4 via ffmpeg. Never a dummy animation."""
    if not frames:
        raise AppError(
            "VIDEO_ENCODING_FAILED",
            "No frames were produced by the model; cannot encode an empty video.",
            status_code=500,
        )
    ffmpeg = find_ffmpeg()
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    images = [_to_rgb_image(f) for f in frames]
    width, height = images[0].size
    if width % 2 or height % 2:
        width -= width % 2
        height -= height % 2
        images = [im.resize((width, height), Image.Resampling.LANCZOS) for im in images]

    with tempfile.TemporaryDirectory(prefix="mira-frames-") as tmp:
        tmp_dir = Path(tmp)
        for i, im in enumerate(images):
            im.save(tmp_dir / f"frame_{i:05d}.png")
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-framerate",
            str(int(fps)),
            "-i",
            str(tmp_dir / "frame_%05d.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        except (subprocess.TimeoutExpired, OSError) as exc:
            raise AppError(
                "VIDEO_ENCODING_FAILED",
                f"ffmpeg failed to encode MP4: {exc}",
                status_code=500,
            ) from exc
        if proc.returncode != 0 or not is_valid_mp4(output_path):
            err = (proc.stderr or proc.stdout or "").strip()
            raise AppError(
                "VIDEO_ENCODING_FAILED",
                f"ffmpeg failed to produce a valid H.264 MP4: {err or 'unknown encoder error'}",
                status_code=500,
            )
    logger.info("encoded %s frames -> %s fps=%s", len(images), output_path, fps)
    return output_path


def extract_last_frame(video_path: Path, output_jpg: Path) -> Path:
    ffmpeg = find_ffmpeg()
    output_jpg = Path(output_jpg)
    output_jpg.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-sseof",
        "-0.1",
        "-i",
        str(video_path),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(output_jpg),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if proc.returncode != 0 or not output_jpg.exists() or output_jpg.stat().st_size < 32:
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(video_path),
            "-vf",
            "select=eom",
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(output_jpg),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if not output_jpg.exists() or output_jpg.stat().st_size < 32:
        err = (proc.stderr or "").strip()
        raise AppError(
            "VIDEO_ENCODING_FAILED",
            f"Failed to extract last frame from {video_path.name}: {err or 'empty output'}",
            status_code=500,
        )
    return output_jpg


def concat_mp4s(inputs: Sequence[Path], output_path: Path) -> Path:
    if len(inputs) < 2:
        raise AppError(
            "STITCH_FAILED",
            "Stitch requires at least two video segments.",
            status_code=400,
        )
    for p in inputs:
        if not Path(p).exists() or not is_valid_mp4(Path(p)):
            raise AppError(
                "STITCH_FAILED",
                f"Missing or invalid MP4 segment: {p}",
                status_code=400,
            )
    ffmpeg = find_ffmpeg()
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mira-stitch-") as tmp:
        list_file = Path(tmp) / "concat.txt"
        lines = []
        for p in inputs:
            resolved = Path(p).resolve().as_posix().replace("'", r"'\''")
            lines.append(f"file '{resolved}'")
        list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
        copy_cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        proc = subprocess.run(copy_cmd, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0 or not is_valid_mp4(output_path):
            reenc = [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
            proc = subprocess.run(reenc, capture_output=True, text=True, timeout=600)
            if proc.returncode != 0 or not is_valid_mp4(output_path):
                err = (proc.stderr or "").strip()
                raise AppError(
                    "STITCH_FAILED",
                    f"ffmpeg concat failed: {err or 'unknown error'}",
                    status_code=500,
                )
    return output_path
