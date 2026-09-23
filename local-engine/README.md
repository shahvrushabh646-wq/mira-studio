# Mira Personal GPU Engine

Personal Wan image-to-video backend for Mira Studio.

Adds real CUDA/VRAM detection, Wan 2.2 with Wan 2.1 fallback, persistent GPU queue, restart recovery, API-key protection, VRAM-aware limits, OOM handling, long-video shot stitching, and continuity frames.

Install a CUDA-compatible PyTorch build, then run `pip install -r requirements.txt`. Install FFmpeg and put it on PATH. Copy `.env.example` to `.env`, set `MIRA_GPU_API_KEY`, `MIRA_PRIVATE_MODE=true`, and `MIRA_FRONTEND_URL=http://localhost:8080`. Start with `python server.py` from `local-engine`. Check `/health` on port 8000.

This is personal compute architecture, not unlimited physical GPU capacity. Hardware still has finite VRAM and runtime.
