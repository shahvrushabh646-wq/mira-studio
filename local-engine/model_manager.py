import os, threading
from config import MODEL_ID,FALLBACK_MODEL_ID,PRELOAD_MODEL,WAN_DIR,WAN_CKPT_DIR
from gpu_manager import gpu_manager,GpuUnavailableError

REGISTRY={"Wan2.2":{"id":MODEL_ID,"kind":"i2v"},"Wan2.1":{"id":FALLBACK_MODEL_ID,"kind":"i2v"}}

class ModelManager:
    def __init__(self): self.lock=threading.RLock(); self.active_name="Wan2.2"; self.error=""
    def active(self):
        m=REGISTRY[self.active_name]; return {"name":self.active_name,"id":m["id"],"loaded":gpu_manager.model is not None,"ready":gpu_manager.model is not None,"kind":m["kind"],"notes":self.error}
    def list_models(self): return [{"name":k,"id":v["id"],"kind":v["kind"],"loaded":k==self.active_name and gpu_manager.model is not None,"ready":k==self.active_name and gpu_manager.model is not None} for k,v in REGISTRY.items()]
    def ensure_loaded(self,name=None):
        with self.lock:
            name=name or self.active_name
            if gpu_manager.model is not None and name==self.active_name:return gpu_manager.model
            if not gpu_manager.cuda_available(): raise GpuUnavailableError("CUDA unavailable — model not loaded.")
            t=gpu_manager.torch
            try:
                from diffusers import WanImageToVideoPipeline
                dtype=gpu_manager.choose_dtype()
                pipe=WanImageToVideoPipeline.from_pretrained(REGISTRY[name]["id"],torch_dtype=dtype)
                p=gpu_manager.status()["profile"]
                if p["vram_gb"] if "vram_gb" in p else False: pass
                try:
                    if p["steps"]<=8 and hasattr(pipe,"enable_model_cpu_offload"): pipe.enable_model_cpu_offload()
                    elif hasattr(pipe,"enable_model_cpu_offload") and gpu_manager.vram<18: pipe.enable_model_cpu_offload()
                    else: pipe.to("cuda")
                except Exception:
                    try: pipe.to("cuda")
                    except Exception: pass
                gpu_manager.load(pipe,REGISTRY[name]["id"]); self.active_name=name; self.error=""; return pipe
            except Exception as e:
                self.error=str(e)
                if name=="Wan2.2":
                    try:return self.ensure_loaded("Wan2.1")
                    except Exception:pass
                if WAN_DIR and os.path.exists(os.path.join(WAN_DIR,"generate.py")):
                    raise RuntimeError("Diffusers model unavailable; configure official Wan CLI path in WAN_DIR/WAN_CKPT_DIR.")
                raise
    def warmup(self):
        if PRELOAD_MODEL:
            try:self.ensure_loaded()
            except Exception as e:self.error=str(e)

model_manager=ModelManager()
