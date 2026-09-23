import { fal } from "@fal-ai/client";

const MODEL="fal-ai/kling-video/v3/standard/image-to-video";

export default async function handler(req,res){
 if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
 if(!process.env.FAL_KEY) return res.status(500).json({error:"FAL_KEY is not configured in Vercel. Add it under Project Settings → Environment Variables."});
 try{
  const {imageData,brief,shots,duration,style,motion,intensity,negativePrompt}=req.body||{};
  if(!imageData||!shots?.length) return res.status(400).json({error:"Product image and director plan are required."});
  const match=imageData.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if(!match) return res.status(400).json({error:"Invalid prepared image."});
  const mime=match[1],buf=Buffer.from(match[2],"base64");
  const file=new File([buf],"mira-reference.jpg",{type:mime});
  const imageUrl=await fal.storage.upload(file);
  const total=shots.reduce((n,s)=>n+Number(s.duration||1),0);
  const input={
    start_image_url:imageUrl,
    multi_prompt:shots.map(s=>({prompt:`Product commercial shot. ${s.action} Camera: ${s.camera}. ${brief||""} Preserve exact product identity, packaging, proportions, materials and visible text. Photorealistic, ${style||"premium commercial"} visual language, ${motion||"cinematic"} camera movement at ${Number(intensity||45)}% motion intensity, premium advertising cinematography, physically plausible motion, stable geometry, no invented logos, no watermark.`,duration:Number(s.duration||1)})),
    duration:Math.min(15,Math.max(3,total)),
    shot_type:"customize",
    generate_audio:false,
    negative_prompt:negativePrompt||"warped product, deformed packaging, duplicate product, invented logo, fake text, watermark, distorted hands, melting, morphing, flicker, jitter, low quality"
  };
  const queued=await fal.queue.submit(MODEL,{input});
  return res.status(200).json({requestId:queued.request_id,model:MODEL});
 }catch(e){return res.status(500).json({error:e?.message||"fal.ai request failed"});}
}