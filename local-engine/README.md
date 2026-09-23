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

## Quick Windows setup

From the repository root in PowerShell:

```powershell
cd local-engine
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Install the official Wan2.2 code:

```powershell
git clone https://github.com/Wan-Video/Wan2.2.git local-engine/Wan2.2
cd local-engine/Wan2.2
pip install -r requirements.txt
pip install .
cd ../..
```

Download the official **Wan2.2-TI2V-5B** checkpoint into `local-engine/Wan2.2-TI2V-5B`. The checkpoint is about **34.2 GB**. The official model is `Wan-AI/Wan2.2-TI2V-5B`.

Then start Mira's local API:

```powershell
local-engine\.venv\Scripts\uvicorn.exe local-engine.server:app --host 0.0.0.0 --port 7860
```

Verify:

```
http://127.0.0.1:7860/health
```

For Mira opened on a phone while Wan runs on a PC, use the PC's LAN IP instead of `127.0.0.1`, for example `http://192.168.1.10:7860`.

Wan2.2's official TI2V-5B documentation describes 720P single-GPU inference with memory-saving flags on roughly 24 GB VRAM. citeturn0search1turn0search3
