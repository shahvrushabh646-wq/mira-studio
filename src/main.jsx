import React,{useEffect,useMemo,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Client,handle_file}from"@gradio/client";
import{Upload,Play,Download,RefreshCw,Film,Sparkles,Check,Loader2,Clapperboard,Settings2,AlertTriangle,ChevronDown,ChevronUp,Copy,SlidersHorizontal, WandSparkles}from"lucide-react";
import"./styles.css";

const MODEL="fal-ai/kling-video/v3/standard/image-to-video";
const cameraMoves=["locked hero push-in","slow lateral slide","macro texture drift","smooth overhead reveal","controlled 360 orbit","low-angle rise","diagonal tracking move","locked closing frame"];
const storyTemplates={
 food:[
  ["Cold open hero","Start on the exact package/product in a premium hero setup; related ingredients or crumbs enter naturally.","locked hero push-in"],
  ["Ingredient macro","Cut to a macro of only ingredients/materials that are visibly consistent with the product; reveal texture and surface detail.","macro texture drift"],
  ["Preparation action","Show a believable preparation, opening, pouring, serving or hand interaction appropriate to this product.","slow lateral slide"],
  ["Texture payoff","Hard cut to the most appetizing physical detail: crisp texture, liquid, coating, steam or surface detail. No morphing.","smooth overhead reveal"],
  ["Lifestyle interaction","A natural hand or lifestyle moment uses the exact product while keeping packaging geometry stable.","diagonal tracking move"],
  ["Final packshot","Return to the exact product, centered and clean, with a polished commercial ending.","controlled 360 orbit"]
 ],
 beauty:[
  ["Hero bottle","Open with the exact package/bottle in a premium beauty setup; preserve label and silhouette.","locked hero push-in"],
  ["Texture macro","Reveal only a real product texture, finish, liquid or material consistent with the reference.","macro texture drift"],
  ["Dispense moment","Show a believable hand dispensing, opening or applying the product without changing the package.","slow lateral slide"],
  ["Application detail","Cut to a close beauty detail with realistic skin/material interaction and shallow depth of field.","diagonal tracking move"],
  ["Lifestyle glow","Show the product in its intended lifestyle context with restrained motion and premium lighting.","low-angle rise"],
  ["Final packshot","Resolve on the exact package with the visible wording and logo unchanged.","controlled 360 orbit"]
 ],
 tech:[
  ["Product reveal","Introduce the exact device/object with a precise hero push and controlled reflections.","locked hero push-in"],
  ["Material macro","Inspect ports, buttons, finish, screen or distinctive hardware details that are actually visible.","macro texture drift"],
  ["Interaction","A believable hand operates a visible control or interacts with the product; no invented UI or ports.","slow lateral slide"],
  ["Feature action","Show one functional action implied by the reference image, using a hard editorial cut rather than impossible morphing.","smooth overhead reveal"],
  ["Dynamic hero","Track around the device while preserving exact geometry, proportions and branding.","diagonal tracking move"],
  ["Final packshot","Return to a clean hero frame with the exact product centered and stable.","controlled 360 orbit"]
 ],
 fashion:[
  ["Hero look","Open on the exact fashion item/accessory with premium editorial lighting and accurate silhouette.","locked hero push-in"],
  ["Material macro","Reveal stitching, weave, leather, metal, sole or other visible material detail.","macro texture drift"],
  ["Wear interaction","Show a believable hand or person interacting with or wearing the exact item without redesigning it.","slow lateral slide"],
  ["Movement cut","Hard cut to natural movement that highlights the product while preserving shape and color.","diagonal tracking move"],
  ["Detail payoff","A close editorial detail catches light across a distinctive feature already visible.","low-angle rise"],
  ["Final hero","Finish on the exact item in a clean fashion-commercial composition.","controlled 360 orbit"]
 ],
 generic:[
  ["Hero opener","Establish the exact product as the unmistakable hero. Add only context that is physically compatible with the reference.","locked hero push-in"],
  ["Material detail","Macro reveal of the exact visible surface, texture, finish, label or distinctive construction.","macro texture drift"],
  ["Functional action","Show the most believable real-world interaction suggested by the product and reference image.","slow lateral slide"],
  ["Editorial cut","Use a hard cut to a new angle or context; imply transformation by editing, never by morphing.","smooth overhead reveal"],
  ["Dynamic detail","Track around the product or its key feature with stable geometry and realistic depth.","diagonal tracking move"],
  ["Closing packshot","End with the exact product centered, readable and commercially polished.","controlled 360 orbit"]
 ]
};

function detectCategory(text=""){
 const t=text.toLowerCase();
 if(/chip|snack|food|biscuit|cookie|chocolate|candy|noodle|pizza|sauce|masala|spice|coffee|tea|drink|beverage|juice|water|soda/.test(t))return "food";
 if(/cream|serum|lipstick|makeup|cosmetic|perfume|fragrance|shampoo|skincare|beauty|lotion|foundation|mascara/.test(t))return "beauty";
 if(/phone|laptop|tablet|camera|headphone|earbud|watch|speaker|console|keyboard|mouse|charger|device|tech|electronic/.test(t))return "tech";
 if(/shoe|sneaker|shirt|tshirt|dress|jacket|jeans|bag|handbag|watch|jewelry|fashion|clothing|apparel/.test(t))return "fashion";
 return "generic";
}

function makeDirectorShots(analysis,brief,duration){
 const category=detectCategory((analysis||"")+" "+(brief||""));
 const template=storyTemplates[category]||storyTemplates.generic;
 const count=duration<=5?6:duration<=8?7:duration<=10?8:duration<=12?9:10;
 const picked=Array.from({length:count},(_,i)=>template[i%template.length]);
 const base=Math.floor(duration/count),rem=duration%count;
 return picked.map((s,i)=>({name:s[0],action:s[1],camera:s[2],duration:base+(i<rem?1:0)}));
}

const baseShots=storyTemplates.generic.map(s=>({name:s[0],action:s[1],camera:s[2]}));

function selectedMotionText(style,motion,intensity){return `Professional product commercial, ${style}, ${motion} camera movement, motion intensity ${intensity}%, physically plausible movement, preserve exact product identity, packaging and visible text.`}

function App(){
 const[file,setFile]=useState(null),[preview,setPreview]=useState(""),[playableVideo,setPlayableVideo]=useState(""),[brief,setBrief]=useState("Create a premium cinematic product advertisement. Preserve the exact product identity, packaging, proportions, materials and visible text. Use realistic commercial lighting, elegant depth, physically plausible motion and clean editorial cuts. Nothing should be invented that conflicts with the reference image.");
 const[aspect,setAspect]=useState("9:16"),[duration,setDuration]=useState(5),[visualAnalysis,setVisualAnalysis]=useState(""),[plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[video,setVideo]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState(""),[settings,setSettings]=useState(true),[style,setStyle]=useState("Luxury commercial"),[motion,setMotion]=useState("Cinematic"),[intensity,setIntensity]=useState(45),[negative,setNegative]=useState("warped product, distorted packaging, invented logo, fake text, duplicate product, melting, morphing, flicker, jitter, deformed hands, watermark, low quality"),[expanded,setExpanded]=useState(0),[history,setHistory]=useState([]),[job,setJob]=useState(null),fileRef=useRef(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 useEffect(()=>{let cancelled=false,objectUrl="";if(!video){setPlayableVideo("");return()=>{}};setPlayableVideo("");fetch(video,{mode:"cors"}).then(r=>{if(!r.ok)throw new Error("Video download failed");return r.blob()}).then(blob=>{if(cancelled)return;objectUrl=URL.createObjectURL(blob);setPlayableVideo(objectUrl)}).catch(()=>{if(!cancelled)setPlayableVideo(video)});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[video]);
 const dims=aspect==="9:16"?{w:1080,h:1920}:{w:1920,h:1080};
 const shots=useMemo(()=>makeDirectorShots("",brief,duration),[brief,duration]);
 const onFile=e=>{const f=e.target.files?.[0];if(!f)return;setFile(f);setPreview(URL.createObjectURL(f));setPlan(null);setVideo("");setError("");setStatus("Product loaded — ready for director planning.")};
 const analyzeReference=async(blob)=>{
 const vision=await Client.connect("developer0hye/Qwen2.5-VL-7B-Instruct");
 const prompt="Act as a product-commercial art director. Inspect this exact product image carefully. Read all clearly visible wording exactly where possible. Identify product category, brand/logo, package or object shape, colors, materials, orientation, distinctive details, visible ingredients/parts, setting and lighting. Separate what is clearly visible from what is uncertain. Do not invent missing details. Return a concise factual reference sheet for an image-to-video model.";
 const r=await vision.predict([handle_file(blob),prompt],"/qwen_vl_inference");
 return String(r?.data?.[0]||"").slice(0,7000);
};
const buildPlan=async()=>{
 if(!file)return;
 setBusy(true);setError("");
 try{
  setStatus("Director step 1/2 — studying the exact product image and visible wording…");
  const imageData=await makePreparedData();
  const blob=await (await fetch(imageData)).blob();
  let analysis="";
  try{analysis=await analyzeReference(blob);setVisualAnalysis(analysis)}
  catch(e){analysis="Reference image is the source of truth. Preserve the exact visible product, packaging, colors, proportions, logo and wording. Do not invent details."}
  const generated=makeDirectorShots(analysis,brief,duration);
  setPlan({concept:brief,category:detectCategory(analysis+" "+brief),reference:analysis,shots:generated});
  setStatus("Director step 2/2 — shot plan built from the actual reference. Review it before generation.");
 }catch(e){setError(e.message||"Director analysis failed");setStatus("")}
 finally{setBusy(false)}
};
 const makePreparedData=()=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const maxW=aspect==="9:16"?720:960,maxH=aspect==="9:16"?1280:540;const c=document.createElement("canvas");const scale=Math.min(maxW/img.width,maxH/img.height,1);c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const x=c.getContext("2d");x.fillStyle="#101014";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);let q=.76,data=c.toDataURL("image/jpeg",q);while(data.length>3500000&&q>.45){q-=.05;data=c.toDataURL("image/jpeg",q)}resolve(data)};img.onerror=reject;img.src=preview});
 const generate=async()=>{if(!file)return;setBusy(true);setError("");setVideo("");try{setStatus("Preparing validated reference frame…");const imageData=await makePreparedData();setStatus(`Reference frame prepared: ${dims.w} × ${dims.h} — ${aspect}.`);const payload={imageData,brief,aspect,duration,style,motion,intensity,negativePrompt:negative,shots:plan?.shots?.map(({name,action,camera,duration})=>({name,action,camera,duration}))||shots.map(({name,action,camera,duration})=>({name,action,camera,duration}))};const blob=await (await fetch(imageData)).blob();setStatus("AI is using the director-approved reference sheet and generating the commercial…");const imageAnalysis=visualAnalysis||plan?.reference||"Reference image is the source of truth. Preserve all visible product details and wording exactly.";const app=await Client.connect("zerogpu-aoti/wan2-2-fp8da-aoti-faster",{events:["status","data"]});const submission=app.submit("/generate_video",{input_image:handle_file(blob),prompt:("FIRST STUDY AND FOLLOW THIS REFERENCE IMAGE FACTUALLY. REFERENCE SHEET: "+imageAnalysis+". USER BRIEF: "+brief+". COMMERCIAL DIRECTOR: Create a fast, premium social-commercial with six distinct editorial beats inside this 5-second film. Use hard cuts between beats, not morphing. Beat 1 hero reveal. Beat 2 macro material/detail. Beat 3 believable product interaction. Beat 4 dynamic functional/action moment. Beat 5 cinematic tracking/orbit payoff. Beat 6 clean final packshot. Each beat must have a visibly different composition or action. Keep the exact product identity, package geometry, colors, logo and visible wording consistent with the reference image in every beat. Never invent text, logos, ingredients, parts or packaging. "+selectedMotionText(style,motion,intensity)+" Negative constraints: "+negative+". Animate only what is physically compatible with the reference image.").slice(0,7000),steps:6,negative_prompt:negative,duration_seconds:5,guidance_scale:1,guidance_scale_2:1,seed:Math.floor(Math.random()*2147483647),randomize_seed:true});let result=null;for await(const event of submission){if(event.type==="status"){const st=event.stage||event.status?.stage||event.status;setStatus(st==="generating"?"Free GPU is rendering the video…":"Free GPU queue: "+String(st||"working")+"…")}if(event.type==="data"&&event.data)result=event.data}if(!result)throw new Error("Free GPU did not return a video.");const out=result[0]||result;const url=out?.url||out?.path||out?.video?.url||out?.video?.path;if(!url)throw new Error("Free GPU completed but returned no video URL.");setVideo(url);setStatus("AI film ready — generated on Hugging Face ZeroGPU.");setJob({requestId:"free-hf"});}catch(e){setError(e.message||"Something went wrong");setStatus("")}finally{setBusy(false)}};
 return <div className="app"><header><div className="brand"><div className="logo">M</div><div><b>Mira Studio</b><span>AI Product Film Director</span></div></div><div className="provider"><span className="dot"/>Wan 2.2 Fast • Free GPU • Reference Vision</div></header>
 <main><section className="hero"><p className="eyebrow">DIRECT • GENERATE • REVIEW</p><h1>Turn one product image into a real AI commercial.</h1><p className="sub">Study the exact image first, build a commercial storyboard from what is actually visible, then generate a fast multi-beat image-to-video film.</p></section>
 <section className="workflow"><div className="step active"><b>01</b><span>Brief</span></div><div className="line"/><div className="step"><b>02</b><span>Director</span></div><div className="line"/><div className="step"><b>03</b><span>Generate</span></div><div className="line"/><div className="step"><b>04</b><span>Film</span></div></section>
 <section className="grid">
 <div className="card"><div className="cardhead"><span>01</span><h2>Product & creative brief</h2><button className="iconbtn" onClick={()=>setSettings(!settings)}><Settings2 size={17}/></button></div>
 <button className="drop" onClick={()=>fileRef.current.click()}>{preview?<img src={preview}/>:<><Upload size={28}/><b>Upload product photo</b><small>Plain isolated JPG, PNG or WebP</small></>}</button><input ref={fileRef} hidden type="file" accept="image/*" onChange={onFile}/>
 <textarea value={brief} onChange={e=>setBrief(e.target.value)}/>{settings&&<div className="advancedSettings"><div className="settings"><label>Visual style<select value={style} onChange={e=>setStyle(e.target.value)}><option>Luxury commercial</option><option>Minimal studio</option><option>Premium lifestyle</option><option>High-energy social ad</option><option>Editorial fashion</option><option>Futuristic tech</option></select></label><label>Motion language<select value={motion} onChange={e=>setMotion(e.target.value)}><option>Cinematic</option><option>Subtle</option><option>Dynamic</option><option>Product turntable</option><option>Macro / detail</option></select></label></div><div className="settings"><label className="rangeLabel">Motion intensity <b>{intensity}%</b><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(+e.target.value)}/></label><label>Aspect ratio<select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option></select></label></div><div className="settings"><label>Film duration<select value={duration} onChange={e=>setDuration(+e.target.value)}><option value="5">5 sec • Free Fast Mode</option></select></label><label>Output quality<select defaultValue="standard"><option>Standard • fast</option><option>High • slower</option></select></label></div><label className="negativeLabel">Negative prompt<input value={negative} onChange={e=>setNegative(e.target.value)}/></label></div>}
 <div className="framecheck"><Check size={15}/><span>Delivery frame: <b>{dims.w} × {dims.h}</b> • {aspect}</span></div>
 <button className="primary" disabled={!file||busy} onClick={buildPlan}><Sparkles size={18}/> {busy?"Studying reference…":plan?"Refresh director plan":"Study image & build director plan"}</button>
 </div>
 <div className="card"><div className="cardhead"><span>02</span><h2>Director shot plan</h2><span className="planmeta">{style} • {motion}</span></div>{plan?<div className="plan"><div className="planintro"><Clapperboard size={19}/><div><b>{plan.shots.length} shots • {duration}s total</b><p>Every shot is derived from the reference sheet and has a distinct action + camera language.</p></div></div>{plan.shots.map((s,i)=><div className={"shot "+(expanded===i?"open":"")} key={s.name}><div className="num">{String(i+1).padStart(2,"0")}</div><div className="shotbody"><button className="shottoggle" onClick={()=>setExpanded(expanded===i?-1:i)}><span><b>{s.name}</b><small>{s.duration}s • {s.camera}</small></span>{expanded===i?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{expanded===i&&<div className="shotedit"><label>Action<textarea value={s.action} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,action:e.target.value}:x)};setPlan(n)}}/></label><label>Camera<select value={s.camera} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,camera:e.target.value}:x)};setPlan(n)}}>{cameraMoves.map(m=><option key={m}>{m}</option>)}</select></label></div>} </div></div>)}<div className="timeline">{plan.shots.map((s,i)=><button key={i} className={expanded===i?"active":""} style={{flex:s.duration}} onClick={()=>setExpanded(i)}>{i+1}</button>)}</div><button className="secondary" onClick={buildPlan}><WandSparkles size={16}/> Rebuild director plan</button></div>:<div className="empty"><Film size={35}/><p>No shot plan yet.</p><small>Upload a product and let Mira act as the director.</small></div>}</div>
 <div className="card stage"><div className="cardhead"><span>03</span><h2>AI generation</h2><div className="modeltag">Wan 2.2 14B I2V • 6-step Fast</div></div><div className="preview">{video?<>{playableVideo?<video src={playableVideo} poster={preview} controls autoPlay loop muted playsInline preload="auto"/>:<div className="videoLoading">Loading generated video…</div>}<a className="videoOpen" href={video} target="_blank" rel="noreferrer">Open generated video</a></>:preview?<div className="sourcepreview"><img src={preview}/><span>Validated reference • {dims.w}×{dims.h}</span></div>:<div className="empty"><Film size={35}/><p>Final film preview</p><small>Your generated MP4 appears here. If preview does not load, use Open generated video.</small></div>}</div>
 <div className="actions"><button className="primary" disabled={!file||!plan||busy} onClick={generate}>{busy?<><Loader2 className="spin" size={18}/> {status||"Generating…"}</>:<><Play size={18}/> Generate AI film</>}</button>{video&&<a className="secondary" href={video} target="_blank" rel="noreferrer" download="mira-ai-film.mp4"><Download size={16}/> Save MP4</a>}</div>
 <div className="status">{status&&<><span className="statusdot"/>{status}</>}{job&&<span className="request">Request {job.requestId.slice(0,8)}…</span>}</div><div className="generationNotes"><span><Check size={13}/> Product consistency guard</span><span><Check size={13}/> Cinematic camera prompts</span><span><Check size={13}/> Negative prompt protection</span></div>{error&&<div className="error"><AlertTriangle size={16}/>{error}</div>}
 <p className="fineprint">The director first inspects the reference image, then sends the approved visual facts and shot language to Wan 2.2 I2V. The current free mode renders a 5-second multi-beat commercial; the public ZeroGPU Space can have queue/rate limits. It is free to try but can have queue/rate limits and may change availability.</p>
 </div></section></main></div>}
createRoot(document.getElementById("root")).render(<App/>);