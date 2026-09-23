from fastapi import Header,HTTPException,Request
from config import API_KEY,PRIVATE_MODE
def require_api_key(request:Request,x_api_key:str|None=Header(default=None)):
    if not PRIVATE_MODE:return
    key=(x_api_key or "").strip() or request.headers.get("authorization","").removeprefix("Bearer ").strip()
    if not API_KEY:raise HTTPException(503,"MIRA_GPU_API_KEY is not configured.")
    if key!=API_KEY:raise HTTPException(401,"Invalid or missing API key.")
