import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import gradio as gr

ROOT = Path(__file__).resolve().parent
WAN_DIR = Path(os.getenv("WAN_DIR", str(ROOT / "Wan2.2")))
CKPT_DIR = Path(os.getenv("WAN_CKPT_DIR", str(ROOT / "Wan2.2-TI2V-5B")))
OUTPUT_DIR = ROOT / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

DEFAULT_NEGATIVE = (
    "distorted face, identity drift, extra limbs, duplicated subjects, warped objects, "
    "invented text, morphing, flicker, jitter, deformed hands, watermark, low quality"
)

def generate(
    image,
    prompt,
    negative_prompt,
    aspect,
    steps,
    duration,
    seed,
):
    if image is None:
        raise gr.Error("Upload an image first.")
    if not prompt.strip():
        raise gr.Error("Enter a creative direction.")

    if not (WAN_DIR / "generate.py").exists():
        raise gr.Error("Wan2.2 is not installed in local-engine/Wan2.2.")
    if not CKPT_DIR.exists():
        raise gr.Error("Wan2.2-TI2V-5B checkpoint is missing.")

    job = uuid.uuid4().hex
    image_path = ROOT / "inputs" / f"{job}.png"
    image_path.parent.mkdir(exist_ok=True)
    image.save(image_path)

    output = OUTPUT_DIR / f"{job}.mp4"
    size = "704*1280" if aspect == "9:16" else "1280*704"
    frames = max(49, min(int(float(duration) * 24) + 1, 121))

    cmd = [
        sys.executable, str(WAN_DIR / "generate.py"),
        "--task", "ti2v-5B",
        "--size", size,
        "--ckpt_dir", str(CKPT_DIR),
        "--offload_model", "True",
        "--convert_model_dtype",
        "--t5_cpu",
        "--image", str(image_path),
        "--prompt", prompt[:7000],
        "--sample_steps", str(int(steps)),
        "--frame_num", str(frames),
        "--save_file", str(output),
    ]

    if seed is not None:
        cmd += ["--base_seed", str(int(seed))]

    try:
        process = subprocess.run(
            cmd,
            cwd=WAN_DIR,
            capture_output=True,
            text=True,
        )
        if process.returncode != 0 or not output.exists():
            tail = (process.stdout + "\n" + process.stderr)[-5000:]
            raise gr.Error("Wan2.2 generation failed:\n" + tail)
        return str(output)
    finally:
        try:
            image_path.unlink(missing_ok=True)
        except Exception:
            pass

with gr.Blocks(title="Mira Studio — Local Wan 2.2") as demo:
    gr.Markdown(
        "# Mira Studio — Local Wan 2.2\n"
        "Token-free image-to-video generation. The model runs on your own GPU."
    )

    with gr.Row():
        with gr.Column():
            image = gr.Image(type="pil", label="Reference image")
            prompt = gr.Textbox(
                label="Creative direction",
                lines=8,
                placeholder=(
                    "Example: Animate the teacher naturally writing on the board; "
                    "students look toward the board; camera slowly pushes in; "
                    "preserve all people, objects and visible text."
                ),
            )
            negative = gr.Textbox(
                value=DEFAULT_NEGATIVE,
                label="Negative prompt",
                lines=4,
            )

        with gr.Column():
            aspect = gr.Radio(["9:16", "16:9"], value="9:16", label="Aspect ratio")
            steps = gr.Slider(4, 50, value=20, step=1, label="Sampling steps")
            duration = gr.Slider(2, 5, value=3.5, step=0.5, label="Duration")
            seed = gr.Number(value=0, precision=0, label="Seed (0 = random)")
            generate_btn = gr.Button("Generate AI film", variant="primary")

    video = gr.Video(label="Generated video")
    generate_btn.click(
        generate,
        inputs=[image, prompt, negative, aspect, steps, duration, seed],
        outputs=video,
    )

demo.queue(max_size=2).launch(
    server_name=os.getenv("HOST", "0.0.0.0"),
    server_port=int(os.getenv("PORT", "7860")),
)
