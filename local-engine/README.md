# Mira Local GPU Engine

Mira can now use an **Unlimited Local GPU** generation mode. This avoids the Hugging Face ZeroGPU daily quota by running Wan2.2 TI2V-5B on your own GPU.

## Requirements

- NVIDIA GPU suitable for Wan2.2 TI2V-5B. The official Wan documentation describes a single-GPU configuration at about 24 GB VRAM with offloading/CPU T5.
- Python 3.10+
- The Wan2.2 repository and TI2V-5B checkpoint.

## Install

1. Clone Wan2.2 into `local-engine/Wan2.2`.
2. Install its requirements.
3. Put the TI2V-5B checkpoint in `local-engine/Wan2.2-TI2V-5B`.
4. Install `local-engine/requirements.txt`.
5. Start the API:

```bash
uvicorn local-engine.server:app --host 0.0.0.0 --port 7860
```

If your shell does not accept the hyphenated path as a module:

```bash
cd local-engine
uvicorn server:app --host 0.0.0.0 --port 7860
```

Then open `http://127.0.0.1:7860/health`. It should return `"unlimited": true` and `"ready": true`.

Mira Studio's current default generation engine is this local endpoint at `http://127.0.0.1:7860`.

The official Wan2.2 project provides the TI2V-5B image-to-video generator and documents 720P generation on a single GPU with memory-saving flags.