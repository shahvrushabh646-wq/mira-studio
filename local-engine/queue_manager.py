import json,threading,time,uuid
from datetime import datetime,timezone
from config import JOBS_DIR,MAX_CONCURRENT_JOBS
from schemas import JOB_QUEUED,JOB_COMPLETE,JOB_FAILED,JOB_CANCELLED
TERMINAL={JOB_COMPLETE,JOB_FAILED,JOB_CANCELLED}
def now(): return datetime.now(timezone.utc).isoformat()
class QueueManager:
    def __init__(self):
        self.lock=threading.RLock(); self.cv=threading.Condition(self.lock); self.jobs={}; self.pending=[]; self.running=set(); self.load()
    def path(self,j): return JOBS_DIR/f"{j}.json"
    def persist(self,j): self.path(j["job_id"]).write_text(json.dumps(j,indent=2),encoding="utf8")
    def load(self):
        for p in JOBS_DIR.glob("*.json"):
            try:j=json.loads(p.read_text(encoding="utf8"))
            except Exception:continue
            if j.get("status") not in TERMINAL:j["status"]=JOB_QUEUED;j["stage"]=JOB_QUEUED;j["message"]="Recovered after restart."
            self.jobs[j["job_id"]]=j
            if j["status"]==JOB_QUEUED:self.pending.append(j["job_id"])
    def enqueue(self,payload):
        j={"job_id":uuid.uuid4().hex,"status":JOB_QUEUED,"stage":JOB_QUEUED,"progress":None,"message":"Queued on personal GPU.","shot_index":0,"shot_total":max(1,int(payload.get("shot_total") or 1)),"video_url":None,"error":None,"model":"Wan2.2","created_at":now(),"updated_at":now(),"payload":payload,"cancel_requested":False}
        with self.cv:self.jobs[j["job_id"]]=j;self.pending.append(j["job_id"]);self.persist(j);self.cv.notify()
        return j
    def get(self,j): 
        with self.lock:return dict(self.jobs[j]) if j in self.jobs else None
    def update(self,j,**f):
        with self.lock:self.jobs[j].update(f);self.jobs[j]["updated_at"]=now();self.jobs[j]["stage"]=f.get("stage",f.get("status",self.jobs[j]["stage"]));self.persist(self.jobs[j]);return dict(self.jobs[j])
    def cancel(self,j):
        with self.lock:
            if j not in self.jobs:raise KeyError(j)
            x=self.jobs[j];x["cancel_requested"]=True
            if x["status"]==JOB_QUEUED:
                if j in self.pending:self.pending.remove(j)
                x["status"]=JOB_CANCELLED;x["stage"]=JOB_CANCELLED;x["message"]="Cancelled."
            self.persist(x);return dict(x)
    def is_cancelled(self,j): return bool(self.jobs.get(j,{}).get("cancel_requested"))
    def take(self,timeout=1):
        end=time.time()+timeout
        with self.cv:
            while time.time()<end:
                if len(self.running)<MAX_CONCURRENT_JOBS and self.pending:
                    j=self.pending.pop(0);x=self.jobs.get(j)
                    if not x or x.get("cancel_requested"):continue
                    self.running.add(j);return dict(x)
                self.cv.wait(0.5)
        return None
    def done(self,j):
        with self.cv:self.running.discard(j);self.cv.notify_all()
    def snapshot(self):
        with self.lock:return {"pending":len(self.pending),"running":len(self.running),"max_concurrent":MAX_CONCURRENT_JOBS}
queue_manager=QueueManager()
def public_job(j): return {k:j.get(k) for k in ("job_id","status","stage","progress","message","shot_index","shot_total","video_url","error","model","created_at","updated_at")}
