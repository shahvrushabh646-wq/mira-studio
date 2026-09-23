import json,threading,uuid
from pathlib import Path
from fastapi import FastAPI,Depends,File,Form,HTTPException,UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import config
from auth import require_api_key
from gpu_manager import gpu_manager
from model_manager import model_manager
from queue_manager import queue_manager,public_job
from image_io import load_image,preprocess,save_jpeg,ImageValidationError
from storage import cleanup,video_path
from video_generator import process_job
from schemas import JOB_QUEUED

app=FastAPI(title="Mira Personal GPU API",version="3.0.0")
app.add_middleware(CORSMiddleware,allow_origins=config.FRONTEND_URLS,allow_credentials=True,allow_methods=["GET","POST","OPTIONS"],allow_headers=["*"])

def worker():
    while True:
        job=queue_manager.take(2)
        if not job:continue
        try:process_job(job)
        except Exception as e:queue_manager.update(job["job_id"],status="FAILED",message="Worker error.",error=str(e))
        finally:queue_manager.done(job["job_id"]);cleanup()

@app.on_event("startup")
def startup():
    gpu_manager.initialize();model_manager.warmup()
    for _ in range(config.MAX_CONCURRENT_JOBS):threading.Thread(target=worker,daemon=True).start()
    cleanup()

@app.get("/health")
def health():
    g=gpu_manager.status();m=model_manager.active();q=queue_manager.snapshot()
    return {"status":"ready" if g["available"] and m["loaded"] else "MODEL_NOT_READY","gpu":g["available"],"gpu_name":g["name"],"vram_gb":g["vram_gb"],"cuda":g["cuda"],"pytorch":g["pytorch"],"model":m["name"],"ready":bool(g["available"] and m["loaded"]),"detail":g,"model_info":m,"queue":q}

@app.get("/gpu")
def gpu():return {"gpu":gpu_manager.status(),"model":model_manager.active(),"queue":queue_manager.snapshot(),"personal":True,"private":config.PRIVATE_MODE}

@app.get("/models")
def models():return {"models":model_manager.list_models(),"active":model_manager.active()}

@app.post("/generate",dependencies=[Depends(require_api_key)])
async def generate(image:UploadFile=File(...),prompt:str=Form(""),negative_prompt:str=Form(""),duration:float=Form(4),width:int=Form(0),height:int=Form(0),fps:int=Form(16),steps:int=Form(0),seed:int=Form(0),motion_strength:float=Form(.45),start_frame:UploadFile|None=File(None),end_frame:UploadFile|None=File(None),shots:str=Form(""),director:str=Form(""),model:str=Form(""),guidance:float=Form(1.0)):
    try:im=load_image(await image.read(),image.filename or "reference.jpg")
    except ImageValidationError as e:raise HTTPException(400,str(e))
    if start_frame and start_frame.filename:
        try:im=load_image(await start_frame.read(),start_frame.filename)
        except Exception:pass
    im=preprocess(im,width or im.width,height or im.height);jid=uuid.uuid4().hex;path=config.INPUT_DIR/f"{jid}.jpg";save_jpeg(im,path)
    shot_list=[]
    if shots:
        try:shot_list=json.loads(shots)
        except Exception:shot_list=[]
    payload={"image_path":str(path),"prompt":prompt,"negative_prompt":negative_prompt,"duration":duration,"width":im.width,"height":im.height,"fps":fps,"steps":steps,"seed":seed,"motion_strength":motion_strength,"shots":shot_list,"director":director,"model_name":model or None,"guidance":guidance,"shot_total":len(shot_list) or 1}
    j=queue_manager.enqueue(payload);return {"job_id":j["job_id"],"status":JOB_QUEUED}

@app.get("/jobs/{job_id}")
def job(job_id):
    j=queue_manager.get(job_id)
    if not j:raise HTTPException(404,"Unknown job.")
    return public_job(j)

@app.post("/cancel/{job_id}",dependencies=[Depends(require_api_key)])
def cancel(job_id):
    try:return public_job(queue_manager.cancel(job_id))
    except KeyError:raise HTTPException(404,"Unknown job.")

@app.get("/videos/{filename}")
def video(filename):
    try:p=video_path(filename)
    except ValueError:raise HTTPException(400,"Invalid filename.")
    if not p.exists():raise HTTPException(404,"Video not found.")
    return FileResponse(p,media_type="video/mp4",filename=p.name)

@app.post("/cleanup",dependencies=[Depends(require_api_key)])
def clean():gpu_manager.clear_cache();return {"ok":True,**cleanup()}

@app.get("/")
def root():return {"name":"Mira Personal GPU API","gpu":gpu_manager.status(),"model":model_manager.active(),"queue":queue_manager.snapshot()}

if __name__=="__main__":
 import uvicorn;uvicorn.run(app,host=config.HOST,port=config.PORT)
