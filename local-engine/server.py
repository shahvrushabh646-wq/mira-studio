import os
import sys
import uuid
import asyncio
import subprocess
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
WAN_DIR = Path(os.getenv("WAN_DIR", str(ROOT / "Wan2.2")))
CKPT_DIR = Path(os.getenv("WAN_CKPT_DIR", str(ROOT / "Wan2.2-TI2V-5B")))
OUTPUT_DIR = ROOT / "outputs"
INPUT_DIR = ROOT / "inputs"
OUTPUT_DIR.mkdir(exist_ok=True)
INPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Mira Local Video Engine", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: Dict[str, dict] = {}

class JobResponse(BaseModel):
    job_id: str

def _safe_size(aspect: str) -> str:
    return "704*1280" if aspect == "9:16" else "1280*704"

async def run_wan(job_id: str, image_path: Path, prompt: str, aspect: str, steps: int, duration: int):
    output_path = OUTPUT_DIR / f"{job_id}.mp4"
    jobs[job_id] = {"status": "running", "progress": 0, "message": "Loading Wan 2.2…"}
    cmd = [
        sys.executable,
        str(WAN_DIR / "generate.py"),
        "--task", "ti2v-5B",
        "--size", _safe_size(aspect),
        "--ckpt_dir", str(CKPT_DIR),
        "--offload_model", "True",
        "--convert_model_dtype",
        "--t5_cpu",
        "--image", str(image_path),
        "--prompt", prompt[:7000],
        "--sample_steps", str(max(4, min(int(steps), 50))),
        "--frame_num", str(max(49, min(int(duration * 24) + 1, 121))),
        "--save_file", str(output_path),
    ]
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(WAN_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        lines = []
        while True:
            raw = await process.stdout.readline()
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").strip()
            if line:
                lines.append(line)
                if "%" in line:
                    jobs[job_id]["message"] = line[-180:]
        code = await process.wait()
        if code != 0 or not output_path.exists():
            tail = "\n".join(lines[-12:])
            raise RuntimeError(f"Wan exited with code {code}.\n{tail}")
        jobs[job_id] = {
            "status": "completed",
            "progress": 100,
            "message": "Video ready.",
            "video_url": f"/videos/{output_path.name}",
        }
    except Exception as exc:
        jobs[job_id] = {"status": "failed", "progress": 0, "message": str(exc)}
    finally:
        try:
            image_path.unlink(missing_ok=True)
        except Exception:
            pass

@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "Wan2.2 TI2V-5B",
        "unlimited": True,
        "gpu_required": True,
        "checkpoint": str(CKPT_DIR),
        "ready": (WAN_DIR / "generate.py").exists() and CKPT_DIR.exists(),
    }

@app.post("/generate", response_model=JobResponse)
async def generate(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    aspect: str = Form("9:16"),
    steps: int = Form(20),
    duration: int = Form(5),
):
    if not (WAN_DIR / "generate.py").exists():
        raise HTTPException(500, "Wan2.2 is not installed. Follow local-engine/README.md.")
    if not CKPT_DIR.exists():
        raise HTTPException(500, "Wan2.2-TI2V-5B checkpoint is missing. Follow local-engine/README.md.")
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(400, "Please upload an image file.")
    job_id = uuid.uuid4().hex
    suffix = Path(image.filename or "reference.jpg").suffix.lower() or ".jpg"
    image_path = INPUT_DIR / f"{job_id}{suffix}"
    image_path.write_bytes(await image.read())
    asyncio.create_task(run_wan(job_id, image_path, prompt, aspect, steps, max(2, min(int(duration), 5))))
    jobs[job_id] = {"status": "queued", "progress": 0, "message": "Queued on your GPU."}
    return {"job_id": job_id}

@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Unknown job.")
    return jobs[job_id]

@app.get("/videos/{filename}")
def video(filename: str):
    safe = Path(filename).name
    path = OUTPUT_DIR / safe
    if not path.exists():
        raise HTTPException(404, "Video not found.")
    return FileResponse(path, media_type="video/mp4", filename=safe)

@app.get("/")
def root():
    return {"name": "Mira Local Video Engine", "engine": "Wan2.2 TI2V-5B", "unlimited": True}
