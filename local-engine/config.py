import os
from pathlib import Path

ROOT=Path(__file__).resolve().parent
def env(name, default=""): return os.getenv(name, default).strip()
def boolean(name, default=False): return env(name, "1" if default else "0").lower() in {"1","true","yes","on"}

API_KEY=env("MIRA_GPU_API_KEY")
PRIVATE_MODE=boolean("MIRA_PRIVATE_MODE", bool(API_KEY))
FRONTEND_URLS=[x.strip().rstrip("/") for x in env("MIRA_FRONTEND_URL","http://localhost:8080,http://127.0.0.1:8080").split(",") if x.strip()]
MODEL_ID=env("MODEL_ID","Wan-AI/Wan2.2-I2V-A14B-Diffusers")
FALLBACK_MODEL_ID=env("FALLBACK_MODEL_ID","Wan-AI/Wan2.1-I2V-14B-720P-Diffusers")
WAN_DIR=env("WAN_DIR")
WAN_CKPT_DIR=env("WAN_CKPT_DIR")
HOST=env("HOST","0.0.0.0")
PORT=int(env("PORT","8000") or 8000)
MAX_CONCURRENT_JOBS=max(1,int(env("MAX_CONCURRENT_JOBS","1") or 1))
MAX_STORAGE_GB=max(1,float(env("MAX_STORAGE_GB","20") or 20))
VIDEO_RETENTION_HOURS=max(1,float(env("VIDEO_RETENTION_HOURS","24") or 24))
PRELOAD_MODEL=boolean("PRELOAD_MODEL",False)
GPU_WAIT_TIMEOUT_SECONDS=int(env("GPU_WAIT_TIMEOUT_SECONDS","0") or 0)
MAX_UPLOAD_BYTES=25*1024*1024
DATA_DIR=ROOT/"data"; INPUT_DIR=ROOT/"inputs"; OUTPUT_DIR=ROOT/"outputs"; JOBS_DIR=DATA_DIR/"jobs"; FRAMES_DIR=DATA_DIR/"frames"
for p in (DATA_DIR,INPUT_DIR,OUTPUT_DIR,JOBS_DIR,FRAMES_DIR): p.mkdir(parents=True,exist_ok=True)
DEFAULT_NEGATIVE="morphing, face distortion, identity drift, extra limbs, duplicated people, object deformation, invented objects, invented text, flickering, excessive motion, warped geometry, deformed hands, watermark, low quality"
