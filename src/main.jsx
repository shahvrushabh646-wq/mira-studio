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
 const[aspect,setAspect]=useState("9:16"),[duration,setDuration]=useState(5),[visualAnalysis,setVisualAnalysis]=useState(""),[plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[video,setVideo]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState(""),[settings,setSettings]=useState(true),[style,setStyle]=useState("Cinematic"),[motion,setMotion]=useState("Cinematic"),[intensity,setIntensity]=useState(45),[negative,setNegative]=useState("distorted face, identity drift, extra limbs, duplicated subjects, warped objects, invented text, morphing, flicker, jitter, deformed hands, watermark, low quality"),[expanded,setExpanded]=useState(0),[history,setHistory]=useState([]),[job,setJob]=useState(null),fileRef=useRef(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 useEffect(()=>{let cancelled=false,objectUrl="";if(!video){setPlayableVideo("");return()=>{}};setPlayableVideo("");fetch(video,{mode:"cors"}).then(r=>{if(!r.ok)throw new Error("Video download failed");return r.blob()}).then(blob=>{if(cancelled)return;objectUrl=URL.createObjectURL(blob);setPlayableVideo(objectUrl)}).catch(()=>{if(!cancelled)setPlayableVideo(video)});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[video]);
 const dims=aspect==="9:16"?{w:1080,h:1920}:{w:1920,h:1080};
 const shots=useMemo(()=>makeDirectorShots("",brief,duration),[brief,duration]);
 const onFile=e=>{const f=e.target.files?.[0];if(!f)return;setFile(f);setPreview(URL.createObjectURL(f));setPlan(null);setVideo("");setError("");setStatus("Image loaded — ready for scene director planning.")};
 const analyzeReference=async(blob)=>{
 const vision=await Client.connect("developer0hye/Qwen2.5-VL-7B-Instruct");
 const prompt="Act as a visual scene director. Study this exact image carefully before generating anything. Identify the scene type, every important visible person, object, animal, vehicle, structure, text/sign, clothing, pose, spatial relationships, background, lighting, colors, camera angle and distinctive details. For people, describe their visible pose and what action the scene naturally suggests. For classroom/lecture images, identify teacher, students, board/books/desks and the teaching activity visible. For events, identify the central activity and crowd/environment. For nature, identify the main subject and environmental motion. Read clearly visible wording but never invent missing text. Separate visible facts from uncertainty. Return a concise factual visual reference sheet for an image-to-video model. Do not turn every image into a product advertisement.";
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
 const generate=async()=>{if(!file||!plan)return;setBusy(true);setError("");setVideo("");try{setStatus("Preparing reference image…");const imageData=await makePreparedData();const blob=await(await fetch(imageData)).blob();const prompt=("Study this exact reference image. "+(visualAnalysis||plan.reference||"Preserve the visible scene faithfully.")+". "+brief+". Animate only actions that logically belong to the visible people, objects and environment. Preserve identities, proportions, composition and visible text. "+selectedMotionText(style,motion,intensity)+" "+negative).slice(0,5000);setStatus("Connecting to free Wan 2.2 public GPU…");const fd=new FormData();fd.append("image",blob,file.name||"reference.jpg");fd.append("params",JSON.stringify({prompt,duration_seconds:Math.min(Number(duration)||3.5,4.5),steps:6}));const r=await fetch("https://nifty-vid.workers.dev/generate",{method:"POST",body:fd});if(!r.ok)throw new Error((await r.text())||"Free Wan backend is unavailable.");if(!r.body)throw new Error("Free Wan backend returned no stream.");const reader=r.body.getReader();const decoder=new TextDecoder();let buffer="";let found="";while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});const events=buffer.split(/\r?\n\r?\n/);buffer=events.pop()||"";for(const ev of events){const lines=ev.split(/\r?\n/);const eventName=lines.find(x=>x.startsWith("event:"))?.slice(6).trim();const dataLine=lines.find(x=>x.startsWith("data:"))?.slice(5).trim();if(!dataLine)continue;if(eventName==="error"){throw new Error(dataLine)}if(eventName==="complete"){try{const payload=JSON.parse(dataLine);const raw=Array.isArray(payload)?payload[0]:payload;found=raw?.video?.url||raw?.video?.path||raw?.url||raw?.path||raw?.data?.url||raw?.data?.path||""}catch{}}setStatus("Free Wan 2.2 — generating…")}}if(!found){const match=buffer.match(/https?:\/\/[^\s"']+\.(?:mp4|webm)(?:\?[^\s"']*)?/i);if(match)found=match[0]}if(!found)throw new Error("The free Wan 2.2 GPU finished without returning a video. Please retry; the public GPU may be cold or queued.");setVideo(found);setJob({requestId:"free-public-"+Date.now()});setStatus("AI film ready — free Wan 2.2 public GPU.");}catch(e){setError(e?.message||"Something went wrong");setStatus("")}finally{setBusy(false)}}; return <div className="app"><header><div className="brand"><div className="logo">M</div><div><b>Mira Studio</b><span>AI Image-to-Scene Director</span></div></div><div className="provider"><span className="dot"/>Wan 2.2 • Unlimited backend • No user token • Reference Vision</div></header>
 <main><section className="hero"><p className="eyebrow">DIRECT • GENERATE • REVIEW</p><h1>Turn any image into a believable AI scene.</h1><p className="sub">Study the exact image first, understand what is happening, choose actions that belong to that scene, then generate a cinematic multi-beat image-to-video film.</p></section>
 <section className="workflow"><div className="step active"><b>01</b><span>Brief</span></div><div className="line"/><div className="step"><b>02</b><span>Director</span></div><div className="line"/><div className="step"><b>03</b><span>Generate</span></div><div className="line"/><div className="step"><b>04</b><span>Film</span></div></section>
 <section className="grid">
 <div className="card"><div className="cardhead"><span>01</span><h2>Image & creative direction</h2><button className="iconbtn" onClick={()=>setSettings(!settings)}><Settings2 size={17}/></button></div>
 <button className="drop" onClick={()=>fileRef.current.click()}>{preview?<img src={preview}/>:<><Upload size={28}/><b>Upload any image</b><small>Class, lecture, people, event, product, nature — JPG, PNG or WebP</small></>}</button><input ref={fileRef} hidden type="file" accept="image/*" onChange={onFile}/>
 <textarea value={brief} onChange={e=>setBrief(e.target.value)}/>{settings&&<div className="advancedSettings"><div className="settings"><label>Visual style<select value={style} onChange={e=>setStyle(e.target.value)}><option>Cinematic</option><option>Natural / realistic</option><option>Documentary</option><option>Dramatic</option><option>Premium commercial</option><option>Editorial</option></select></label><label>Motion language<select value={motion} onChange={e=>setMotion(e.target.value)}><option>Cinematic</option><option>Subtle</option><option>Dynamic</option><option>Subject follow</option><option>Orbit / tracking</option><option>Macro / detail</option></select></label></div><div className="settings"><label className="rangeLabel">Motion intensity <b>{intensity}%</b><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(+e.target.value)}/></label><label>Aspect ratio<select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option></select></label></div><div className="settings"><label>Film duration<select value={duration} onChange={e=>setDuration(+e.target.value)}><option value="5">5 sec • Short film</option></select></label><label>Output quality<select defaultValue="standard"><option>Standard • fast</option><option>High • slower</option></select></label></div><div className="engineControls"><label>Generation engine<select value={engine} onChange={e=>setEngine(e.target.value)}><option value="free">Free Public Wan 2.2 • No token</option></select></label><label>Generation mode<input value="Free public GPU • no user token" readOnly/></label></div><label className="negativeLabel">Negative prompt<input value={negative} onChange={e=>setNegative(e.target.value)}/></label></div>}
 <div className="framecheck"><Check size={15}/><span>Delivery frame: <b>{dims.w} × {dims.h}</b> • {aspect}</span></div>
 <button className="primary" disabled={!file||busy} onClick={buildPlan}><Sparkles size={18}/> {busy?"Studying reference…":plan?"Refresh director plan":"Study image & build director plan"}</button>
 </div>
 <div className="card"><div className="cardhead"><span>02</span><h2>Director shot plan</h2><span className="planmeta">{style} • {motion}</span></div>{plan?<div className="plan"><div className="planintro"><Clapperboard size={19}/><div><b>{plan.shots.length} shots • {duration}s total</b><p>Every shot is derived from the reference sheet and has a distinct action + camera language.</p></div></div>{plan.shots.map((s,i)=><div className={"shot "+(expanded===i?"open":"")} key={s.name}><div className="num">{String(i+1).padStart(2,"0")}</div><div className="shotbody"><button className="shottoggle" onClick={()=>setExpanded(expanded===i?-1:i)}><span><b>{s.name}</b><small>{s.duration}s • {s.camera}</small></span>{expanded===i?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{expanded===i&&<div className="shotedit"><label>Action<textarea value={s.action} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,action:e.target.value}:x)};setPlan(n)}}/></label><label>Camera<select value={s.camera} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,camera:e.target.value}:x)};setPlan(n)}}>{cameraMoves.map(m=><option key={m}>{m}</option>)}</select></label></div>} </div></div>)}<div className="timeline">{plan.shots.map((s,i)=><button key={i} className={expanded===i?"active":""} style={{flex:s.duration}} onClick={()=>setExpanded(i)}>{i+1}</button>)}</div><button className="secondary" onClick={buildPlan}><WandSparkles size={16}/> Rebuild director plan</button></div>:<div className="empty"><Film size={35}/><p>No shot plan yet.</p><small>Upload an image and let Mira study it before acting as the scene director.</small></div>}</div>
 <div className="card stage"><div className="cardhead"><span>03</span><h2>AI generation</h2><div className="modeltag">{engine==="local"?"Wan 2.2 TI2V-5B • Unlimited":"Wan 2.2 TI2V-5B • Unlimited"}</div></div><div className="preview">{video?<>{playableVideo?<video src={playableVideo} poster={preview} controls autoPlay loop muted playsInline preload="auto"/>:<div className="videoLoading">Loading generated video…</div>}<a className="videoOpen" href={video} target="_blank" rel="noreferrer">Open generated video</a></>:preview?<div className="sourcepreview"><img src={preview}/><span>Validated reference • {dims.w}×{dims.h}</span></div>:<div className="empty"><Film size={35}/><p>Final film preview</p><small>Your generated MP4 appears here. If preview does not load, use Open generated video.</small></div>}</div>
 <div className="actions"><button className="primary" disabled={!file||!plan||busy} onClick={generate}>{busy?<><Loader2 className="spin" size={18}/> {status||"Generating…"}</>:<><Play size={18}/> Generate AI film</>}</button>{video&&<a className="secondary" href={video} target="_blank" rel="noreferrer" download="mira-ai-film.mp4"><Download size={16}/> Save MP4</a>}</div>
 <div className="status">{status&&<><span className="statusdot"/>{status}</>}{job&&<span className="request">Request {job.requestId.slice(0,8)}…</span>}</div><div className="generationNotes"><span><Check size={13}/> Scene consistency guard</span><span><Check size={13}/> Cinematic camera prompts</span><span><Check size={13}/> Negative prompt protection</span></div>{error&&<div className="error"><AlertTriangle size={16}/>{error}</div>}
 <p className="fineprint">Mobile mode does not require a PC or local GPU. It uses Hugging Face ZeroGPU when your account has GPU quota available. Unlimited generation still requires dedicated GPU compute; a free cloud GPU cannot be made unlimited by app code.</p>
 </div></section></main></div>}
createRoot(document.getElementById("root")).render(<App/>);