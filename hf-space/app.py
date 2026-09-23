import os,random,tempfile
import gradio as gr
import spaces,torch
from diffusers import WanImageToVideoPipeline
from diffusers.utils import export_to_video

MODEL_ID=os.getenv("REPO_ID","Wan-AI/Wan2.2-I2V-A14B-Diffusers")
pipe=WanImageToVideoPipeline.from_pretrained(MODEL_ID,torch_dtype=torch.bfloat16)
pipe.to("cuda")
NEG="morphing, face distortion, identity drift, extra limbs, duplicated subjects, warped objects, invented text, flicker, jitter, deformed hands"

@spaces.GPU(duration=60)
def generate(input_image,last_image,prompt,negative,steps,duration,seed,randomize):
    if input_image is None:raise gr.Error("Upload an image first.")
    if randomize:seed=random.randint(0,2147483647)
    frames=max(49,min(81,int(float(duration)*16)+1))
    result=pipe(image=input_image,last_image=last_image,prompt=str(prompt)[:7000],negative_prompt=str(negative or NEG)[:4000],num_frames=frames,num_inference_steps=max(4,min(int(steps),20)),generator=torch.Generator(device="cuda").manual_seed(int(seed)),output_type="np")
    out=tempfile.NamedTemporaryFile(suffix=".mp4",delete=False).name
    export_to_video(result.frames[0],out,fps=16)
    return out,str(seed)

with gr.Blocks(title="Mira Personal Wan 2.2") as demo:
    gr.Markdown("# Mira Personal Wan 2.2\nPersonal I2V backend for Mira Studio. Free ZeroGPU hosting remains quota-limited.")
    image=gr.Image(type="pil",label="Reference image"); last=gr.Image(type="pil",label="Optional last frame")
    prompt=gr.Textbox(label="Director prompt",lines=6); negative=gr.Textbox(value=NEG,label="Negative prompt",lines=3)
    steps=gr.Slider(4,20,6,step=1,label="Steps"); duration=gr.Slider(2,4,3.5,step=.5,label="Duration")
    seed=gr.Number(value=0,precision=0,label="Seed"); randomize=gr.Checkbox(True,label="Randomize seed")
    out=gr.Video(); used=gr.Textbox(label="Used seed")
    gr.Button("Generate",variant="primary").click(generate,[image,last,prompt,negative,steps,duration,seed,randomize],[out,used])
demo.queue(max_size=4).launch()
