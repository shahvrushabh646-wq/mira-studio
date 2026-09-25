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

function parseDirectorObject(analysis=""){
 try{const text=String(analysis).match(/\{[\s\S]*\}/)?.[0];if(!text)return null;const value=JSON.parse(text);return{scene:String(value.scene||value.scene_summary||""),story:String(value.story||value.story_arc||value.narrative||""),subjects:Array.isArray(value.subjects)?value.subjects:[]}}catch{return null}
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

function renderLocalClassMotion({imageUrl,aspect,duration,story,brief,onProgress}){
 return new Promise((resolve,reject)=>{
  const reference=new Image();reference.onerror=()=>reject(new Error("The selected reference image could not be opened."));
  reference.onload=()=>{
   const canvas=document.createElement("canvas");canvas.width=aspect==="9:16"?720:1280;canvas.height=aspect==="9:16"?1280:720;
   const ctx=canvas.getContext("2d");if(!ctx){reject(new Error("This browser cannot render a classroom video."));return}
   const stream=canvas.captureStream(24),mimeType=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));
   if(!mimeType){stream.getTracks().forEach(t=>t.stop());reject(new Error("This browser cannot export WebM video. Try Chrome or Edge."));return}
   let recorder;try{recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2600000})}catch(e){stream.getTracks().forEach(t=>t.stop());reject(e);return}
   const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
   recorder.onerror=()=>{stream.getTracks().forEach(t=>t.stop());reject(new Error("The browser stopped the local recording."))};
   recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(!chunks.length){reject(new Error("No frames were recorded. Try a shorter clip."));return}resolve(new Blob(chunks,{type:mimeType}))};
   const W=canvas.width,H=canvas.height,seconds=Math.min(300,Math.max(4,Number(duration)||15)),topic=String(brief||"Classroom lesson").replace(/\s+/g," ").split(/[.!?\n]/)[0].slice(0,58),sentences=String(story||brief||"The teacher introduces the lesson, explains an idea on the board, and invites the class to try it.").match(/[^.!?]+[.!?]?/g)||[],captions=sentences.map(x=>x.trim()).filter(Boolean),scale=Math.min(W/1280,H/720),charH=Math.min(H*.27,W*.36),skin="#bd8768",ink="#f3efd9",board={x:W*.105,y:H*.09,w:W*.79,h:H*.43};
   const round=(x,y,w,h,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()};
   const label=(value,x,y,maxW,size,color=ink,weight=600)=>{ctx.font=`${weight} ${size}px system-ui`;ctx.fillStyle=color;let text=String(value||"");while(text.length>3&&ctx.measureText(text).width>maxW)text=text.slice(0,-2)+"…";ctx.fillText(text,x,y)};
   const drawPerson=(x,ground,clothes,gesture,bob=0,isTeacher=false)=>{
    const h=charH*(isTeacher?1:.77),head=h*.19,shoulder=ground-h*.59+bob,headY=ground-h*.82+bob;
    ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(x,headY,head*.78,head,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#33302e";ctx.beginPath();ctx.ellipse(x,headY-head*.52,head*.82,head*.48,0,Math.PI,Math.PI*2);ctx.fill();
    round(x-h*.2,shoulder,h*.4,h*.43,h*.08,clothes);
    ctx.strokeStyle=skin;ctx.lineCap="round";ctx.lineWidth=h*.055;ctx.beginPath();ctx.moveTo(x-h*.17,shoulder+h*.08);ctx.lineTo(x-h*.26,ground-h*.12+bob);ctx.moveTo(x+h*.17,shoulder+h*.08);ctx.lineTo(x+gesture,ground-h*(isTeacher ? .54 : .11)+bob);ctx.stroke();
    if(isTeacher){ctx.fillStyle="#f2d768";ctx.beginPath();ctx.arc(x+gesture,ground-h*.54+bob,h*.025,0,Math.PI*2);ctx.fill()}
   };
   const draw=(elapsed)=>{
    const p=Math.min(1,elapsed/seconds),phase=p<.28?0:p<.72?1:2,phaseProgress=phase===0?p/.28:phase===1?(p-.28)/.44:(p-.72)/.28,bob=Math.sin(elapsed*3.8)*charH*.012;
    const wall=ctx.createLinearGradient(0,0,0,H);wall.addColorStop(0,"#ede7d9");wall.addColorStop(1,"#d9d0be");ctx.fillStyle=wall;ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#d2c7b3";ctx.fillRect(0,H*.83,W,H*.17);
    // Board, chalk writing, lesson map, and the user's image as a pinned class reference.
    round(board.x-10,board.y-10,board.w+20,board.h+20,15,"#79583d");round(board.x,board.y,board.w,board.h,8,"#183a3d");
    label("TODAY'S LESSON",board.x+board.w*.04,board.y+board.h*.18,board.w*.67,Math.max(18,W*.024),"#dfead2",700);
    label(topic,board.x+board.w*.04,board.y+board.h*.34,board.w*.67,Math.max(15,W*.02),"#fff2b3",600);
    const sx=board.x+board.w*.05,sy=board.y+board.h*.52,sw=board.w*.61,sh=board.h*.11;
    const steps=["INTRODUCE THE IDEA","EXPLAIN IT TOGETHER","CLASS PRACTICE"];
    for(let n=0;n<3;n++){const bx=sx+n*(sw/3),bw=sw/3-8;round(bx,sy,bw,sh,6,n===phase?"#d5b857":"#315659");label(["01 · START","02 · LEARN","03 · TRY"][n],bx+8,sy+sh*.62,bw-14,Math.max(9,W*.012),n===phase?"#202a26":"#d9e1d5",700)}
    ctx.strokeStyle="#eee8cc";ctx.lineWidth=Math.max(2,W*.003);ctx.beginPath();ctx.moveTo(sx,sy+sh*1.45);ctx.lineTo(sx+sw*Math.min(phaseProgress,1),sy+sh*1.45);ctx.stroke();
    // Framed uploaded image: the local renderer uses it as a lesson reference, not an AI identity transfer.
    const cardW=Math.min(board.w*.21,W*.19),cardH=cardW*reference.height/reference.width,cardX=board.x+board.w-cardW-board.w*.035,cardY=board.y+board.h*.24;
    if(cardH<board.h*.64){round(cardX-5,cardY-5,cardW+10,cardH+10,5,"#eadfbd");ctx.drawImage(reference,cardX,cardY,cardW,cardH)}
    // Teacher writes/points while seated students follow, take notes, and raise a hand.
    const ground=H*.91,teacherX=W*(W>H?.18:.49),teacherGesture=charH*(.1+.58*Math.abs(Math.sin(elapsed*1.4)));
    drawPerson(teacherX,ground,"#3f5971",teacherGesture,bob,true);
    const studentXs=W>H?[W*.56,W*.72,W*.88]:[W*.2,W*.8];
    studentXs.forEach((x,i)=>{const rise=phase===2&&i===0?Math.max(0,Math.sin(elapsed*2.2))*charH*.13:0;drawPerson(x,H*.96,i%2?"#8b5a53":"#4a7182",charH*(.09+.035*Math.sin(elapsed*2+i)),Math.sin(elapsed*2+i)*charH*.009+rise,false);round(x-charH*.3,H*.91,charH*.6,charH*.045,4,"#825d42");ctx.strokeStyle="#d8c99e";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-charH*.15,H*.89);ctx.lineTo(x+charH*(.05+.1*Math.sin(elapsed*4+i)),H*.87);ctx.stroke()});
    // Captions follow the story's beginning, explanation, and class response.
    const caption=captions.length?captions[Math.min(captions.length-1,Math.floor(p*captions.length))]:steps[phase];
    round(W*.06,H*.94,W*.88,H*.045,9,"rgba(18,22,27,.88)");ctx.textAlign="center";label(caption,W*.09,H*.972,W*.82,Math.max(12,W*.017),"#ffffff",500);ctx.textAlign="left";
    onProgress?.(p);if(p>=1){recorder.stop();return}requestAnimationFrame(now=>draw((now-start)/1000));
   };
   let start=0;recorder.start(250);requestAnimationFrame(now=>{start=now;draw(0)});
  };reference.src=imageUrl;
 });
}

function App(){
 const[quality,setQuality]=useState("draft");
 const[sceneMode,setSceneMode]=useState("source");
 const[gpuConnection,setGpuConnection]=useState("");
 const[checkingGpu,setCheckingGpu]=useState(false);
 const[file,setFile]=useState(null),[preview,setPreview]=useState(""),[playableVideo,setPlayableVideo]=useState(""),[localEngineUrl,setLocalEngineUrl]=useState(()=>["localhost","127.0.0.1"].includes(window.location.hostname)?"http://127.0.0.1:8000":""),[gpuApiKey,setGpuApiKey]=useState(""),[hfToken,setHfToken]=useState(""),[brief,setBrief]=useState("Study the uploaded image and create a coherent short video story based only on the people, objects, setting, and visible text it actually contains. Keep identities, composition, and wording consistent. Show a natural action that could follow from the scene, in a few clear story beats, with believable movement. Do not turn the image into a poster or slideshow.");
 const[engine,setEngine]=useState("freeai"),[aspect,setAspect]=useState("16:9"),[duration,setDuration]=useState(4),[visualAnalysis,setVisualAnalysis]=useState(""),[plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[video,setVideo]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState(""),[settings,setSettings]=useState(true),[style,setStyle]=useState("Natural / realistic"),[motion,setMotion]=useState("Subtle"),[intensity,setIntensity]=useState(55),[negative,setNegative]=useState("distorted face, identity drift, extra limbs, duplicated subjects, warped objects, invented text, morphing, flicker, jitter, deformed hands, watermark, low quality"),[expanded,setExpanded]=useState(0),[history,setHistory]=useState([]),[job,setJob]=useState(null),fileRef=useRef(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 useEffect(()=>{try{const u=localStorage.getItem("miraCloudGpuUrl");const k=localStorage.getItem("miraGpuApiKey");const hosted=! ["localhost","127.0.0.1"].includes(window.location.hostname);const loopback=u&&/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(u);if(u&&!(hosted&&loopback))setLocalEngineUrl(u);if(k)setGpuApiKey(k)}catch{}},[]);
 useEffect(()=>{try{if(localEngineUrl)localStorage.setItem("miraCloudGpuUrl",localEngineUrl);if(gpuApiKey)localStorage.setItem("miraGpuApiKey",gpuApiKey)}catch{}},[localEngineUrl,gpuApiKey]);
 useEffect(()=>{let cancelled=false,objectUrl="";if(!video){setPlayableVideo("");return()=>{}};setPlayableVideo("");fetch(video,{mode:"cors"}).then(r=>{if(!r.ok)throw new Error("Video download failed");return r.blob()}).then(blob=>{if(cancelled)return;objectUrl=URL.createObjectURL(blob);setPlayableVideo(objectUrl)}).catch(()=>{if(!cancelled)setPlayableVideo(video)});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[video]);
 const dims=engine==="browser"||engine==="localclass"?(aspect==="9:16"?{w:720,h:1280}:{w:1280,h:720}):engine==="freeai"?(aspect==="9:16"?{w:480,h:832}:{w:832,h:480}):(aspect==="9:16"?{w:1080,h:1920}:{w:1920,h:1080});
 const shots=useMemo(()=>parseDirectorShots(visualAnalysis,brief,duration),[visualAnalysis,brief,duration]);
 const onFile=e=>{const f=e.target.files?.[0];if(!f)return;setFile(f);setPreview(URL.createObjectURL(f));setPlan(null);setVisualAnalysis("");setVideo("");setError("");setStatus("Image loaded — ready for scene director planning.")};
 const analyzeReference=async(blob)=>{
 const vision=await Client.connect("developer0hye/Qwen2.5-VL-7B-Instruct",hfToken.trim()?{hf_token:hfToken.trim()}:undefined);
 const prompt=`${sceneMode==="lecture"?"The user chose ACTIVE CLASSROOM LESSON. Analyze this upload for the instructor's appearance and lesson topic. Treat a classroom, board, and students as proposed staging if they are not visible; never report staged details as image facts.":"The user chose ANIMATE UPLOADED SCENE. Describe only what is visible and ground the story in the image."} Examine the uploaded image closely. Read clear wording. Identify who and what is visible, their positions, poses, clothing, expressions, important objects and text, scene/background, framing, and uncertainties. Do not guess obscured details.

Return ONLY compact valid JSON, no markdown, with this shape: {"scene":"2 concise sentences about the visible image; distinguish visible facts from staging","subjects":[{"description":"appearance or object","position":"where in frame","pose":"visible pose","action":"visible or plausible next action"}],"story":"One coherent short story with a beginning, middle and ending, grounded in the image. Clearly mark proposed actions/staging.","shots":[{"name":"beat","action":"one action in this same story","camera":"simple move","timing":"time range"}],"preserve":["key identity, objects, exact visible text"],"avoid":["unsupported changes"]}. Use up to 5 subjects and 3 timed beats for this short clip. A proposed action may be creative, but never describe it as something already visible. Keep the story physically plausible, specific to this image, and continuous rather than a montage.`;
 const r=await vision.predict("/qwen_vl_inference",[handle_file(blob),prompt]);
 return String(r?.data?.[0]||"").slice(0,7000);
};
const buildPlan=async()=>{
 if(!file)return;
 setBusy(true);setError("");
 try{
  if(engine==="localclass"){
   setStatus("Writing a local classroom story — no image is uploaded…");
   const sceneNote="Unlimited local mode does not analyze the image. The original is included as a classroom reference; use the image-analysis mode first if you want an AI-written story.";
   const localStory="The teacher introduces the lesson topic, writes a clear example on the board, and explains it while students watch and take notes. A student tries the idea, and the teacher closes the lesson with the finished board and an engaged class.";
   const generated=parseDirectorShots("classroom "+brief,brief,duration).map(s=>({...s,action:localStory}));
   setVisualAnalysis(sceneNote);setPlan({concept:brief,category:"classroom",reference:sceneNote,scene:sceneNote,story:localStory,subjects:[],shots:generated});
   setStatus("Local story ready. Edit it, then render an unlimited stylized classroom video on this device.");return;
  }
  if(engine==="browser"){
   setStatus("Building a local camera-motion plan — your image stays on this page…");
   const localNote="Local browser mode: camera movement on the still image only; subjects are not AI-animated.";
   setVisualAnalysis(localNote);const generated=parseDirectorShots(localNote,brief,duration).map(s=>({...s,action:"Keep the uploaded image unchanged; apply a smooth "+s.camera+" camera move only."}));
   setPlan({concept:brief,category:detectCategory(brief),reference:localNote,scene:"Local camera-motion mode keeps the uploaded image unchanged.",story:"A single continuous image holds on the original scene while a smooth camera move creates a short motion clip.",subjects:[],shots:generated});
   setStatus("Local plan ready. Review it, then render your motion film.");return;
  }
  setStatus("Director step 1/2 — studying the exact image, visible wording and scene…");
  const imageData=await makePreparedData();
  const blob=await (await fetch(imageData)).blob();
  let analysis="";
  try{analysis=await analyzeReference(blob);setVisualAnalysis(analysis)}
  catch(e){throw new Error("Image analysis could not reach the Hugging Face Qwen Vision service. Check the connection and try again; Mira did not create a shot plan without analyzing the image.")}
  const understanding=parseDirectorObject(analysis);
  if(!understanding?.scene||!understanding?.story)throw new Error("Mira analyzed the image but did not return a complete scene and story. Please retry the analysis.");
  const generated=parseDirectorShots(analysis,brief,duration);
  setPlan({concept:brief,category:detectCategory(analysis+" "+brief),reference:analysis,scene:understanding.scene,story:understanding.story,subjects:understanding.subjects,shots:generated});
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
  const prompt=[`Create a realistic ${style.toLowerCase()} image-to-video clip with actual subject movement, not a still image with camera zoom.`,sceneMode==="lecture"?`Educational reference analysis (use only instructor appearance and topic): ${visualAnalysis}`:visualAnalysis,`Image-grounded story: ${plan?.story||brief}`,`Scene direction: ${brief}`,`Director beat: ${shot}`,`Camera: ${motion.toLowerCase()} movement at ${intensity}% intensity.`,lecturePrompt,`Avoid: ${negative}`].filter(Boolean).join(" ").slice(0,6000);
  setStatus("Connecting to Hugging Face’s shared free Wan 2.2 GPU…");
  const client=await Client.connect("r3gm/wan2-2-fp8da-aoti-preview",hfToken.trim()?{hf_token:hfToken.trim()}:undefined);
  setStatus("Waiting for shared GPU, then generating real subject motion… this may take a few minutes.");
  const result=await client.predict("/generate_video",[handle_file(imageBlob),null,prompt,quality==="professional"?8:4,`${negative}, static image, camera zoom only`,Math.min(4,Number(duration)||4),1,1,Math.floor(Math.random()*2147483647),true,quality==="professional"?7:5,"UniPCMultistep",3,16,true,true,true]);
  const output=result?.data?.[0];const remoteUrl=typeof output==="string"?output:(output?.url||output?.video?.url||output?.path||output?.video?.path);
  if(!remoteUrl)throw new Error("Wan 2.2 finished without returning a video. Try again later.");
  let videoUrl=remoteUrl;if(!/^https?:|^blob:|^data:/i.test(videoUrl))videoUrl=new URL(videoUrl,"https://r3gm-wan2-2-fp8da-aoti-preview.hf.space").href;
  setVideo(videoUrl);setJob({requestId:"mira-zerogpu-"+Date.now(),segments:1});setStatus("Real AI classroom motion is ready. Preview it and save the MP4.");
 }catch(e){
  const raw=String(e?.message||e||"Wan 2.2 generation failed");
  setError(/quota|limit|queue|gpu|503|429|unavailable|connect|fetch/i.test(raw)?`The free shared GPU is busy or your daily quota is used. Your image was not animated. Try later, or enter an optional Hugging Face read token in Generation mode to use your account quota. Tokens still have limits; local camera motion is the no-quota fallback. (${raw})`:raw);setStatus("");
 }finally{setBusy(false)}
};
const generateLocalClass=async()=>{
 setBusy(true);setError("");setVideo("");setPlayableVideo("");
 try{setStatus("Rendering your classroom story locally on this device…");const blob=await renderLocalClassMotion({imageUrl:preview,aspect,duration,story:plan?.story||brief,brief,onProgress:p=>setStatus("Rendering unlimited local classroom video… "+Math.round(p*100)+"%")});const url=URL.createObjectURL(blob);setVideo(url);setPlayableVideo(url);setJob({requestId:"mira-local-class-"+Date.now(),segments:plan?.shots?.length||1});setStatus("Your local classroom video is ready to preview and download.")}catch(e){setError(String(e?.message||e||"Local classroom rendering failed."));setStatus("")}finally{setBusy(false)}
};
const generate=async()=>{
 if(!file||!plan)return;
 if(engine==="browser"){void generateBrowser();return}
 if(engine==="localclass"){void generateLocalClass();return}
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
ONE IMAGE-GROUNDED STORY:
${plan?.story||brief}
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
return <div className="app"><header><div className="brand"><div className="logo">M</div><div><b>Mira Studio</b><span>AI Image-to-Scene Director</span></div></div><div className="provider"><span className="dot"/>{engine==="browser"?"Local camera motion":engine==="localclass"?"Unlimited local classroom video":engine==="freeai"?"Free shared Wan 2.2 AI":"Wan 2.2 • Dedicated GPU mode"}</div></header>
 <main><section className="hero"><p className="eyebrow">MIRA DIRECTOR <span>V2</span></p><h1>From a single image to a directed scene.</h1><p className="sub">A professional image-to-video workflow: visual understanding → shot direction → generation → review. Mira keeps the reference image as the source of truth instead of forcing every scene into a generic ad.</p></section>
 <section className="workflow"><div className="step active"><b>01</b><span>Reference</span></div><div className="line"/><div className="step"><b>02</b><span>Director</span></div><div className="line"/><div className="step"><b>03</b><span>Generate</span></div><div className="line"/><div className="step"><b>04</b><span>Review</span></div></section>
 <section className="grid">
 <div className="card"><div className="cardhead"><span>01</span><h2>Image & creative direction</h2><button className="iconbtn" onClick={()=>setSettings(!settings)}><Settings2 size={17}/></button></div>
 <button className="drop" onClick={()=>fileRef.current.click()}>{preview?<img src={preview}/>:<><Upload size={28}/><b>Upload any image</b><small>Class, lecture, people, event, product, nature — JPG, PNG or WebP</small></>}</button><input ref={fileRef} hidden type="file" accept="image/*" onChange={onFile}/>
 <div className="promptLabel"><label>Creative direction <span>Tell Mira exactly how you want the image to become a video</span></label><textarea className="creativePrompt" value={brief} onChange={e=>setBrief(e.target.value)} placeholder="Example: Make the teacher start writing on the board, students look toward the board, camera slowly moves from the back of the classroom toward the teacher, natural hand and head movement, realistic lighting, no new people or objects."/></div>{settings&&<div className="advancedSettings"><div className="settings"><label>Scene format<select value={sceneMode} onChange={e=>setSceneMode(e.target.value)}><option value="source">Animate the uploaded scene • keep its subjects and setting</option><option value="lecture">Active classroom lesson • add teacher + students</option></select></label><label>Visual style<select value={style} onChange={e=>setStyle(e.target.value)}><option>Cinematic</option><option>Natural / realistic</option><option>Documentary</option><option>Dramatic</option><option>Premium commercial</option><option>Editorial</option></select></label><label>Motion language<select value={motion} onChange={e=>setMotion(e.target.value)}><option>Cinematic</option><option>Subtle</option><option>Dynamic</option><option>Subject follow</option><option>Orbit / tracking</option><option>Macro / detail</option></select></label></div><div className="settings"><label className="rangeLabel">Motion intensity <b>{intensity}%</b><input type="range" min="0" max="100" value={intensity} onChange={e=>setIntensity(+e.target.value)}/></label><label>Aspect ratio<select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option></select></label></div><div className="settings"><label>Film duration<select value={duration} onChange={e=>setDuration(+e.target.value)}><option value="4">{engine==="localclass"?"4 sec • local clip":"4 sec • AI motion"}</option><option value="5" disabled={engine!=="personal"&&engine!=="localclass"}>{engine==="localclass"?"5 sec • local clip":"5 sec • AI motion"}</option><option value="7" disabled={engine==="browser"||engine==="freeai"}>{engine==="localclass"?"7 sec • local clip":"7 sec • 2 AI segments"}</option><option value="15" disabled={engine==="freeai"}>{engine==="localclass"?"15 sec • local clip":"15 sec • 4 AI segments"}</option><option disabled={engine==="browser"||engine==="freeai"} value="30">{engine==="localclass"?"30 sec • local clip":"30 sec • 8 AI segments"}</option><option disabled={engine==="browser"||engine==="freeai"} value="60">{engine==="localclass"?"60 sec • local clip":"60 sec • 15 AI segments"}</option><option disabled={engine==="browser"||engine==="freeai"} value="120">{engine==="localclass"?"120 sec • local clip":"120 sec • 20 AI segments"}</option><option disabled={engine==="browser"||engine==="freeai"} value="300">{engine==="localclass"?"300 sec • local clip":"300 sec • 49 AI segments"}</option></select></label><label>Output quality<select value={quality} onChange={e=>setQuality(e.target.value)}><option value="draft">{engine==="localclass"?"Fast local render":"Fast draft • shorter GPU wait"}</option><option value="professional">Professional • more detail, slower</option></select></label></div><div className="engineControls"><label>Generation mode<select value={engine} onChange={e=>{setEngine(e.target.value);if(e.target.value==="browser"&&duration>15)setDuration(15);if(e.target.value==="freeai"&&duration>5)setDuration(4);if(e.target.value!=="localclass")setPlan(null);setVideo("");setError("")}}><option value="localclass">Free local classroom animation • stylized</option><option value="freeai">Photoreal AI video • shared daily GPU limit</option><option value="browser">Local camera motion - instant</option><option value="personal">AI video - my Wan 2.2 GPU server</option></select></label>{engine==="personal"?<><label>Wan 2.2 GPU API URL<input value={localEngineUrl} onChange={e=>{setLocalEngineUrl(e.target.value);setGpuConnection("")}} placeholder="https://your-dedicated-wan-gpu.example.com"/></label><div className="gpuConnect"><button className="secondary" disabled={checkingGpu||busy} onClick={testGpuConnection}>{checkingGpu?<><Loader2 className="spin" size={15}/> Checking GPU...</>:"Test GPU connection"}</button>{gpuConnection&&<p className={gpuConnection.startsWith("Ready")?"gpuReady":"gpuWarning"}>{gpuConnection}</p>}</div><label>GPU API key (if required)<input type="password" value={gpuApiKey} onChange={e=>{setGpuApiKey(e.target.value);setGpuConnection("")}} placeholder="Only for your dedicated GPU"/></label><label>AI engine status<input value={"Wan 2.2 - real generated subject motion"} readOnly/></label></>:engine==="localclass"?<div className="browserModeNote"><b>Unlimited renders • free • on this device</b><span>Creates a silent, stylized 2D classroom video with an animated teacher writing on the board and students taking notes. No GPU, cloud, login, or per-video quota. The uploaded picture is shown as a reference card; this local mode cannot identify image contents or make photoreal AI motion. Use the AI analysis mode once, then switch here to reuse its story for unlimited local renders. Length is limited to 5 minutes per clip by Mira; your device controls practical speed and storage.</span></div>:engine==="freeai"?<div className="browserModeNote"><b>AI video • free shared GPU</b><span>Wan 2.2 animates your uploaded scene. Shared GPU has daily limits and a queue. Generates a silent clip of up to 4 seconds; your image is sent to Hugging Face.</span><label>Optional Hugging Face token<input type="password" autoComplete="off" value={hfToken} onChange={e=>setHfToken(e.target.value)} placeholder="hf_… (leave blank to try without one)"/><small><a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">Create a read token</a>. Sent directly to Hugging Face for analysis and generation; Mira does not save it. A token may add account quota, but GPU use is still limited.</small></label></div>:<div className="browserModeNote"><b>Runs on this page</b><span>Your image stays in your browser. Mira exports a smooth camera-motion video as WebM. People and objects remain still; choose Free AI video to animate them.</span></div>}<label className="negativeLabel">Negative prompt<input value={negative} onChange={e=>setNegative(e.target.value)}/></label></div></div>}
 <div className="framecheck"><Check size={15}/><span>Delivery frame: <b>{dims.w} × {dims.h}</b> • {aspect}</span></div>
 <p className="fineprint visionDisclosure">{engine==="browser"?"No upload, API key or GPU: Mira makes a camera-motion plan locally from your direction.":engine==="localclass"?"Unlimited classroom renders stay on this device. This mode does not send the image to a vision or video AI.":engine==="freeai"?"Image analysis and video generation use Hugging Face public services. The source image is sent to those services.":"Image analysis uses the public Hugging Face Qwen Vision Space. Video generation stays on your configured Wan 2.2 GPU."}</p><button className="primary" disabled={!file||busy} onClick={buildPlan}><Sparkles size={18}/> {busy?"Studying reference…":plan?"Refresh director plan":engine==="browser"?"Create local motion plan":engine==="localclass"?(plan?"Refresh local story":"Write local story"):"Analyze image & write story"}</button>
 </div>
 <div className="card"><div className="cardhead"><span>02</span><h2>Image understanding & story</h2><span className="planmeta">{style} • {motion}</span></div>{plan?<div className="plan"><div className="planintro"><Clapperboard size={19}/><div><b>{plan.shots.length} shots • {duration}s total</b><p>{engine==="browser"?"Local edit plan: every shot preserves the source image and changes only the camera move.":"Review the scene understanding and one story, then generate the video."}</p></div></div><div className="storyCard"><span className="storyLabel">WHAT MIRA SAW</span><p>{plan.scene||"Local camera-motion edit"}</p>{plan.subjects?.length>0&&<small>{plan.subjects.slice(0,5).map(x=>typeof x==="string"?x:x.description).filter(Boolean).join(" • ")}</small>}<label className="storyLabel">ONE STORY — EDIT BEFORE GENERATING<textarea className="storyText" value={plan.story||""} onChange={e=>setPlan({...plan,story:e.target.value})}/></label></div>{plan.shots.map((s,i)=><div className={"shot "+(expanded===i?"open":"")} key={s.name}><div className="num">{String(i+1).padStart(2,"0")}</div><div className="shotbody"><button className="shottoggle" onClick={()=>setExpanded(expanded===i?-1:i)}><span><b>{s.name}</b><small>{s.duration}s • {s.camera}</small></span>{expanded===i?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{expanded===i&&<div className="shotedit"><label>Action<textarea value={s.action} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,action:e.target.value}:x)};setPlan(n)}}/></label><label>Camera<select value={s.camera} onChange={e=>{const n={...plan,shots:plan.shots.map((x,k)=>k===i?{...x,camera:e.target.value}:x)};setPlan(n)}}>{cameraMoves.map(m=><option key={m}>{m}</option>)}</select></label></div>} </div></div>)}<div className="timeline">{plan.shots.map((s,i)=><button key={i} className={expanded===i?"active":""} style={{flex:s.duration}} onClick={()=>setExpanded(i)}>{i+1}</button>)}</div><button className="secondary" onClick={buildPlan}><WandSparkles size={16}/> Rebuild director plan</button></div>:<div className="empty"><Film size={35}/><p>No shot plan yet.</p><small>Upload an image and let Mira study it before acting as the scene director.</small></div>}</div>
 <div className="card stage"><div className="cardhead"><span>03</span><h2>{engine==="browser"?"Local video render":engine==="localclass"?"Unlimited local classroom render":"AI generation"}</h2><div className="modeltag">{engine==="browser"?"Browser - no GPU":engine==="localclass"?"Local 2D classroom • no quota":engine==="personal"?"Wan 2.2 - Personal GPU":engine==="freeai"?"Wan 2.2 - shared ZeroGPU":"Wan 2.2 - Real AI I2V"}</div></div><div className="preview">{video?<>{playableVideo?<video src={playableVideo} poster={preview} controls autoPlay loop muted playsInline preload="auto"/>:<div className="videoLoading">Loading generated video…</div>}<a className="videoOpen" href={video} target="_blank" rel="noreferrer">Open generated video</a></>:preview?<div className="sourcepreview"><img src={preview}/><span>Validated reference • {dims.w}×{dims.h}</span></div>:<div className="empty"><Film size={35}/><p>Final film preview</p><small>Your generated film appears here. If the embedded preview does not load, use Open generated video.</small></div>}</div>
<div className="actions"><button className="primary" disabled={!file||!plan||busy} onClick={generate}>{busy?<><Loader2 className="spin" size={18}/> {status||"Generating…"}</>:<><Play size={18}/> {engine==="browser"?"Render camera-motion film":engine==="localclass"?"Render unlimited local classroom video":"Generate real AI video"}</>}</button>{video&&<a className="secondary" href={video} target="_blank" rel="noreferrer" download={engine==="localclass"?"mira-studio-classroom.webm":engine==="browser"?"mira-motion-film.webm":"mira-ai-film.mp4"}><Download size={16}/> {engine==="localclass"?"Save classroom WebM":engine==="browser"?"Save WebM":"Save MP4"}</a>}</div>
 <div className="status">{status&&<><span className="statusdot"/>{status}</>}{job&&<span className="request">Request {job.requestId.slice(0,8)}…</span>}</div><div className="generationNotes">{engine==="localclass"?<><span><Check size={13}/> Free local canvas render</span><span><Check size={13}/> Animated teacher and class</span><span><Check size={13}/> WebM export • up to 5 min</span></>:engine==="browser"?<><span><Check size={13}/> Local browser rendering</span><span><Check size={13}/> Cinematic camera movement</span><span><Check size={13}/> WebM export</span></>:<><span><Check size={13}/> Real AI image-to-video</span><span><Check size={13}/> Scene-specific shot direction</span><span><Check size={13}/> Identity / text protection</span></>}</div>{error&&<div className="error"><AlertTriangle size={16}/>{error}</div>}
 <p className="fineprint">{engine==="browser"?"Local mode creates an instant camera-motion video; people and objects remain still.":engine==="localclass"?"Unlimited stylized 2D classroom videos render on your device. They are not photoreal AI image-to-video.":engine==="freeai"?"Wan 2.2 creates real movement for up to 4 seconds from your image. Free shared GPU access is subject to daily quotas and queues.":"AI video mode sends generation requests to your configured Wan 2.2 GPU server."}</p>
 </div></section></main></div>}
createRoot(document.getElementById("root")).render(<App/>);
// Build-safe source marker



