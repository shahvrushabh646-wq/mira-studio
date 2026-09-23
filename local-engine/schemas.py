from typing import Optional,Any
from pydantic import BaseModel,Field
JOB_QUEUED="QUEUED"; JOB_LOADING_MODEL="LOADING_MODEL"; JOB_GENERATING="GENERATING"; JOB_POST_PROCESSING="POST_PROCESSING"; JOB_COMPLETE="COMPLETE"; JOB_FAILED="FAILED"; JOB_CANCELLED="CANCELLED"
class JobCreateResponse(BaseModel): job_id:str; status:str=JOB_QUEUED
class JobStatusResponse(BaseModel):
    job_id:str; status:str; stage:str; progress:Optional[float]=None; message:str=""; shot_index:int=0; shot_total:int=1; video_url:Optional[str]=None; error:Optional[str]=None; model:Optional[str]=None; created_at:Optional[str]=None; updated_at:Optional[str]=None; extra:dict[str,Any]=Field(default_factory=dict)
