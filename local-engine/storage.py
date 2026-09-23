import time
from pathlib import Path
from config import OUTPUT_DIR,MAX_STORAGE_GB,VIDEO_RETENTION_HOURS
def video_path(name):
    safe=Path(name).name
    if not safe or safe!=name:raise ValueError("Invalid filename.")
    return OUTPUT_DIR/safe
def cleanup():
    now=time.time();max_age=VIDEO_RETENTION_HOURS*3600;removed=0
    for p in OUTPUT_DIR.glob("*"):
        if p.is_file() and now-p.stat().st_mtime>max_age:
            try:p.unlink();removed+=1
            except OSError:pass
    files=sorted([p for p in OUTPUT_DIR.glob("*") if p.is_file()],key=lambda x:x.stat().st_mtime)
    budget=MAX_STORAGE_GB*1024**3;used=sum(p.stat().st_size for p in files)
    while used>budget and files:
        p=files.pop(0);size=p.stat().st_size
        try:p.unlink();used-=size;removed+=1
        except OSError:break
    return {"removed":removed,"bytes_used":int(used)}
