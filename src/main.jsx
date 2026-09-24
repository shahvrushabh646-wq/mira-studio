import React,{useEffect,useMemo,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Client,handle_file}from"@gradio/client";
import{Upload,Play,Download ,Film,Sparkles,Check,Loader2,Clapperboard,Settings2,AlertTriangle,ChevronDown,ChevronUp, WandSparkles}from"lucide-react";
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

function parseDirectorShots(analysis,brief,duration){
 const requestedDuration=Number(duration)||4;
 const segmentDuration=requestedDuration<=60?(49/12):(49/8);
 const count=Math.max(1,Math.min(60,Math.ceil(requestedDuration/segmentDuration)));
const base=requestedDuration/count;
 const fallback=storyTemplates[detectCategory((analysis||"")+" "+(brief||""))]||storyTemplates.generic;
 let parsed=[];
 try{
  const fenced=String(analysis||"").match(/\{[\s\S]*\}/)?.[0];
  if(fenced){
   const obj=JSON.parse(fenced);
   if(Array.isArray(obj))parsed=obj;
   else if(Array.isArray(obj.shots))parsed=obj.shots;
   else if(Array.isArray(obj.cinematic_beats))parsed=obj.cinematic_beats;
  }
 }catch{}
 const cleaned=parsed.map((s,i)=>({
  name:String(s.name||s.title||s.beat||("Shot "+(i+1))).trim(),
  action:String(s.action||s.subject_action||s.motion||"Natural movement supported by the reference image.").trim(),
  camera:String(s.camera||s.camera_movement||s.movement||"slow cinematic push-in").trim()
 })).filter(s=>s.name&&s.action&&s.camera);
 const source=cleaned.length?cleaned:fallback.map(s=>({name:s[0],action:s[1],camera:s[2]}));
 return Array.from({length:count},(_,i)=>{
  const s=source[i%source.length];
  const cycle=Math.floor(i/source.length);
  return {...s,name:cycle?s.name+" "+(cycle+1):s.name,duration:Math.round(base*100)/100};
 });
}

const baseShots=storyTemplates.generic.map(s=>({name:s[0],action:s[1],camera:s[2]}));

function selectedMotionText(style,motion,intensity){return `Professional cinematic scene, ${style}, ${motion} camera movement, motion intensity ${intensity}%, physically plausible movement, preserve exact identities, objects, environment, composition and visible text.`}

function renderBrowserMotion({imageUrl,aspect,duration,motion,intensity,onProgress}){
 return new Promise((resolve,reject)=>{
  const image=new Image();image.onerror=()=>reject(new Error("The selected image could not be opened for local rendering."));
  image.onload=()=>{
   const canvas=document.createElement("canvas");canvas.width=aspect==="9:16"?720:1280;canvas.height=aspect==="9:16"?1280:720;
   const ctx=canvas.getContext("2d");if(!ctx){reject(new Error("This browser cannot create a video canvas."));return}
   const stream=canvas.captureStream(24);const mimeType=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mimeType){stream.getTracks().forEach(t=>t.stop());reject(new Error("This browser does not support local WebM video export. Try Chrome or Edge."));return}
   let recorder;try{recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8000000})}catch(e){stream.getTracks().forEach(t=>t.stop());reject(e);return}
   const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
   recorder.onerror=()=>{stream.getTracks().forEach(t=>t.stop());reject(new Error("The browser stopped the local video recording."))};
   recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(!chunks.length){reject(new Error("No video frames were recorded. Please try again."));return}resolve(new Blob(chunks,{type:mimeType}))};
   const seconds=Math.min(15,Math.max(4,Number(duration)||7)),coverScale=Math.max(canvas.width/image.width,canvas.height/image.height);
   const draw=elapsed=>{
    const progress=Math.min(1,elapsed/seconds),shotCount=duration<=4?1:duration<=7?2:4;
    const shot=Math.min(shotCount-1,Math.floor(progress*shotCount)),within=progress*shotCount-shot,ease=within*within*(3-2*within);
    const strength=.045+.11*(Number(intensity)||45)/100,baseZoom=1+strength*(shot%2===0?ease:1-ease),sway=motion==="Subtle"?.35:motion==="Dynamic"?1.2:.7;
    const offsets=[[-.12,0],[.12,-.08],[0,.11],[-.06,-.1]],[ox,oy]=offsets[shot%offsets.length];
    const panX=ox*sway*(.35+ease*.65),panY=oy*sway*(.35+ease*.65),scale=coverScale*baseZoom,drawW=image.width*scale,drawH=image.height*scale;
    const x=(canvas.width-drawW)/2+panX*canvas.width,y=(canvas.height-drawH)/2+panY*canvas.height;
    ctx.fillStyle="#08090c";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,x,y,drawW,drawH);
    const shade=ctx.createLinearGradient(0,0,0,canvas.height);shade.addColorStop(0,"rgba(0,0,0,.16)");shade.addColorStop(.55,"rgba(0,0,0,0)");shade.addColorStop(1,"rgba(0,0,0,.27)");ctx.fillStyle=shade;ctx.fillRect(0,0,canvas.width,canvas.height);
    onProgress?.(progress);if(progress>=1){recorder.stop();return}requestAnimationFrame(now=>draw((now-start)/1000));
   };
   let start=0;recorder.start(250);requestAnimationFrame(now=>{start=now;draw(0)});
  };image.src=imageUrl;
 });
}

function App(){
 const[quality,setQuality]=useState("draft");
 const[sceneMode,setSceneMode]=useState("lecture");
 const[gpuConnection,setGpuConnection]=useState("");
 const[checkingGpu,setCheckingGpu]=useState(false);
 const[file,setFile]=useState(null),[preview,setPreview]=useState(""),[playableVideo,setPlayableVideo]=useState(""),[localEngineUrl,setLocalEngineUrl]=useState(()=>["localhost","127.0.0.1"].includes(window.location.hostname)?"http://127.0.0.1:8000":""),[gpuApiKey,setGpuApiKey]=useState(""),[brief,setBrief]=useState("Create a professional, realistic classroom lesson video from this educational image. Use the visible instructor as the teacher. Show a real lesson in progress: the teacher explaining and writing one short formula or diagram on the board, students watching and taking notes, then a natural student response. Use short, clear lesson beats and natural human movement. Do not make a poster or slideshow.");
 const[engine,setEngine]=useState("freeai"),[aspect,setAspect]=useState("9:16"),[duration,setDuration]=useState(4),[visualAnalysis,setVisualAnalysis]=useState(""),[plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[video,setVideo]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState(""),[settings,setSettings]=useState(true),[style,setStyle]=useState("Natural / realistic"),[motion,setMotion]=useState("Subtle"),[intensity,setIntensity]=useState(55),[negative,setNegative]=useState("distorted face, identity drift, extra limbs, duplicated subjects, warped objects, invented text, morphing, flicker, jitter, deformed hands, watermark, low quality"),[expanded,setExpanded]=useState(0),[history,setHistory]=useState([]),[job,setJob]=useState(null),fileRef=useRef(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 useEffect(()=>{try{const u=localStorage.getItem("miraCloudGpuUrl");const k=localStorage.getItem("miraGpuApiKey");const hosted=! ["localhost","127.0.0.1"].includes(window.location.hostname);const loopback=u&&/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(u);if(u&&!(hosted&&loopback))setLocalEngineUrl(u);if(k)setGpuApiKey(k)}catch{}},[]);
 useEffect(()=>{try{if(localEngineUrl)localStorage.setItem("miraCloudGpuUrl",localEngineUrl);if(gpuApiKey)localStorage.setItem("miraGpuApiKey",gpuApiKey)}catch{}},[localEngineUrl,gpuApiKey]);
 useEffect(()=>{let cancelled=false,objectUrl="";if(!video){setPlayableVideo("");return()=>{}};setPlayableVideo("");fetch(video,{mode:"cors"}).then(r=>{if(!r.ok)throw new Error("Video download failed");return r.blob()}).then(blob=>{if(cancelled)return;objectUrl=URL.createObjectURL(blob);setPlayableVideo(objectUrl)}).catch(()=>{if(!cancelled)setPlayableVideo(video)});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[video]);
 const dims=engine==="browser"?(aspect==="9:16"?{w:720,h:1280}:{w:1280,h:720}):engine==="freeai"?(aspect==="9:16"?{w:480,h:832}:{w:832,h:480}):(aspect==="9:16"?{w:1080,h:1920}:{w:1920,h:1080});
 const shots=useMemo(()=>parseDirectorShots(visualAnalysis,brief,duration),[visualAnalysis,brief,duration]);
 const onFile=e=>{const f=e.target.files?.[0];if(!f)return;setFile(f);setPreview(URL.createObjectURL(f));setPlan(null);setVideo("");setError("");setStatus("Image loaded — ready for scene director planning.")};
 const analyzeReference=async(blob)=>{
 const vision=await Client.connect("developer0hye/Qwen2.5-VL-7B-Instruct");
 const prompt=`Act as a visual scene director. Study this exact image carefully before generating anything. Identify the scene type, every important visible person, object, animal, vehicle, structure, text/sign, clothing, pose, spatial relationships, background, lighting, colors, camera angle and distinctive details. For people, describe their visible pose and what action the scene naturally suggests. For classroom/lecture images, identify teacher, students, board/books/desks and the teaching activity visible. For events, identify the central activity and crowd/environment. For nature, identify the main subject and environmental motion. Read clearly visible wording but never invent missing text. Separate visible facts from uncertainty.

Return ONLY valid JSON for an image-to-video director. No markdown, no commentary, no code fences. Use this exact top-level shape: {"scene":"...","subjects":[{"description":"...","position":"...","pose":"...","visible_action":"..."}],"composition":"...","camera":"...","lighting":"...","environmental_motion":["..."],"preservation":["..."],"avoid":["..."],"shots":[{"name":"...","action":"...","camera":"...","framing":"...","timing":"...","transition":"..."}]}. Create 1 shot for 3.5s, 2 for 7s, 5 for 15s, 10 for 30s, and up to 20 for 60s. Make each shot materially different and grounded in visible evidence. Then fill these fields inside the JSON:
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

For every proposed action and camera choice, ground it in visible evidence. If something cannot be established, mark it uncertain instead of inventing it. Do not turn every image into a product advertisement.`;
 const r=await vision.predict([handle_file(blob),prompt],"/qwen_vl_inference");
 return String(r?.data?.[0]||"").slice(0,7000);
};
const buildPlan=async()=>{
 if(!file)return;
 setBusy(true);setError("");
 try{
  if(engine==="browser"){
   setStatus("Building a local camera-motion plan — your image stays on this page…");
   const localNote="Local browser mode: camera movement on the still image only; subjects are not AI-animated.";
   setVisualAnalysis(localNote);const generated=parseDirectorShots(localNote,brief,duration).map(s=>({...s,action:"Keep the uploaded image unchanged; apply a smooth "+s.camera+" camera move only."}));
   setPlan({concept:brief,category:detectCategory(brief),reference:localNote,shots:generated});
   setStatus("Local plan ready. Review it, then render your motion film.");return;
  }
  setStatus("Director step 1/2 — studying the exact image, visible wording and scene…");
  const imageData=await makePreparedData();
  const blob=await (await fetch(imageData)).blob();
  let analysis="";
  try{analysis=await analyzeReference(blob);setVisualAnalysis(analysis)}
  catch(e){throw new Error("Image analysis could not reach the Hugging Face Qwen Vision service. Check the connection and try again; Mira did not create a shot plan without analyzing the image.")}
  const generated=parseDirectorShots(analysis,brief,duration);
  setPlan({concept:brief,category:detectCategory(analysis+" "+brief),reference:analysis,shots:generated});
  setStatus("Director step 2/2 — shot plan built from the actual reference. Review it before generation.");
 }catch(e){setError(e.message||"Director analysis failed");setStatus("")}
 finally{setBusy(false)}
};
 const makePreparedData=()=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const maxW=aspect==="9:16"?720:960,maxH=aspect==="9:16"?1280:540;const c=document.createElement("canvas");const scale=Math.min(maxW/img.width,maxH/img.height,1);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const x=c.getContext("2d");x.fillStyle="#101014";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);let q=.76,data=c.toDataURL("image/jpeg",q);while(data.length>3500000&&q>.45){q-=.05;data=c.toDataURL("image/jpeg",q)}resolve(data)};img.onerror=reject;img.src=preview});
 const checkLocalEngine=async()=>{const base=localEngineUrl.replace(/\/$/,"");const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3500);try{const r=await fetch(base+"/health",{method:"GET",signal:controller.signal,mode:"cors"});if(!r.ok)throw new Error("Local GPU engine returned HTTP "+r.status);const data=await r.json();if(data?.ready===false||data?.status==="error")throw new Error(data?.message||"Wan 2.2 GPU is reachable, but the model/checkpoint is not ready.");return data}finally{clearTimeout(timer)}};
const testGpuConnection=async()=>{const base=(localEngineUrl||"").trim().replace(/\/+$/,"");if(!base){setGpuConnection("Enter the public Wan 2.2 GPU URL first.");return}let parsed;try{parsed=new URL(base)}catch{setGpuConnection("Enter a valid GPU API URL.");return}const local=["localhost","127.0.0.1","[::1]"].includes(parsed.hostname);if(window.location.protocol==="https:"&&parsed.protocol!=="https:"&&!local){setGpuConnection("Use HTTPS for the hosted GPU server.");return}if(window.location.protocol==="https:"&&local){setGpuConnection("This is a local address. A public GPU server URL is required for the deployed app.");return}setCheckingGpu(true);setGpuConnection("Checking GPU health, VRAM and API key…");try{const health=await checkLocalEngine();const response=await fetch(base+"/capabilities",{method:"GET",mode:"cors",headers:gpuApiKey?{"Authorization":"Bearer "+gpuApiKey}:{}});if(response.status===401||response.status===403)throw new Error("The API key was rejected. Check that it matches the GPU server.");if(!response.ok)throw new Error("Capabilities check returned HTTP "+response.status);const capabilities=await response.json();if(!capabilities.cuda||!capabilities.resolutions?.length)throw new Error("The service is online, but a ready Wan 2.2 CUDA GPU is unavailable.");const gpu=capabilities.gpu||health.gpu||"Wan 2.2 GPU";const vram=capabilities.vram_gb?" • "+capabilities.vram_gb+" GB VRAM":"";const model=capabilities.model_loaded?" • model loaded":" • model loads on first job";setGpuConnection("Ready • "+gpu+vram+model)}catch(error){setGpuConnection("Not ready • "+String(error?.message||error))}finally{setCheckingGpu(false)}};
const generateBrowser=async()=>{
 setBusy(true);setError("");setVideo("");setPlayableVideo("");
 try{
  setStatus("Rendering camera movement locally in your browser…");
  const blob=await renderBrowserMotion({imageUrl:preview,aspect,duration,motion,intensity,onProgress:p=>setStatus("Rendering local motion film… "+Math.round(p*100)+"%")});
  const url=URL.createObjectURL(blob);setVideo(url);setPlayableVideo(url);setJob({requestId:"mira-browser-"+Date.now(),segments:plan?.shots?.length||1});
  setStatus("Your local motion film is ready to preview and download.");
 }catch(e){setError(String(e?.message||e||"Local video rendering failed."));setStatus("")}
 finally{setBusy(false)}
};
const generatePublicAI=async()=>{
 setBusy(true);setError("");setVideo("");setPlayableVideo("");
 try{
  setStatus("Preparing your image for the free shared Wan 2.2 AI service…");
  const imageData=await makePreparedData();const imageBlob=await(await fetch(imageData)).blob();
  const shot=(plan?.shots||[]).map(s=>`${s.name}: ${s.action}; camera: ${s.camera}.`).join(" ");const clipSeconds=Math.min(5,Number(duration)||4);
  const lecturePrompt=sceneMode==="lecture"?`Re-stage this educational reference as one continuous realistic classroom lesson, not a moving poster. Use the visible instructor as the teacher reference and the visible subject/topic as the lesson topic. Show a board and a small class of students facing it. Timing: 0–1s establish students watching; 1–3s the teacher explains and writes one simple topic-related formula or diagram; 3–${clipSeconds}s students take notes and one student responds. Natural arm, head and body motion. The source image is an identity/topic reference; a classroom and students may be created when absent. Keep faces stable. No posters, logos, subtitles or decorative text.`:"Animate only the visible scene with clear, natural subject action. Preserve the visible people, setting, composition and readable wording; do not add unrelated subjects or objects.";
  const prompt=[`Create a realistic ${style.toLowerCase()} image-to-video clip with actual subject movement, not a still image with camera zoom.`,sceneMode==="lecture"?`Educational reference analysis (use only instructor appearance and topic): ${visualAnalysis}`:visualAnalysis,`Scene direction: ${brief}`,`Director beat: ${shot}`,`Camera: ${motion.toLowerCase()} movement at ${intensity}% intensity.`,lecturePrompt,`Avoid: ${negative}`].filter(Boolean).join(" ").slice(0,6000);
  setStatus("Connecting to Hugging Face’s shared free Wan 2.2 GPU…");
  const client=await Client.connect("r3gm/wan2-2-fp8da-aoti-preview");
  setStatus("Waiting for shared GPU, then generating real subject motion… this may take a few minutes.");
  const result=await client.predict([handle_file(imageBlob),prompt,`${negative}, static image, camera zoom only`,Math.min(5,Number(duration)||4),1,1,quality==="professional"?8:4,Math.floor(Math.random()*2147483647),true],"/generate_video");
  const output=result?.data?.[0];const remoteUrl=typeof output==="string"?output:(output?.url||output?.video?.url||output?.path||output?.video?.path);
  if(!remoteUrl)throw new Error("Wan 2.2 finished without returning a video. Try again later.");
  let videoUrl=remoteUrl;if(!/^https?:|^blob:|^data:/i.test(videoUrl))videoUrl=new URL(videoUrl,"https://r3gm-wan2-2-fp8da-aoti-preview.hf.space").href;
  setVideo(videoUrl);setJob({requestId:"mira-zerogpu-"+Date.now(),segments:1});setStatus("Real AI classroom motion is ready. Preview it and save the MP4.");
 }catch(e){
  const raw=String(e?.message||e||"Wan 2.2 generation failed");
  setError(/quota|limit|queue|gpu|503|429|unavailable|connect|fetch/i.test(raw)?`The shared free GPU is busy or has reached its daily limit. Your image was not animated. Try again later, or choose “Local camera motion” for an immediate video. (${raw})`:raw);setStatus("");
 }finally{setBusy(false)}
};
const generate=async()=>{
 if(!file||!plan)return;
 if(engine==="browser"){void generateBrowser();return}
 if(engine==="freeai"){void generatePublicAI();return}
 setBusy(true);setError("");setVideo("");
 try{
  setStatus("Preparing reference image…");
  const imageData=await makePreparedData();
  let currentBlob=await(await fetch(imageData)).blob();
  const requestedDuration=Number(duration)||3.5;
  const segmentDuration=requestedDuration<=60?(49/12):(49/8);
  const segmentCount=Math.max(1,Math.ceil(requestedDuration/segmentDuration));
  const segmentUrls=[];
  const segmentJobIds=[];
  const shotDirection=(plan?.shots||[]).map((s,i)=>`SHOT ${i+1} — ${s.name} (${s.duration}s): ACTION: ${s.action} CAMERA: ${s.camera}`).join("\n");
  const basePrompt=(`
FINAL DIRECTOR INSTRUCTION. The uploaded image is the absolute visual source of truth. Generate REAL AI motion with Wan 2.2 image-to-video on the configured dedicated GPU.
VISUAL DIRECTOR SHEET:
${visualAnalysis||plan.reference||"Preserve the visible scene faithfully."}
USER CREATIVE PROMPT / BRIEF:
${brief}
DIRECTOR SHOT PLAN:
${shotDirection}
Follow the described subject action, camera angle, framing, lighting, environment motion and timing. Preserve identity, anatomy, object geometry, composition, readable text and spatial relationships. Maintain continuity. Never add unrelated people or objects, invent text, morph subjects, or turn the scene into a product advertisement unless supported.
${selectedMotionText(style,motion,intensity)} NEGATIVE CONSTRAINTS: ${negative}
`).slice(0,10000);

  const localUrl=(localEngineUrl||"").trim().replace(/\/$/,"");
  if(!localUrl) throw new Error("Dedicated Wan 2.2 GPU API URL is not configured.");
  if(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(localUrl) && /^https:/i.test(window.location.protocol)){
   throw new Error("Mira is running online, but the GPU URL is localhost. Enter the public HTTPS URL of your dedicated Wan 2.2 GPU API and enable CORS.");
  }

  setStatus("Checking dedicated Wan 2.2 GPU…");
  await checkLocalEngine();

  for(let segment=0;segment<segmentCount;segment++){
   const activeShot=plan?.shots?.[segment]||plan?.shots?.[segment%Math.max(1,plan?.shots?.length||1)];
   const segmentPrompt=basePrompt+
    "\nACTIVE SHOT ONLY: "+(activeShot?.name||"Primary action")+
    "\nACTION: "+(activeShot?.action||brief)+
    "\nCAMERA: "+(activeShot?.camera||"slow cinematic push-in")+
    "\nSEGMENT "+(segment+1)+" OF "+segmentCount+
    ". Generate ONLY this shot. Continue naturally from the previous segment while preserving the same scene, identities, wardrobe, objects and lighting.";

   setStatus("Generating segment "+(segment+1)+" of "+segmentCount+" on your dedicated Wan 2.2 GPU…");
   const form=new FormData();
   form.append("image",currentBlob,"mira-reference.jpg");
   form.append("prompt",segmentPrompt);
   form.append("negative_prompt",negative);
   form.append("frames","49");
   form.append("width",aspect==="9:16"?"480":"832");
   form.append("height",aspect==="9:16"?"832":"480");
   form.append("fps",requestedDuration<=60?"12":"8");
   form.append("steps",quality==="professional"?"40":"8");
   form.append("shots",JSON.stringify([activeShot||{name:"Primary action",duration:segmentDuration,action:brief,camera:"slow cinematic push-in"}]));
   if(segment>0) form.append("last_image",currentBlob,"mira-continuity.jpg");

   let response;
   try{
    response=await fetch(localUrl+"/generate",{
     method:"POST",
     headers:gpuApiKey?{"Authorization":"Bearer "+gpuApiKey}:undefined,
     body:form
    });
   }catch(e){
    throw new Error("Could not reach the dedicated Wan 2.2 GPU API. Check the public HTTPS URL, CORS, firewall and GPU server status.");
   }
   if(!response.ok){
    let detail="";
    try{const body=await response.json();detail=body?.message||body?.detail||""}catch{}
    throw new Error("Dedicated GPU server returned HTTP "+response.status+(detail?": "+detail:""));
   }

   const data=await response.json();
   if(data?.job_id) segmentJobIds.push(String(data.job_id));
   let videoUrl=data?.video_url||data?.url||"";
   if(!videoUrl && data?.job_id){
    for(let attempt=0;attempt<180;attempt++){
     await new Promise(r=>setTimeout(r,2000));
     const sr=await fetch(localUrl+"/jobs/"+encodeURIComponent(data.job_id),{
      headers:gpuApiKey?{"Authorization":"Bearer "+gpuApiKey}:undefined
     });
     if(!sr.ok) throw new Error("Could not read dedicated GPU job status (HTTP "+sr.status+").");
     const st=await sr.json();
     if(st.message)setStatus("Segment "+(segment+1)+"/"+segmentCount+" — "+st.message);
     if(st.status==="completed"&&(st.video_url||st.url)){videoUrl=st.video_url||st.url;break;}
     if(st.status==="failed"||st.status==="error") throw new Error(st.message||st.error||"Dedicated Wan 2.2 generation failed.");
     if(st.status==="cancelled") throw new Error("Dedicated Wan 2.2 generation was cancelled.");
    }
    if(!videoUrl) throw new Error("Dedicated Wan 2.2 GPU generation timed out.");
   }
   if(!videoUrl) throw new Error("Dedicated GPU returned no video URL.");
   videoUrl=new URL(videoUrl,localUrl).href;
   segmentUrls.push(videoUrl);

   if(segment+1<segmentCount){
    try{
     const vr=await fetch(videoUrl,{mode:"cors"});
     if(vr.ok){
      const vb=await vr.blob();
      const vu=URL.createObjectURL(vb);
      const vv=document.createElement("video");
      vv.muted=true;vv.playsInline=true;vv.src=vu;
      await new Promise((res,rej)=>{vv.onloadedmetadata=res;vv.onerror=()=>rej(new Error("continuity decode failed"));});
      vv.currentTime=Math.max(0,(vv.duration||0)-0.08);
      await new Promise((res,rej)=>{vv.onseeked=res;vv.onerror=()=>rej(new Error("continuity seek failed"));});
      const cc=document.createElement("canvas");
      cc.width=aspect==="9:16"?720:960;cc.height=aspect==="9:16"?1280:540;
      const ctx=cc.getContext("2d");ctx.fillStyle="#09090b";ctx.fillRect(0,0,cc.width,cc.height);
      const scale=Math.min(cc.width/vv.videoWidth,cc.height/vv.videoHeight);
      const dw=vv.videoWidth*scale,dh=vv.videoHeight*scale;
      ctx.drawImage(vv,(cc.width-dw)/2,(cc.height-dh)/2,dw,dh);
      currentBlob=await new Promise(res=>cc.toBlob(res,"image/jpeg",.82));
      URL.revokeObjectURL(vu);
     }
    }catch{
     setStatus("Segment "+(segment+1)+" generated. Continuing from the original reference frame…");
    }
   }
  }

  setStatus("Assembling "+segmentUrls.length+" real AI-generated segment"+(segmentUrls.length===1?"":"s")+" into an MP4…");
  let finalVideo=segmentUrls[0];
  if(segmentUrls.length>1){
   if(segmentJobIds.length!==segmentUrls.length) throw new Error("The GPU service did not return all job IDs needed for server-side MP4 stitching.");
   const stitched=await fetch(localUrl+"/stitch",{method:"POST",headers:{...(gpuApiKey?{"Authorization":"Bearer "+gpuApiKey}:{}),"Content-Type":"application/json"},body:JSON.stringify({job_ids:segmentJobIds})});
   if(!stitched.ok){let detail="";try{const body=await stitched.json();detail=body?.message||body?.detail||""}catch{}throw new Error("GPU MP4 stitching failed (HTTP "+stitched.status+")"+(detail?": "+detail:"."));}
   const result=await stitched.json();
   if(!result?.video_url) throw new Error("The GPU service stitched the film but returned no MP4 URL.");
   finalVideo=new URL(result.video_url,localUrl).href;
  }
  setVideo(finalVideo);
  setJob({requestId:"mira-wan-"+Date.now(),segments:segmentUrls.length});
  setStatus("AI film ready — generated entirely on your dedicated Wan 2.2 GPU.");
 }catch(e){
  const message=String(e?.message||e||"Dedicated Wan 2.2 GPU generation failed");
  setError(message);setStatus("");
 }finally{
  setBusy(false);
 }
};
return <div className="app"><header><div className="brand"><div className="logo">M</div><div><b>Mira Studio</b><span>AI Image-to-Scene Director</span></div></div><div className="provider"><span className="dot"/>{engine==="browser"?"Free local video mode":engine==="freeai"?"Free shared Wan 2.2 AI":"Wan 2.2 • Dedicated GPU mode"}</div></header>
 <main><section className="hero"><p className="eyebrow">MIRA DIRECTOR <span>V2</span></p><h1>From a single image to a directed scene.</h1><p className="sub">A professional image-to-video workflow: visual understanding → shot direction → generation → review. Mira keeps the reference image as the source of truth instead of forcing every scene into a generic ad.</p></section>
 <section className="workflow"><div className="step active"><b>01</b><span>Reference</span></div><div className="line"/><div className="step"><b>02</b><span>Director</span></div><div className="line"/><div className="step"><b>03</b><span>Generate</span></div><div className="line"/><div className="step"><b>04</b><span>Review</span></div></section>
 <section className="grid">
 <div className="card"><div className="cardhead"><span>01</span><h2>Image & creative direction</h2><button className="iconbtn" onClick={()=>setSettings(!settings)}><Settings2 size={17}/></button></div>
 <button className="drop" onClick={()=>fileRef.current.click()}>{preview?<img src={preview}/>:<><Upload size={28}/><b>Upload any image</b><small>Class, lecture, people, event, product, nature — JPG, PNG or WebP</small></>}</button><input ref={fileRef} hidden type="file" accept="image/*" onChange={onFile}/>
 <div className="promptLabel"><label>Creative direction <span>Tell Mira exactly how you want the image to become a video</span></label><textarea className="creativePrompt" value={brief} onChange={e=>setBrief(e.target.value)} placeholder="Example: Make the teacher start writing on the board, students look toward the board, camera slowly moves from the back of the classroom toward the teacher, natural hand and head movement, realistic lighting, no new people or objects."/></div>{settings&&<div className="advancedSettings"><div className="settings"><label>Scene format<select value={sceneMode} onChange={e=>setSceneMode(e.target.value)}><option value="lecture">Active classroom lesson • teacher + students</option><option value="source">Animate the uploaded scene</option></select></label><label>Visual style<select value={style} onChange={e=>setStyle(e.target.value)}><option>Cinematic</option><option>Natural / realistic</option><option>Documentary</option><option>Dramatic</option><option>Premium commercial</option><option>Editorial</option></select></label><label>Motion language<select value={motion} onChange={e=>setMotion(e.target.value)}><option>Cinematic</option><option>Subtle</option><option>Dynamic</option><option>Subject follow</option><option>Orbit / tracking</option><option>Macro / detail</option></select></label></div><div className="settings"><label className="rangeLabel">Motion intensity <b>{intensity}%</b><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(+e.target.value)}/></label><label>Aspect ratio<select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option></select></label></div><div className="settings"><label>Film duration<select value={duration} onChange={e=>setDuration(+e.target.value)}><option value="4">4 sec • AI motion</option><option value="5" disabled={engine!=="personal"}>5 sec • AI motion</option><option value="7" disabled={engine==="browser"||engine==="freeai"}>7 sec • 2 segments</option><option value="15" disabled={engine==="freeai"}>15 sec • 4 segments</option><option disabled={engine==="browser"||engine==="freeai"} value="30">30 sec • 8 segments</option><option disabled={engine==="browser"||engine==="freeai"} value="60">60 sec • 15 segments</option><option disabled={engine==="browser"||engine==="freeai"} value="120">120 sec • 20 segments</option><option disabled={engine==="browser"||engine==="freeai"} value="300">300 sec • 49 segments</option></select></label><label>Output quality<select value={quality} onChange={e=>setQuality(e.target.value)}><option value="draft">Fast draft • shorter GPU wait</option><option value="professional">Professional • more detail, slower</option></select></label></div><div className="engineControls"><label>Generation mode<select value={engine} onChange={e=>{setEngine(e.target.value);if(e.target.value==="browser"&&duration>15)setDuration(15);if(e.target.value==="freeai"&&duration>5)setDuration(4);setPlan(null);setVideo("");setError("")}}><option value="freeai">Free AI video - real teacher & student motion</option><option value="browser">Local camera motion - instant</option><option value="personal">AI video - my Wan 2.2 GPU server</option></select></label>{engine==="personal"?<><label>Wan 2.2 GPU API URL<input value={localEngineUrl} onChange={e=>{setLocalEngineUrl(e.target.value);setGpuConnection("")}} placeholder="https://your-dedicated-wan-gpu.example.com"/></label><div className="gpuConnect"><button className="secondary" disabled={checkingGpu||busy} onClick={testGpuConnection}>{checkingGpu?<><Loader2 className="spin" size={15}/> Checking GPU...</>:"Test GPU connection"}</button>{gpuConnection&&<p className={gpuConnection.startsWith("Ready")?"gpuReady":"gpuWarning"}>{gpuConnection}</p>}</div><label>GPU API key (if required)<input type="password" value={gpuApiKey} onChange={e=>{setGpuApiKey(e.target.value);setGpuConnection("")}} placeholder="Only for your dedicated GPU"/></label><label>AI engine status<input value={"Wan 2.2 - real generated subject motion"} readOnly/></label></>:engine==="freeai"?<div className="browserModeNote"><b>Real AI motion • no setup</b><span>Wan 2.2 animates the teacher and students. Free shared GPU has daily limits and a queue. Generates a silent clip of up to 4 seconds; your image is sent to Hugging Face.</span></div>:<div className="browserModeNote"><b>Runs on this page</b><span>Your image stays in your browser. Mira exports a smooth camera-motion video as WebM. People and objects remain still; choose Free AI video to animate them.</span></div>}<label className="negativeLabel">Negative prompt<input value={negative} onChange={e=>setNegative(e.target.value)}/></label></div></div>}
 <div className="framecheck"><Check size={15}/><span>Delivery frame: <b>{dims.w} × {dims.h}</b> • {aspect}</span></div>
 <p className="fineprint visionDisclosure">{engine==="browser"?"No upload, API key or GPU: Mira makes a camera-motion plan locally from your direction.":engine==="freeai"?"Image analysis and video generation use Hugging Face public services. The source image is sent to those services.":"Image analysis uses the public Hugging Face Qwen Vision Space. Video generation stays on your configured Wan 2.2 GPU."}</p><button className="primary" disabled={!file||busy} onClick={buildPlan}><Sparkles size={18}/> {busy?"Studying reference…":plan?"Refresh director plan":engine==="browser"?"Create local motion plan":"Study image & build director plan"}</button>
 </div>
 <div className="card"><div className="cardhead"><span>02</span><h2>Director shot plan</h2><span className="planmeta">{style} • {motion}</span></div>{plan?<div className="plan"><div className="planintro"><Clapperboard size={19}/><div><b>{plan.shots.length} shots • {duration}s total</b><p>{engine==="browser"?"Local edit plan: every shot preserves the source image and changes only the camera move.":"Every shot is planned from reference analysis with distinct action and camera direction."}</p></div></div>{plan.shots.map((s,i)=><div className={"shot "+(expanded===i?"open":"")} key={s.name}><div className="num">{String(i+1).padStart(2,"0")}</div><div className="shotbody"><button className="shottoggle" onClick={()=>setExpanded(expanded===i?-1:i)}><span><b>{s.name}</b><small>{s.duration}s • {s.camera}</small></span>{expanded===i?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{expanded===i&&<div className="shotedit"><label>Action<textarea value={s.action} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,action:e.target.value}:x)};setPlan(n)}}/></label><label>Camera<select value={s.camera} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,camera:e.target.value}:x)};setPlan(n)}}>{cameraMoves.map(m=><option key={m}>{m}</option>)}</select></label></div>} </div></div>)}<div className="timeline">{plan.shots.map((s,i)=><button key={i} className={expanded===i?"active":""} style={{flex:s.duration}} onClick={()=>setExpanded(i)}>{i+1}</button>)}</div><button className="secondary" onClick={buildPlan}><WandSparkles size={16}/> Rebuild director plan</button></div>:<div className="empty"><Film size={35}/><p>No shot plan yet.</p><small>Upload an image and let Mira study it before acting as the scene director.</small></div>}</div>
 <div className="card stage"><div className="cardhead"><span>03</span><h2>{engine==="browser"?"Local video render":"AI generation"}</h2><div className="modeltag">{engine==="browser"?"Browser - no GPU":engine==="personal"?"Wan 2.2 - Personal GPU":engine==="freeai"?"Wan 2.2 - shared ZeroGPU":"Wan 2.2 - Real AI I2V"}</div></div><div className="preview">{video?<>{playableVideo?<video src={playableVideo} poster={preview} controls autoPlay loop muted playsInline preload="auto"/>:<div className="videoLoading">Loading generated video…</div>}<a className="videoOpen" href={video} target="_blank" rel="noreferrer">Open generated video</a></>:preview?<div className="sourcepreview"><img src={preview}/><span>Validated reference • {dims.w}×{dims.h}</span></div>:<div className="empty"><Film size={35}/><p>Final film preview</p><small>Your generated film appears here. If the embedded preview does not load, use Open generated video.</small></div>}</div>
<div className="actions"><button className="primary" disabled={!file||!plan||busy} onClick={generate}>{busy?<><Loader2 className="spin" size={18}/> {status||"Generating…"}</>:<><Play size={18}/> {engine==="browser"?"Render camera-motion film":"Generate real AI video"}</>}</button>{video&&<a className="secondary" href={video} target="_blank" rel="noreferrer" download={engine==="browser"?"mira-motion-film.webm":"mira-ai-film.mp4"}><Download size={16}/> {engine==="browser"?"Save WebM":"Save MP4"}</a>}</div>
 <div className="status">{status&&<><span className="statusdot"/>{status}</>}{job&&<span className="request">Request {job.requestId.slice(0,8)}…</span>}</div><div className="generationNotes">{engine==="browser"?<><span><Check size={13}/> Local browser rendering</span><span><Check size={13}/> Cinematic camera movement</span><span><Check size={13}/> WebM export</span></>:<><span><Check size={13}/> Real AI image-to-video</span><span><Check size={13}/> Scene-specific shot direction</span><span><Check size={13}/> Identity / text protection</span></>}</div>{error&&<div className="error"><AlertTriangle size={16}/>{error}</div>}
 <p className="fineprint">{engine==="browser"?"Local mode creates an instant camera-motion video; people and objects remain still.":engine==="freeai"?"Wan 2.2 creates real movement for up to 4 seconds from your image. Free shared GPU access is subject to daily quotas and queues.":"AI video mode sends generation requests to your configured Wan 2.2 GPU server."}</p>
 </div></section></main></div>}
createRoot(document.getElementById("root")).render(<App/>);
// Build-safe source marker


