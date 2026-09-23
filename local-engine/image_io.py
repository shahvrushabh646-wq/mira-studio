import io
from pathlib import Path
from PIL import Image,ImageOps
from config import MAX_UPLOAD_BYTES
class ImageValidationError(ValueError):pass
def load_image(data,filename=""):
    if len(data)>MAX_UPLOAD_BYTES:raise ImageValidationError("Image exceeds 25 MB.")
    try:
        im=Image.open(io.BytesIO(data));im.load();im=ImageOps.exif_transpose(im).convert("RGB")
    except Exception as e:raise ImageValidationError("Could not decode image.") from e
    if min(im.size)<64:raise ImageValidationError("Image is too small.")
    return im
def preprocess(im,w=None,h=None):
    if w and h:
        s=min(w/im.width,h/im.height,1)
    else:s=min(1,2048/max(im.size))
    if s<1:im=im.resize((max(16,int(im.width*s)//16*16),max(16,int(im.height*s)//16*16)),Image.Resampling.LANCZOS)
    return im
def save_jpeg(im,path):im.convert("RGB").save(path,"JPEG",quality=90,optimize=True)
