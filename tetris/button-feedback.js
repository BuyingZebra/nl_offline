/* NOMAD V096 — input-owned button luminance; CRT bloom provides all glow. */
export const MAX_BUTTON_FLASHES=8;
export const BUTTON_FLASH_PEAK_MS=90;
export const BUTTON_AFTERGLOW_MS=410;
export const BUTTON_FLASH_TOTAL_MS=BUTTON_FLASH_PEAK_MS+BUTTON_AFTERGLOW_MS;
export function createButtonFeedback({capacity=MAX_BUTTON_FLASHES}={}){
 const hits=[],limit=Math.max(1,Math.min(MAX_BUTTON_FLASHES,Math.floor(capacity)||1));
 const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.w===b.w&&a.h===b.h;
 function press(r,now,held=true){
  if(!r||!Number.isFinite(now))return false;
  const {x,y,w,h}=r;
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return false;
  const existing=hits.findIndex(a=>same(a,r));
  if(existing>=0)hits.splice(existing,1);
  hits.push({x,y,w,h,mode:r.kind!=='button'?2:r.light?0:1,
   releasedAt:held?null:now+BUTTON_FLASH_PEAK_MS});
  if(hits.length>limit)hits.shift();
  return true;
 }
 function release(r,now){
  if(!r||!Number.isFinite(now))return false;
  const a=hits.find(h=>same(h,r));
  if(!a||a.releasedAt!==null)return false;
  a.releasedAt=now;return true;
 }
 function sample(now,physicalPersistence=false){
  if(!Number.isFinite(now))return [];
  for(let i=hits.length-1;i>=0;i--){
   const a=hits[i];
   if(a.releasedAt!==null&&now>=a.releasedAt&&physicalPersistence){hits.splice(i,1);continue;}
   if(a.releasedAt!==null&&now-a.releasedAt>=BUTTON_AFTERGLOW_MS)hits.splice(i,1);
  }
  return hits.map(a=>{
   const age=a.releasedAt===null?0:Math.max(0,now-a.releasedAt);
   const fade=physicalPersistence?1:Math.max(0,1-age/BUTTON_AFTERGLOW_MS);
   return Object.freeze({x:a.x,y:a.y,w:a.w,h:a.h,mode:a.mode,power:fade*fade});
  });
 }
 function clear(){const had=hits.length>0;hits.length=0;return had;}
 return Object.freeze({press,release,sample,clear,get count(){return hits.length;}});
}
export const BUTTON_FEEDBACK_VERTEX=String.raw`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
export const BUTTON_FEEDBACK_FRAGMENT=String.raw`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uViewport;
uniform vec4 uRects[${MAX_BUTTON_FLASHES}];
uniform float uPower[${MAX_BUTTON_FLASHES}];
uniform float uMode[${MAX_BUTTON_FLASHES}];
varying vec2 vUv;
void main(){
 vec2 p=vec2(vUv.x*uViewport.x,(1.0-vUv.y)*uViewport.y);
 float flash=0.0;
 float mode=0.0;
 for(int i=0;i<${MAX_BUTTON_FLASHES};i++){
  float power=uPower[i];
  if(power<=0.0001)continue;
  vec2 lo=uRects[i].xy,hi=lo+uRects[i].zw;
  float inside=step(lo.x,p.x)*step(p.x,hi.x)*step(lo.y,p.y)*step(p.y,hi.y);
  float candidate=power*inside;
  if(candidate>flash){flash=candidate;mode=uMode[i];}
 }
 vec3 original=texture2D(tDiffuse,vUv).rgb;
 if(flash<=0.0001){gl_FragColor=vec4(original,1.0);return;}
 float lum=dot(original,vec3(.2126,.7152,.0722));
 vec3 pressedColor;
 if(mode<0.5){
  // Solid face brightens; existing dark lettering and symbols stay dark.
  float face=smoothstep(.045,.17,lum);
  pressedColor=mix(original,vec3(1.0),face);
 }else if(mode<1.5){
  // Outlined face fills bright while existing ink becomes dark.
  float ink=smoothstep(.035,.14,lum);
  pressedColor=vec3(mix(1.0,.018,ink));
 }else{
  // Non-button toggles brighten existing strokes, never the entire row.
  float ink=smoothstep(.045,.17,lum);
  pressedColor=mix(original,vec3(1.0),ink);
 }
 gl_FragColor=vec4(mix(original,pressedColor,clamp(flash,0.0,1.0)),1.0);
}`;
