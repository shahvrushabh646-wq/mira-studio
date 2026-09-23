import { fal } from "@fal-ai/client";

const MODEL="fal-ai/kling-video/v3/standard/image-to-video";

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!process.env.FAL_KEY) return res.status(500).json({error:"FAL_KEY is not configured. Check Vercel Environment Variables and redeploy."});
  try{
    const {imageData,brief,shots,duration,style,motion,intensity,negativePrompt,aspect}=req.body||{};
    if(!imageData||!shots?.length) return res.status(400).json({error:"Product image and director plan are required."});

    // fal.ai accepts a base64 data URI directly for file inputs.
    // This avoids a separate storage upload inside the Vercel function.
    if(!/^data:image\\/(jpeg|jpg|png|webp);base64,/i.test(imageData)){
      return res.status(400).json({error:"Invalid prepared image. Please upload a JPG, PNG or WebP product image."});
    }

    const total=shots.reduce((n,s)=>n+Number(s.duration||1),0);\n    const requestedDuration=Number(duration)||5;
    if(total!==requestedDuration) return res.status(400).json({error:`Shot durations (${total}s) do not match film duration (${requestedDuration}s). Please rebuild the director plan.`});\n    if(total<3||total>15) return res.status(400).json({error:"Total film duration must be between 3 and 15 seconds."});

    const input={
      start_image_url:imageData,
      multi_prompt:shots.slice(0,6).map(s=>({
        prompt:`Product commercial shot. ${s.action} Camera: ${s.camera}. ${brief||""} Preserve exact product identity, packaging, proportions, materials and visible text. Photorealistic, ${style||"premium commercial"} visual language, ${motion||"cinematic"} camera movement at ${Number(intensity||45)}% motion intensity, premium advertising cinematography, physically plausible motion, stable geometry, no invented logos, no watermark.`,
        duration:Number(s.duration||1)
      })),
      duration:String(Math.min(15,Math.max(3,requestedDuration))),
      aspect_ratio:aspect==="9:16"?"9:16":"16:9",
      shot_type:"customize",
      generate_audio:false,
      negative_prompt:negativePrompt||"warped product, deformed packaging, duplicate product, invented logo, fake text, watermark, distorted hands, melting, morphing, flicker, jitter, low quality"
    };

    const queued=await fal.queue.submit(MODEL,{input});
    return res.status(200).json({requestId:queued.request_id,model:MODEL});
  }catch(e){
    console.error("MIRA_GENERATE_ERROR",e);
    const message=e?.body?.detail||e?.body?.message||e?.message||"fal.ai request failed";
    return res.status(500).json({error:String(message)});
  }
}