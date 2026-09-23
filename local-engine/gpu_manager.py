import math, subprocess, threading

class GpuUnavailableError(RuntimeError): pass
class GpuOOMError(RuntimeError): pass

def _torch():
    try:
        import torch
        return torch
    except Exception:
        return None

def _smi():
    try:
        out=subprocess.check_output(["nvidia-smi","--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu","--format=csv,noheader,nounits"],stderr=subprocess.DEVNULL,timeout=3).decode().strip()
        p=[x.strip() for x in out.splitlines()[0].split(",")]
        return {"name":p[0],"total":float(p[1])/1024,"used":float(p[2])/1024,"utilization":float(p[3]),"temperature":float(p[4])}
    except Exception: return {}

def profile(vram):
    if vram<10:return {"max_pixels":480*832,"max_frames":33,"steps":6,"dtype":"fp16"}
    if vram<18:return {"max_pixels":480*832,"max_frames":49,"steps":8,"dtype":"fp16"}
    if vram<30:return {"max_pixels":720*1280,"max_frames":81,"steps":20,"dtype":"bf16"}
    if vram<60:return {"max_pixels":1080*1920,"max_frames":81,"steps":30,"dtype":"bf16"}
    return {"max_pixels":1080*1920,"max_frames":121,"steps":40,"dtype":"bf16"}

class GPUManager:
    def __init__(self):
        self.lock=threading.RLock(); self.torch=None; self.ready=False; self.cuda=False; self.name=""; self.vram=0.; self.model=None; self.model_id=""
    def initialize(self):
        with self.lock:
            self.torch=_torch(); smi=_smi()
            if not self.torch:
                self.name=smi.get("name",""); self.vram=smi.get("total",0); self.ready=True; return self.status()
            try:self.cuda=bool(self.torch.cuda.is_available())
            except Exception:self.cuda=False
            self.ready=True
            if self.cuda:
                self.name=self.torch.cuda.get_device_name(0)
                self.vram=round(self.torch.cuda.get_device_properties(0).total_memory/1024**3,2)
            else:
                self.name=smi.get("name",""); self.vram=smi.get("total",0)
            return self.status()
    def status(self):
        if not self.ready:self.initialize()
        smi=_smi(); used=0.
        if self.cuda and self.torch:
            try: used=max(self.torch.cuda.memory_reserved(0),self.torch.cuda.memory_allocated(0))/1024**3
            except Exception: used=smi.get("used",0)
        else: used=smi.get("used",0)
        return {"available":self.cuda,"name":self.name,"vram_gb":self.vram,"vram_used_gb":round(used,2),"vram_free_gb":round(max(self.vram-used,0),2),"cuda":str(getattr(getattr(self.torch,"version",None),"cuda","") or "") if self.torch else "","pytorch":str(getattr(self.torch,"__version__","")) if self.torch else "","temperature_c":smi.get("temperature"),"utilization_pct":smi.get("utilization"),"device":"cuda" if self.cuda else "cpu","profile":profile(self.vram)}
    def cuda_available(self):
        if not self.ready:self.initialize()
        return bool(self.cuda)
    def clear_cache(self):
        if self.torch:
            try:
                import gc; gc.collect(); self.torch.cuda.empty_cache(); self.torch.cuda.ipc_collect()
            except Exception: pass
    def choose_dtype(self):
        t=self.torch
        if t and self.vram>=18:
            try:
                if t.cuda.is_bf16_supported(): return t.bfloat16
            except Exception: pass
        return t.float16 if t else None
    def fit_resolution(self,w,h):
        p=profile(self.vram); pixels=max(256,w*h)
        if pixels<=p["max_pixels"]: return max(16,w//16*16),max(16,h//16*16)
        s=math.sqrt(p["max_pixels"]/pixels); return max(16,int(w*s)//16*16),max(16,int(h*s)//16*16)
    def fit_frames(self,n):
        m=profile(self.vram)["max_frames"]; n=max(9,min(int(n),m)); return n if n%4 else n+1
    def load(self,model,model_id):
        self.model=model; self.model_id=model_id
    def generate(self,image,prompt,negative,width,height,frames,steps,seed,guidance=1,last_image=None):
        if not self.cuda_available(): raise GpuUnavailableError("No CUDA GPU detected.")
        if self.model is None: raise GpuUnavailableError("Wan model is not loaded.")
        t=self.torch; width,height=self.fit_resolution(width,height); frames=self.fit_frames(frames)
        kwargs={"image":image,"prompt":prompt[:7000],"negative_prompt":negative[:4000],"width":width,"height":height,"num_frames":frames,"num_inference_steps":max(4,min(int(steps),50)),"guidance_scale":float(guidance or 1),"generator":t.Generator(device="cuda").manual_seed(int(seed)&0x7fffffff),"output_type":"np"}
        if last_image is not None: kwargs["last_image"]=last_image
        try:
            result=self.model(**kwargs)
            return result.frames[0] if hasattr(result,"frames") else result
        except TypeError:
            kwargs.pop("last_image",None); result=self.model(**kwargs); return result.frames[0] if hasattr(result,"frames") else result
        except RuntimeError as e:
            if "out of memory" in str(e).lower() or "cuda oom" in str(e).lower():
                self.clear_cache(); raise GpuOOMError(str(e))
            raise

gpu_manager=GPUManager()
