import React,{useEffect,useMemo,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Client,handle_file}from"@gradio/client";
import{Upload,Play,Download,RefreshCw,Film,Sparkles,Check,Loader2,Clapperboard,Settings2,AlertTriangle,ChevronDown,ChevronUp,Copy,SlidersHorizontal, WandSparkles}from"lucide-react";
import"./styles.css";

const cameraMoves=["locked hero push-in","slow lateral slide","macro texture drift","smooth overhead reveal","controlled 360 orbit","low-angle rise","diagonal tracking move","locked closing frame"];
const storyTemplates={
 classroom:[
  ["Establishing scene","Bring the whole classroom to life from the exact reference: students, teacher, desks, board and visible environment move naturally.","slow cinematic push-in"],
  ["Human action","Animate the people already present doing a believable classroom action appropriate to the visible scene.","gentle lateral tracking"],
  ["Teaching moment","Focus on the visible teacher/student interaction, board work, reading or demonstration without inventing unrelated content.","medium push-in"],
  ["Detail cut","Cut to a meaningful visible detail such as a hand writing, book, board, object or facial reaction.","macro detail drift"],
  ["Reaction / movement","Show a natural reaction or coordinated movement from the people already in the scene.","subtle handheld follow"],
  ["Closing scene","Return to the full classroom composition with natural ambient movement.","slow pull-back"]
 ],
 people:[
  ["Natural opener","Animate the exact people and setting from the reference with subtle realistic body, hair, clothing and environmental movement.","slow push-in"],
  ["Subject action","Give the main visible person a natural action that fits the scene, pose, clothing and surroundings.","gentle tracking"],
  ["Interaction","Animate a believable interaction between people or with an object already visible in the image.","medium lateral move"],
  ["Expression detail","Use a close detail on an existing face, hands, clothing or meaningful object with realistic motion.","close-up drift"],
  ["Scene movement","Let the surrounding people/environment move naturally while preserving identities and composition.","wide tracking"],
  ["Closing moment","Resolve on the original composition with subtle cinematic movement.","slow pull-back"]
 ],
 event:[
  ["Establishing moment","Bring the visible event/celebration/crowd to life using only people, objects and setting already supported by the image.","slow push-in"],
  ["Main action","Animate the central activity suggested by the image with natural coordinated movement.","dynamic tracking"],
  ["Human detail","Focus on a meaningful visible person, gesture, expression, clothing or object.","close-up drift"],
  ["Environmental motion","Animate flags, lights, fabric, smoke, water, vehicles or other elements only when visibly present.","lateral tracking"],
  ["Energy peak","Create the strongest believable moment in the scene while keeping identities and layout consistent.","controlled orbit"],
  ["Closing wide","Finish on the complete scene as a polished short-film ending.","slow pull-back"]
 ],
 nature:[
  ["Establishing landscape","Animate the exact landscape with realistic atmospheric movement and preserve the original composition.","slow cinematic push-in"],
  ["Main subject motion","Animate the visible animal, person, plant, water or natural subject with physically plausible movement.","gentle tracking"],
  ["Texture detail","Cut to a meaningful natural detail already visible: leaves, fur, water, rock, sky or terrain.","macro drift"],
  ["Environmental motion","Add realistic wind, water, clouds, foliage or light movement only where supported by the image.","wide lateral move"],
  ["Dynamic perspective","Give the scene a cinematic perspective change while preserving its visual identity.","controlled orbit"],
  ["Closing landscape","Return to the original composition with subtle atmospheric motion.","slow pull-back"]
 ],
 generic:[
  ["Scene opener","Animate the exact image as a living scene. Preserve every important person, object, environment, color and visible wording.","slow cinematic push-in"],
  ["Primary action","Identify the most obvious subject in the image and give it the most natural action that the scene logically supports.","gentle tracking"],
  ["Interaction","Animate believable interaction between subjects and objects that are already visible; do not introduce unrelated elements.","medium lateral move"],
  ["Meaningful detail","Cut to the most important visible detail and animate it naturally: face, hands, object, texture, text or environment.","close-up drift"],
  ["Scene progression","Create a second natural moment from the same scene using physically plausible movement and continuity.","controlled orbit"],
  ["Closing shot","Resolve on the original scene with cinematic ambient movement and stable identities.","slow pull-back"]
 ]
};

function detectCategory(text=""){
 const t=text.toLowerCase();
 if(/classroom|school|teacher|student|lecture|lesson|blackboard|whiteboard|college|professor|class/.test(t))return "classroom";
 if(/festival|crowd|ceremony|celebration|concert|stage|procession|wedding|event|parade|puja|temple/.test(t))return "event";
 if(/mountain|forest|beach|sea|river|lake|animal|bird|cat|dog|horse|tree|flower|nature|landscape|sunset|sky/.test(t))return "nature";
 if(/person|people|man|woman|boy|girl|portrait|face|group|family|friends/.test(t))return "people";
 return "generic";
}

function makeDirectorShots(analysis,brief,duration){
 const category=detectCategory((analysis||"")+" "+(brief||""));
 const template=storyTemplates[category]||storyTemplates.generic;
 const count=Math.min(6,Math.max(1,Math.floor(Number(duration)||5)));
 const base=Math.floor(duration/count),rem=duration%count;
 return template.slice(0,count).map((s,i)=>({name:s[0],action:s[1],camera:s[2],duration:base+(i<rem?1:0)}));
}

const baseShots=storyTemplates.generic.map(s=>({name:s[0],action:s[1],camera:s[2]}));

function selectedMotionText(style,motion,intensity){return `Professional cinematic scene, ${style}, ${motion} camera movement, motion intensity ${intensity}%, physically plausible movement, preserve exact identities, objects, environment, composition and visible text.`}

function App(){
 const[file,setFile]=useState(null),[preview,setPreview]=useState(""),[playableVideo,setPlayableVideo]=useState(""),[engine,setEngine]=useState("cloud"),[localEngineUrl,setLocalEngineUrl]=useState("http://127.0.0.1:7860"),[brief,setBrief]=useState("Create a premium cinematic scene based strictly on the uploaded image. Understand what is actually happening first, then animate only actions that logically belong to the visible people, objects, environment and setting. Preserve identities, proportions, composition and visible wording. Use realistic lighting, depth, physically plausible motion and clean editorial cuts. Do not invent unrelated content.");
 const[aspect,setAspect]=useState("9:16"),[duration,setDuration]=useState(3.5),[visualAnalysis,setVisualAnalysis]=useState(""),[plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[video,setVideo]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState(""),[settings,setSettings]=useState(true),[style,setStyle]=useState("Cinematic"),[motion,setMotion]=useState("Cinematic"),[intensity,setIntensity]=useState(45),[negative,setNegative]=useState("distorted face, identity drift, extra limbs, duplicated subjects, warped objects, invented text, morphing, flicker, jitter, deformed hands, watermark, low quality"),[expanded,setExpanded]=useState(0),[history,setHistory]=useState([]),[job,setJob]=useState(null),fileRef=useRef(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 useEffect(()=>{let cancelled=false,objectUrl="";if(!video){setPlayableVideo("");return()=>{}};setPlayableVideo("");fetch(video,{mode:"cors"}).then(r=>{if(!r.ok)throw new Error("Video download failed");return r.blob()}).then(blob=>{if(cancelled)return;objectUrl=URL.createObjectURL(blob);setPlayableVideo(objectUrl)}).catch(()=>{if(!cancelled)setPlayableVideo(video)});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[video]);
 const dims=aspect==="9:16"?{w:1080,h:1920}:{w:1920,h:1080};
 const shots=useMemo(()=>makeDirectorShots("",brief,duration),[brief,duration]);
 const onFile=e=>{const f=e.target.files?.[0];if(!f)return;setFile(f);setPreview(URL.createObjectURL(f));setPlan(null);setVideo("");setError("");setStatus("Image loaded — ready for scene director planning.")};
 const analyzeReference=async(blob)=>{
 const vision=await Client.connect("developer0hye/Qwen2.5-VL-7B-Instruct");
 const prompt=`Act as a visual scene director. Study this exact image carefully before generating anything. Identify the scene type, every important visible person, object, animal, vehicle, structure, text/sign, clothing, pose, spatial relationships, background, lighting, colors, camera angle and distinctive details. For people, describe their visible pose and what action the scene naturally suggests. For classroom/lecture images, identify teacher, students, board/books/desks and the teaching activity visible. For events, identify the central activity and crowd/environment. For nature, identify the main subject and environmental motion. Read clearly visible wording but never invent missing text. Separate visible facts from uncertainty.

Return a structured, detailed DIRECTOR REFERENCE SHEET for an image-to-video model. Include:
1. SCENE — exact scene type, location/setting, time/atmosphere and what is visibly happening.
2. SUBJECTS — every important person/animal/object, position in frame, pose, orientation, gaze, clothing/materials and distinguishing details.
3. ACTION — what each visible subject is doing now, the natural next movement, and what must remain still.
4. COMPOSITION — foreground/midground/background, framing, subject placement, negative space, perspective, depth and visual hierarchy.
5. CAMERA — current apparent camera angle, lens/perspective feel, shot size, camera height, and 2-4 camera movements that fit this exact image. State which movement should be used first and why.
6. LIGHTING — direction, softness, highlights, shadows, color temperature and realistic changes during motion.
7. ENVIRONMENTAL MOTION — only visible/supportable motion such as hair, clothing, leaves, water, smoke, lights, crowd movement, vehicles or classroom activity.
8. CINEMATIC BEATS — propose distinct beats/shots. For every beat specify SUBJECT ACTION + CAMERA ANGLE/MOVEMENT + FRAMING + approximate timing + transition/continuity.
9. PRESERVATION — identities, faces, body proportions, object shapes, logos, signs, readable text, colors, architecture and spatial relationships that must not change.
10. AVOID — movements, objects, people, text or events not supported by the image.

For every proposed action and camera choice, explain it from visible evidence. If something cannot be established, mark it as uncertain instead of inventing it. Do not turn every image into a product advertisement.`;
 const r=await vision.predict([handle_file(blob),prompt],"/qwen_vl_inference");
 return String(r?.data?.[0]||"").slice(0,7000);
};
const buildPlan=async()=>{
 if(!file)return;
 setBusy(true);setError("");
 try{
  setStatus("Director step 1/2 — studying the exact image, visible wording and scene…");
  const imageData=await makePreparedData();
  const blob=await (await fetch(imageData)).blob();
  let analysis="";
  try{analysis=await analyzeReference(blob);setVisualAnalysis(analysis)}
  catch(e){analysis="Reference image is the source of truth. Preserve the exact visible people, objects, environment, composition and clearly visible wording. Infer actions only from what the scene visibly supports."}
  const generated=makeDirectorShots(analysis,brief,duration);
  setPlan({concept:brief,category:detectCategory(analysis+" "+brief),reference:analysis,shots:generated});
  setStatus("Director step 2/2 — shot plan built from the actual reference. Review it before generation.");
 }catch(e){setError(e.message||"Director analysis failed");setStatus("")}
 finally{setBusy(false)}
};
 const makePreparedData=()=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const maxW=aspect==="9:16"?720:960,maxH=aspect==="9:16"?1280:540;const c=document.createElement("canvas");const scale=Math.min(maxW/img.width,maxH/img.height,1);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const x=c.getContext("2d");x.fillStyle="#101014";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);let q=.76,data=c.toDataURL("image/jpeg",q);while(data.length>3500000&&q>.45){q-=.05;data=c.toDataURL("image/jpeg",q)}resolve(data)};img.onerror=reject;img.src=preview});
 const checkLocalEngine=async()=>{const base=localEngineUrl.replace(/\/$/,"");const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3500);try{const r=await fetch(base+"/health",{method:"GET",signal:controller.signal,mode:"cors"});if(!r.ok)throw new Error("Local GPU engine returned HTTP "+r.status);const data=await r.json();if(!data?.ready)throw new Error("Wan 2.2 local engine is reachable, but the model/checkpoint is not ready.");return data}finally{clearTimeout(timer)}};
 const discoverWanBackends=async()=>{
  const fallback=[
    "r3gm/wan2-2-fp8da-aoti-preview",
    "r3gm/wan2-2-fp8da-aoti-preview2",
    "zerogpu-aoti/wan2-2-fp8da-aoti-faster",
    "observantdistressed/Wan2.2-14B-Fast-Preview",
    "Saravutw/WAN2.2_I2V_LIGHTNING-Video-4-8step"
  ];
  try{
    const res=await fetch("https://huggingface.co/api/spaces?search=Wan2.2%20image%20to%20video&limit=100&full=true");
    if(!res.ok)return fallback;
    const data=await res.json();
    const live=data.filter(x=>x?.runtime?.stage==="RUNNING"&&/wan2[. -]?2/i.test(x.id||"")).map(x=>x.id);
    return [...new Set([...live,...fallback])].slice(0,30);
  }catch{return fallback}
 };
 const chooseVideoEndpoint=api=>{
  const named=api?.named_endpoints||api?.namedEndpoints||{};
  const entries=Object.entries(named);
  const candidates=entries.filter(([name,ep])=>{
   const text=(name+" "+JSON.stringify(ep)).toLowerCase();
   return /generate.*video|image.*to.*video|i2v/.test(text);
  });
  return (candidates.find(([name,ep])=>/generate_video/i.test(name))||candidates[0]||entries.find(([name])=>/video/i.test(name))||null);
 };
 const buildGradioInputs=(endpoint,blob,prompt,negative,d)=>{
  const params=endpoint?.parameters||endpoint?.inputs||[];
  if(!Array.isArray(params)||!params.length)return null;
  const values=params.map(p=>{
   const label=String(p?.label||p?.parameter_name||p?.name||"").trim().toLowerCase();
   const type=String(p?.type||p?.component||"").toLowerCase();
   // Optional "Last Image" must be null; sending the reference image here changes the model's conditioning.
   if(/last image|optional.*image|end image|last frame/.test(label))return null;
   if(/input image|reference image|start image|image to animate|source image/.test(label))return handle_file(blob);
   if(/negative|neg.?prompt/.test(label))return negative;
   if(label==="prompt"||/^prompt\b/.test(label)||/caption|description/.test(label))return prompt;
   if(/duration|seconds|video length|length/.test(label))return Math.min(Number(d)||3.5,5);
   if(/frame|frames|num frames/.test(label))return Math.max(17,Math.min(81,Math.round((Number(d)||3.5)*16)+1));
   if(/step|steps|inference/.test(label))return 6;
   if(/seed/.test(label))return Math.floor(Math.random()*2147483647);
   if(/randomize/.test(label))return true;
   if(/guidance|cfg/.test(label))return 1;
   if(/fps|frame.?rate/.test(label))return 16;
   if(/height/.test(label))return aspect==="9:16"?1280:540;
   if(/width/.test(label))return aspect==="9:16"?720:960;
   if(/quality/.test(label))return 6;
   if(/scheduler/.test(label))return "UniPCMultistep";
   if(/flow shift/.test(label))return 3;
   if(/frame multiplier/.test(label))return 2;
   if(/upscale factor/.test(label))return 1;
   if(/safe mode|safety|enable.*checker|display result/.test(label))return true;
   if(p?.default!==undefined&&p?.default!==null)return p.default;
   if(/bool|checkbox|enable/.test(type))return false;
   if(/number|slider|float|int/.test(type))return 1;
   return null;
  });
  const required=params.filter(p=>p?.optional===false||p?.required===true);
  if(values.length!==params.length)return null;
  if(required.some((p,i)=>values[i]===null||values[i]===undefined))return null;
  return values;
 };
 const generateWithFreeSpace=async(space,blob,prompt,negative,d)=>{
  const client=await Client.connect(space);
  const api=await client.view_api();
  const selected=chooseVideoEndpoint(api);
  if(!selected)throw new Error("No compatible image-to-video endpoint exposed by this Space.");
  const [endpoint,definition]=selected;
  const args=buildGradioInputs(definition,blob,prompt,negative,d);
  if(!args)throw new Error("Space API schema could not be mapped safely.");
  const result=await client.predict(endpoint,args);
  return {result,space,endpoint};
 };
 const stitchVideos=async(urls)=>{
  if(urls.length===1)return urls[0];
  const videos=[];
  for(const url of urls){const response=await fetch(url,{mode:"cors"});if(!response.ok)throw new Error("Could not download one generated segment for stitching.");const mediaBlob=await response.blob();const objectUrl=URL.createObjectURL(mediaBlob);const v=document.createElement("video");v.muted=true;v.playsInline=true;v.src=objectUrl;await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error("Could not decode one generated segment for stitching."));});videos.push(v);}
  const canvas=document.createElement("canvas");canvas.width=aspect==="9:16"?720:960;canvas.height=aspect==="9:16"?1280:540;
  const stream=canvas.captureStream(24);const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9"});
  recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  const done=new Promise(res=>recorder.onstop=res);recorder.start();
  for(const v of videos){await new Promise(async(resolve,reject)=>{v.currentTime=0;v.onended=resolve;v.onerror=()=>reject(new Error("Segment playback failed."));try{await v.play();}catch(e){reject(e);return;}const draw=()=>{if(v.ended)return;const ctx=canvas.getContext("2d");ctx.drawImage(v,0,0,canvas.width,canvas.height);requestAnimationFrame(draw)};draw();});}
  recorder.stop();await done;const blob=new Blob(chunks,{type:"video/webm"});return URL.createObjectURL(blob);
};
const generate=async()=>{if(!file||!plan)return;setBusy(true);setError("");setVideo("");try{setStatus("Preparing reference image…");const imageData=await makePreparedData();const blob=await(await fetch(imageData)).blob();const shotDirection=(plan?.shots||[]).map((s,i)=>`SHOT ${i+1} — ${s.name} (${s.duration}s): ACTION: ${s.action} CAMERA: ${s.camera}`).join("\n");
const requestedDuration=Number(duration)||3.5;const segmentDuration=Math.min(requestedDuration,3.5);const segmentCount=Math.max(1,Math.ceil(requestedDuration/segmentDuration));const segmentUrls=[];const basePrompt=("FINAL DIRECTOR INSTRUCTION. The uploaded image is the absolute visual source of truth. Do not treat it as a generic reference. Reconstruct and animate the exact scene described by the visual director analysis. VISUAL DIRECTOR SHEET:\n"+(visualAnalysis||plan.reference||"Preserve the visible scene faithfully.")+"\nUSER CREATIVE PROMPT / BRIEF:\n"+brief+"\nDIRECTOR SHOT PLAN:\n"+shotDirection+"\nFor every beat, follow the described subject action, camera angle, camera height, framing, lens perspective, lighting, environment motion and timing. The user brief controls the creative intent, while the image and director sheet control what is physically present. If the user asks for an action that conflicts with the visible image, adapt it to the closest physically plausible version using the visible subjects and environment. Preserve identity, anatomy, object geometry, composition, readable text and spatial relationships. Maintain continuity between beats. Use natural acceleration/deceleration, realistic depth and physically plausible interaction. Never add unrelated people/objects, invent text, morph subjects, or turn the scene into a product advertisement unless the image and user brief explicitly support that. "+selectedMotionText(style,motion,intensity)+" NEGATIVE CONSTRAINTS: "+negative).slice(0,10000);const discovered=await discoverWanBackends();
for(let segment=0;segment<segmentCount;segment++){
 let result;let lastError="";
 const segmentPrompt=basePrompt+"\nSEGMENT "+(segment+1)+" OF "+segmentCount+". This is a continuation of the same film. Preserve the reference identity, setting, wardrobe, object geometry and lighting. Start naturally from the previous segment's ending state and make only the next planned beat move.";
 const localUrl=(typeof window!=="undefined"&&localStorage.getItem("miraCloudGpuUrl")||"").trim();
 if(localUrl){
  try{
   setStatus("Generating segment "+(segment+1)+" of "+segmentCount+" on your configured cloud GPU…");
   const form=new FormData();form.append("image",blob,"mira-reference.jpg");form.append("prompt",segmentPrompt);form.append("aspect",aspect);form.append("steps","12");form.append("duration",String(segmentDuration));
   const response=await fetch(localUrl.replace(/\/$/,"")+"/generate",{method:"POST",body:form});if(!response.ok)throw new Error("Configured GPU server returned HTTP "+response.status);
   const data=await response.json();
   if(data.video_url){segmentUrls.push(new URL(data.video_url,localUrl).href);continue;}
   if(!data.job_id)throw new Error("Configured GPU server returned no job id.");
   for(let attempt=0;attempt<180;attempt++){await new Promise(r=>setTimeout(r,2000));const sr=await fetch(localUrl.replace(/\/$/,"")+"/jobs/"+data.job_id);if(!sr.ok)throw new Error("Could not read cloud GPU job status.");const st=await sr.json();if(st.message)setStatus("Segment "+(segment+1)+"/"+segmentCount+" — "+st.message);if(st.status==="completed"&&st.video_url){segmentUrls.push(new URL(st.video_url,localUrl).href);break;}if(st.status==="failed")throw new Error(st.message||"Cloud GPU generation failed.");}
   if(segmentUrls.length===segment+1)continue;
   throw new Error("Cloud GPU generation timed out.");
  }catch(cloudError){lastError=String(cloudError?.message||cloudError||"");}
 }
 const shuffledProviders=[...discovered].sort(()=>Math.random()-.5);
for(let pi=0;pi<shuffledProviders.length;pi++){
  const space=shuffledProviders[pi];
  try{
   setStatus("Finding compatible free GPU backend: "+(pi+1)+"/"+shuffledProviders.length+" — "+space.split("/")[0]+"…");
   const response=await generateWithFreeSpace(space,blob,segmentPrompt,negative,segmentDuration);
   result=response.result;
   if(result)break;
  }catch(providerError){
   lastError=String(providerError?.message||providerError||"");
   if(pi===shuffledProviders.length-1)throw new Error("No currently available public Wan Space could accept this image-to-video job. Mira checked "+shuffledProviders.length+" live candidates. Last error: "+lastError);
  }
 }
 if(!result)throw new Error(lastError||"No GPU backend returned a segment.");
 const values=result?.data||result;let raw=Array.isArray(values)?values[0]:values;let found=raw?.video?.url||raw?.video?.path||raw?.url||raw?.path||raw?.data?.url||raw?.data?.path||"";
 if(!found&&Array.isArray(values)){for(const v of values){if(typeof v==="string"&&/^https?:\/\//.test(v)){found=v;break}if(v?.url){found=v.url;break}}}
 if(!found)throw new Error("Wan 2.2 returned no video for segment "+(segment+1)+".");
 segmentUrls.push(found);
}
setStatus("Assembling "+segmentUrls.length+" generated segment"+(segmentUrls.length===1?"":"s")+"…");
const finalVideo=await stitchVideos(segmentUrls);
setVideo(finalVideo);setJob({requestId:"mira-long-film-"+Date.now(),segments:segmentUrls.length});setStatus("AI film ready — "+requestedDuration+"s requested.");}catch(e){const message=String(e?.message||e||"Free Wan generation failed");setError(message);setStatus("");}finally{setBusy(false)}};return <div className="app"><header><div className="brand"><div className="logo">M</div><div><b>Mira Studio</b><span>AI Image-to-Scene Director</span></div></div><div className="provider"><span className="dot"/>Free Wan 2.2 • Live public GPU discovery • Reference Vision</div></header>
 <main><section className="hero"><p className="eyebrow">MIRA DIRECTOR <span>V2</span></p><h1>From a single image to a directed scene.</h1><p className="sub">A professional image-to-video workflow: visual understanding → shot direction → generation → review. Mira keeps the reference image as the source of truth instead of forcing every scene into a generic ad.</p></section>
 <section className="workflow"><div className="step active"><b>01</b><span>Reference</span></div><div className="line"/><div className="step"><b>02</b><span>Director</span></div><div className="line"/><div className="step"><b>03</b><span>Generate</span></div><div className="line"/><div className="step"><b>04</b><span>Review</span></div></section>
 <section className="grid">
 <div className="card"><div className="cardhead"><span>01</span><h2>Image & creative direction</h2><button className="iconbtn" onClick={()=>setSettings(!settings)}><Settings2 size={17}/></button></div>
 <button className="drop" onClick={()=>fileRef.current.click()}>{preview?<img src={preview}/>:<><Upload size={28}/><b>Upload any image</b><small>Class, lecture, people, event, product, nature — JPG, PNG or WebP</small></>}</button><input ref={fileRef} hidden type="file" accept="image/*" onChange={onFile}/>
 <div className="promptLabel"><label>Creative direction <span>Tell Mira exactly how you want the image to become a video</span></label><textarea className="creativePrompt" value={brief} onChange={e=>setBrief(e.target.value)} placeholder="Example: Make the teacher start writing on the board, students look toward the board, camera slowly moves from the back of the classroom toward the teacher, natural hand and head movement, realistic lighting, no new people or objects."/></div>{settings&&<div className="advancedSettings"><div className="settings"><label>Visual style<select value={style} onChange={e=>setStyle(e.target.value)}><option>Cinematic</option><option>Natural / realistic</option><option>Documentary</option><option>Dramatic</option><option>Premium commercial</option><option>Editorial</option></select></label><label>Motion language<select value={motion} onChange={e=>setMotion(e.target.value)}><option>Cinematic</option><option>Subtle</option><option>Dynamic</option><option>Subject follow</option><option>Orbit / tracking</option><option>Macro / detail</option></select></label></div><div className="settings"><label className="rangeLabel">Motion intensity <b>{intensity}%</b><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(+e.target.value)}/></label><label>Aspect ratio<select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option></select></label></div><div className="settings"><label>Film duration<select value={duration} onChange={e=>setDuration(+e.target.value)}><option value="3.5">3.5 sec</option><option value="7">7 sec • 2 segments</option><option value="15">15 sec • 5 segments</option><option value="30">30 sec • 10 segments</option><option value="60">60 sec • 20 segments</option></select></label><label>Output quality<select defaultValue="standard"><option>Standard • fast</option><option>High • slower</option></select></label></div><div className="engineControls"><label>Generation engine<select value={engine} onChange={e=>setEngine(e.target.value)}><option value="free">Free Public Wan 2.2 • No user token</option></select></label><label>Generation mode<input value="Free public GPU • automatic backend discovery" readOnly/></label></div><label className="negativeLabel">Negative prompt<input value={negative} onChange={e=>setNegative(e.target.value)}/></label></div>}
 <div className="framecheck"><Check size={15}/><span>Delivery frame: <b>{dims.w} × {dims.h}</b> • {aspect}</span></div>
 <button className="primary" disabled={!file||busy} onClick={buildPlan}><Sparkles size={18}/> {busy?"Studying reference…":plan?"Refresh director plan":"Study image & build director plan"}</button>
 </div>
 <div className="card"><div className="cardhead"><span>02</span><h2>Director shot plan</h2><span className="planmeta">{style} • {motion}</span></div>{plan?<div className="plan"><div className="planintro"><Clapperboard size={19}/><div><b>{plan.shots.length} shots • {duration}s total</b><p>Every shot is derived from the reference sheet and has a distinct action + camera language.</p></div></div>{plan.shots.map((s,i)=><div className={"shot "+(expanded===i?"open":"")} key={s.name}><div className="num">{String(i+1).padStart(2,"0")}</div><div className="shotbody"><button className="shottoggle" onClick={()=>setExpanded(expanded===i?-1:i)}><span><b>{s.name}</b><small>{s.duration}s • {s.camera}</small></span>{expanded===i?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{expanded===i&&<div className="shotedit"><label>Action<textarea value={s.action} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,action:e.target.value}:x)};setPlan(n)}}/></label><label>Camera<select value={s.camera} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,camera:e.target.value}:x)};setPlan(n)}}>{cameraMoves.map(m=><option key={m}>{m}</option>)}</select></label></div>} </div></div>)}<div className="timeline">{plan.shots.map((s,i)=><button key={i} className={expanded===i?"active":""} style={{flex:s.duration}} onClick={()=>setExpanded(i)}>{i+1}</button>)}</div><button className="secondary" onClick={buildPlan}><WandSparkles size={16}/> Rebuild director plan</button></div>:<div className="empty"><Film size={35}/><p>No shot plan yet.</p><small>Upload an image and let Mira study it before acting as the scene director.</small></div>}</div>
 <div className="card stage"><div className="cardhead"><span>03</span><h2>AI generation</h2><div className="modeltag">Wan 2.2 • Free public GPU</div></div><div className="preview">{video?<>{playableVideo?<video src={playableVideo} poster={preview} controls autoPlay loop muted playsInline preload="auto"/>:<div className="videoLoading">Loading generated video…</div>}<a className="videoOpen" href={video} target="_blank" rel="noreferrer">Open generated video</a></>:preview?<div className="sourcepreview"><img src={preview}/><span>Validated reference • {dims.w}×{dims.h}</span></div>:<div className="empty"><Film size={35}/><p>Final film preview</p><small>Your generated film appears here. If the embedded preview does not load, use Open generated video.</small></div>}</div>
 <div className="actions"><button className="primary" disabled={!file||!plan||busy} onClick={generate}>{busy?<><Loader2 className="spin" size={18}/> {status||"Generating…"}</>:<><Play size={18}/> Generate AI film</>}</button>{video&&<a className="secondary" href={video} target="_blank" rel="noreferrer" download="mira-ai-film"><Download size={16}/> Save video</a>}</div>
 <div className="status">{status&&<><span className="statusdot"/>{status}</>}{job&&<span className="request">Request {job.requestId.slice(0,8)}…</span>}</div><div className="generationNotes"><span><Check size={13}/> Reference locked</span><span><Check size={13}/> Director shot plan applied</span><span><Check size={13}/> Identity / text protection</span></div>{error&&<div className="error"><AlertTriangle size={16}/>{error}</div>}
 <p className="fineprint">Free generation searches live public Wan 2.2 Spaces and automatically skips incompatible, paused, or unavailable backends. Public GPU capacity is shared and can be unavailable; Mira never asks the user for an API token or payment.</p>
 </div></section></main></div>}
createRoot(document.getElementById("root")).render(<App/>);