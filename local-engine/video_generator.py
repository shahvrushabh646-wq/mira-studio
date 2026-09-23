import json,time,tempfile,subprocess,sys
from pathlib import Path
from PIL import Image
from config import OUTPUT_DIR,FRAMES_DIR,DEFAULT_NEGATIVE,GPU_WAIT_TIMEOUT_SECONDS,WAN_DIR,WAN_CKPT_DIR
from director import shot_prompt,negative_for
from gpu_manager import gpu_manager,GpuOOMError,GpuUnavailableError
from model_manager import model_manager
from queue_manager import queue_manager
from schemas import *
from image_io import preprocess
from stitcher import stitch,validate_video,StitchError

def export_video(frames,dest,fps):
    try:
        from diffusers.utils import export_to_video
        export_to_video(frames,str(dest),fps=fps);return
    except Exception:
        import imageio.v2 as imageio
        imageio.mimsave(str(dest),frames,fps=fps)

def last_frame(video,dest):
    ff="ffmpeg"
    try:
        r=subprocess.run([ff,"-y","-sseof","-0.1","-i",str(video),"-frames:v","1",str(dest)],capture_output=True)
        return dest if r.returncode==0 and dest.exists() else None
    except Exception:return None

def process_job(job):
    jid=job["job_id"];p=job["payload"]
    if not gpu_manager.cuda_available():
        if GPU_WAIT_TIMEOUT_SECONDS and GPU_WAIT_TIMEOUT_SECONDS>0:queue_manager.update(jid,status=JOB_FAILED,message="Personal GPU offline.",error="CUDA unavailable.");return
        queue_manager.update(jid,status=JOB_QUEUED,message="Waiting for personal CUDA GPU.");queue_manager.done(jid);time.sleep(5);return
    try:model_manager.ensure_loaded(p.get("model_name"))
    except GpuUnavailableError as e:queue_manager.update(jid,status=JOB_QUEUED,message=str(e));return
    except Exception as e:queue_manager.update(jid,status=JOB_FAILED,message="Model failed to load.",error=str(e));return
    image=Image.open(p["image_path"]).convert("RGB"); director=p.get("director") or {}; director=json.loads(director) if isinstance(director,str) and director else director
    shots=p.get("shots") or [{"name":"Primary action","duration":p.get("duration",4),"action":p.get("prompt",""),"camera":"slow cinematic push-in"}]
    fps=max(8,int(p.get("fps",16))); width=int(p.get("width") or image.width);height=int(p.get("height") or image.height);steps=int(p.get("steps") or gpu_manager.status()["profile"]["steps"]);seed=int(p.get("seed") or 0)
    current=preprocess(image,width,height);segments=[]
    for i,shot in enumerate(shots,1):
        if queue_manager.is_cancelled(jid):queue_manager.update(jid,status=JOB_CANCELLED,message="Cancelled.");return
        queue_manager.update(jid,status=JOB_GENERATING,shot_index=i,shot_total=len(shots),message=f"Generating shot {i} of {len(shots)}",model=model_manager.active()["name"])
        prompt=shot_prompt(shot,director,p.get("prompt",""),i,len(shots));negative=negative_for(shot,p.get("negative_prompt",DEFAULT_NEGATIVE));duration=float(shot.get("duration",p.get("duration",4)));frames=gpu_manager.fit_frames(int(duration*fps)+1);dest=OUTPUT_DIR/f"{jid}_shot{i:02d}.mp4"
        try:
            frames_out=gpu_manager.generate(image=current,prompt=prompt,negative=negative,width=width,height=height,frames=frames,steps=steps,seed=seed+i,guidance=p.get("guidance",1.0))
            export_video(frames_out,dest,fps);validate_video(dest);segments.append(dest)
            fp=FRAMES_DIR/f"{jid}_{i:02d}.jpg"
            if last_frame(dest,fp):current=preprocess(Image.open(fp).convert("RGB"),width,height)
        except GpuOOMError as e:gpu_manager.clear_cache();queue_manager.update(jid,status=JOB_FAILED,message="GPU ran out of memory.",error=str(e));return
        except Exception as e:gpu_manager.clear_cache();queue_manager.update(jid,status=JOB_FAILED,message=f"Shot {i} failed.",error=str(e));return
    queue_manager.update(jid,status=JOB_POST_PROCESSING,message="Stitching generated shots.")
    final=OUTPUT_DIR/f"{jid}.mp4"
    try:stitch(segments,final,fps,width,height);validate_video(final)
    except Exception as e:queue_manager.update(jid,status=JOB_FAILED,message="Stitch failed.",error=str(e));return
    queue_manager.update(jid,status=JOB_COMPLETE,message="Video ready.",video_url=f"/videos/{final.name}",shot_index=len(shots))
    gpu_manager.clear_cache()
