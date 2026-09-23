import shutil,subprocess,tempfile
from pathlib import Path
class StitchError(RuntimeError):pass
def ffmpeg_bin():return shutil.which("ffmpeg")
def validate_video(p):
    if not p.exists() or p.stat().st_size<64:raise StitchError("Generated video is missing or empty.")
    ff=ffmpeg_bin()
    if ff:
        r=subprocess.run([ff,"-v","error","-i",str(p),"-f","null","-"],capture_output=True,text=True)
        if r.returncode:raise StitchError("Generated video failed validation.")
def stitch(parts,out,fps=16,width=None,height=None):
    if not parts:raise StitchError("No segments.")
    if len(parts)==1:out.write_bytes(parts[0].read_bytes());return out
    ff=ffmpeg_bin()
    if not ff:raise StitchError("FFmpeg is required to stitch multiple segments.")
    with tempfile.TemporaryDirectory() as d:
        normalized=[]
        for i,p in enumerate(parts):
            n=Path(d)/f"{i}.mp4";vf="format=yuv420p"
            if width and height:vf=f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"+vf
            r=subprocess.run([ff,"-y","-i",str(p),"-vf",vf,"-r",str(fps),"-c:v","libx264","-pix_fmt","yuv420p","-an",str(n)],capture_output=True,text=True)
            if r.returncode:raise StitchError(r.stderr[-1500:])
            normalized.append(n)
        lst=Path(d)/"concat.txt";lst.write_text("".join(f"file '{x}'\n" for x in normalized))
        r=subprocess.run([ff,"-y","-f","concat","-safe","0","-i",str(lst),"-c","copy","-movflags","+faststart",str(out)],capture_output=True,text=True)
        if r.returncode:raise StitchError(r.stderr[-1500:])
        return out
