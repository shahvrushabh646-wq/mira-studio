import { fal } from "@fal-ai/client";

const MODEL="fal-ai/wan-i2v";

export default async function handler(req,res){
 if(!process.env.FAL_KEY) return res.status(500).json({error:"FAL_KEY is not configured."});
 const {requestId}=req.query;
 if(!requestId) return res.status(400).json({error:"requestId is required"});
 try{
  const s=await fal.queue.status(MODEL,{requestId,logs:false});
  if(s.status==="COMPLETED"){
    const result=await fal.queue.result(MODEL,{requestId});
    return res.status(200).json({status:"COMPLETED",videoUrl:result.data?.video?.url});
  }
  return res.status(200).json({status:s.status});
 }catch(e){return res.status(500).json({error:e?.message||"Status check failed"});}
}