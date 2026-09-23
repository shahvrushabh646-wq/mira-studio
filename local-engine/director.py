import re
from config import DEFAULT_NEGATIVE
HINTS={
"classroom":"Animate the visible classroom naturally: teacher/student gestures, writing, page movement and subtle body motion. Do not invent people or objects.",
"people":"Animate natural breathing, head/eye movement, hair and clothing while preserving faces and proportions.",
"event":"Animate the visible event and crowd naturally. Do not invent attendees or unrelated activity.",
"nature":"Animate only visible environmental motion such as leaves, water, clouds, animals and light.",
"product":"Use a premium product treatment only when the reference is actually a product: controlled hero push-in/orbit and stable branding.",
"generic":"Animate only what the reference visibly contains."
}
def scene(text):
    t=(text or "").lower()
    for name,pat in [("classroom","classroom|teacher|student|lecture|blackboard|whiteboard|school"),("people","people|person|portrait|man|woman|boy|girl"),("event","festival|crowd|concert|wedding|parade|celebration"),("nature","forest|mountain|beach|river|lake|animal|tree|flower|landscape"),("product","product|bottle|packaging|gadget|sneaker|logo")]:
        if re.search(pat,t):return name
    return "generic"
def director_prompt(director,brief=""):
    d=director or {}; s=d.get("scene") or scene(" ".join(map(str,d.values()))+" "+brief)
    return "\n".join(["The uploaded image is the absolute visual source of truth.",HINTS[s],"USER BRIEF: "+brief,f"SCENE: {d.get('scene',s)}",f"SUBJECTS: {d.get('subject','visible subjects only')}",f"ACTION: {d.get('action','natural motion supported by the image')}",f"CAMERA: {d.get('camera','slow cinematic movement')}",f"LIGHTING: {d.get('lighting','preserve existing lighting')}",f"ENVIRONMENT: {d.get('environment','only visible elements')}",f"PRESERVATION: {d.get('preservation','preserve identity, anatomy, objects, architecture, colors and readable text')}", "Realistic motion, physically plausible movement, stable geometry, natural depth.", "Avoid morphing, face distortion, identity drift, extra limbs, duplicated subjects, invented text, flicker and impossible motion."])
def shot_prompt(shot,director,brief,index,total):
    return director_prompt(director,brief)+f"\nSHOT {index}/{total}. Duration {shot.get('duration',4)}s. Action: {shot.get('action','natural motion')}. Camera: {shot.get('camera','slow push-in')}. Framing: {shot.get('framing',shot.get('name','cinematic'))}. Continuity: {shot.get('continuity','same scene, people, clothing, objects and lighting')}."
def negative_for(shot=None,extra=""):return ", ".join(x for x in [DEFAULT_NEGATIVE,(shot or {}).get("negative_prompt",""),extra] if x)
