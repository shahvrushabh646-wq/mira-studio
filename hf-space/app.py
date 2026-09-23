import os
import random
import tempfile

import gradio as gr
import spaces
import torch
from diffusers import WanImageToVideoPipeline
from diffusers.utils import export_to_video

MODEL_ID = os.getenv("REPO_ID", "Wan-AI/Wan2.2-I2V-A14B-Diffusers")
FPS = 16
DEFAULT_NEGATIVE = "distorted face, identity drift, extra limbs, duplicated subjects, warped objects, invented text, morphing, flicker, jitter, deformed hands, watermark, low quality"

print("Loading Wan 2.2:", MODEL_ID)
pipe = WanImageToVideoPipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
)
pipe.to("cuda")

@spaces.GPU(duration=60, size="xlarge")
def generate_video(
    input_image,
    last_image,
    prompt,
    steps,
    negative_prompt,
    duration_seconds,
    guidance_scale,
    guidance_scale_2,
    seed,
    randomize_seed,
    quality,
    scheduler,
    flow_shift,
    frame_multiplier,
    upscale_model,
    upscale_factor,
    safe_mode,
    enable_safety_checker,
    video_component,
    progress=gr.Progress(track_tqdm=True),
):
    if input_image is None:
        raise gr.Error("Upload an image first.")
    if not prompt or not str(prompt).strip():
        raise gr.Error("Enter a creative direction.")

    steps = int(max(4, min(int(steps or 6), 20)))
    duration_seconds = float(max(2.0, min(float(duration_seconds or 3.5), 4.0)))
    guidance_scale = float(guidance_scale or 1.0)
    guidance_scale_2 = float(guidance_scale_2 or 1.0)
    quality = float(quality or 6)
    flow_shift = float(flow_shift or 3)
    frame_multiplier = int(frame_multiplier or 16)

    if randomize_seed:
        seed = random.randint(0, 2147483647)
    else:
        seed = int(seed or 0)

    frames = max(49, min(int(round(duration_seconds * FPS)) + 1, 81))

    generator = torch.Generator(device="cuda").manual_seed(seed)

    result = pipe(
        image=input_image,
        last_image=last_image,
        prompt=str(prompt)[:7000],
        negative_prompt=str(negative_prompt or DEFAULT_NEGATIVE)[:4000],
        height=480,
        width=832,
        num_frames=frames,
        guidance_scale=guidance_scale,
        guidance_scale_2=guidance_scale_2,
        num_inference_steps=steps,
        generator=generator,
        output_type="np",
    )

    video = result.frames[0]

    # The dedicated Space keeps the output simple and reliable.
    # Advanced RIFE/upscaling can be added later after the base generator is verified.
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        output_path = f.name

    export_to_video(video, output_path, fps=FPS, quality=int(quality))
    return output_path, str(seed), False

with gr.Blocks(title="Mira Wan 2.2") as demo:
    gr.Markdown("# Mira Wan 2.2\nDedicated image-to-video backend for Mira Studio.")
    with gr.Row():
        with gr.Column():
            input_image = gr.Image(type="pil", label="Reference image")
            last_image = gr.Image(type="pil", label="Optional last frame")
            prompt = gr.Textbox(label="Creative direction", lines=6)
            negative = gr.Textbox(value=DEFAULT_NEGATIVE, label="Negative prompt", lines=3)
        with gr.Column():
            steps = gr.Slider(4, 20, value=6, step=1, label="Steps")
            duration = gr.Slider(2, 4, value=3.5, step=0.5, label="Duration (seconds)")
            guidance = gr.Slider(1, 5, value=1, step=0.1, label="Guidance scale")
            guidance2 = gr.Slider(1, 5, value=1, step=0.1, label="Guidance scale 2")
            seed = gr.Number(value=0, precision=0, label="Seed")
            randomize = gr.Checkbox(value=True, label="Randomize seed")
            quality = gr.Slider(1, 10, value=6, step=1, label="Video quality")
            scheduler = gr.Dropdown(["UniPCMultistep"], value="UniPCMultistep", label="Scheduler")
            flow = gr.Slider(0, 10, value=3, step=0.1, label="Flow shift")
            multiplier = gr.Slider(16, 16, value=16, step=1, label="Frame multiplier")
            upscale = gr.Dropdown(["4x-UltraSharp"], value="4x-UltraSharp", label="Upscaler")
            upscale_factor = gr.Slider(1, 1, value=1, step=1, label="Upscale factor")
            safe = gr.Checkbox(value=True, label="Safe mode")
            safety = gr.Checkbox(value=True, label="Safety checker")
            video_component = gr.Checkbox(value=True, label="Return video")
            generate = gr.Button("Generate video", variant="primary")
    output = gr.Video(label="Generated video")
    used_seed = gr.Textbox(label="Used seed")
    blocked = gr.Checkbox(label="Safety blocked", visible=False)

    generate.click(
        generate_video,
        inputs=[
            input_image, last_image, prompt, steps, negative, duration,
            guidance, guidance2, seed, randomize, quality, scheduler,
            flow, multiplier, upscale, upscale_factor, safe, safety,
            video_component
        ],
        outputs=[output, used_seed, blocked],
    )

demo.queue(max_size=4).launch()
