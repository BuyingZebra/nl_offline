/* NOMAD V094 — temporary phosphor response for all Canvas2D buttons.
 * Pure time/geometry state; the renderer draws this as one small GPU shader
 * over its current screen, avoiding repeated full-screen CanvasTexture uploads.
 */
export const MAX_BUTTON_FLASHES=8;
export const BUTTON_FLASH_PEAK_MS=90;
export const BUTTON_AFTERGLOW_MS=410;
export const BUTTON_FLASH_TOTAL_MS=BUTTON_FLASH_PEAK_MS+BUTTON_AFTERGLOW_MS;

export function createButtonFeedback({capacity=MAX_BUTTON_FLASHES}={}){
 const hits=[];
 const limit=Math.max(1,Math.min(MAX_BUTTON_FLASHES,Math.floor(capacity)||1));
 function press(rect,now){
  if(!rect||!Number.isFinite(now))return false;
  const {x,y,w,h}=rect;
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return false;
  // Restart the same button's pulse on repeated taps; never leak entries.
  const existing=hits.findIndex(hit=>hit.x===x&&hit.y===y&&hit.w===w&&hit.h===h);
  if(existing!==-1)hits.splice(existing,1);
  hits.push({x,y,w,h,at:now});
  if(hits.length>limit)hits.shift();
  return true;
 }
 function sample(now){
  if(!Number.isFinite(now))return [];
  for(let i=hits.length-1;i>=0;i--){
   if(now-hits[i].at>=BUTTON_FLASH_TOTAL_MS)hits.splice(i,1);
  }
  return hits.map(hit=>{
   const age=Math.max(0,now-hit.at);
   const fade=age<=BUTTON_FLASH_PEAK_MS?1:
    Math.max(0,1-(age-BUTTON_FLASH_PEAK_MS)/BUTTON_AFTERGLOW_MS);
   return Object.freeze({x:hit.x,y:hit.y,w:hit.w,h:hit.h,
    // Short luminance peak followed by a fast, smooth phosphor decay.
    power:fade*fade});
  });
 }
 function clear(){const had=hits.length>0;hits.length=0;return had;}
 return Object.freeze({press,sample,clear,
  get count(){return hits.length;}
 });
}

// Rendered as an additive grayscale source BEFORE the existing CRT passes:
// it gains exactly the active phosphor tint, bloom and vignette of the game.
// The pixel-space rounded-rectangle approximation deliberately retains
// NOMAD's square corners and keeps afterimages on the original button bounds.
export const BUTTON_FEEDBACK_VERTEX=String.raw`
varying vec2 vUv;
void main(){
 vUv=uv;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

export const BUTTON_FEEDBACK_FRAGMENT=String.raw`
precision highp float;
uniform vec2 uViewport;
uniform vec4 uRects[${MAX_BUTTON_FLASHES}];
uniform float uPower[${MAX_BUTTON_FLASHES}];
varying vec2 vUv;
void main(){
 vec2 p=vec2(vUv.x*uViewport.x,(1.0-vUv.y)*uViewport.y);
 float energy=0.0;
 for(int i=0;i<${MAX_BUTTON_FLASHES};i++){
  float power=uPower[i];
  if(power<=0.0001)continue;
  vec2 lo=uRects[i].xy;
  vec2 hi=lo+uRects[i].zw;
  vec2 outside=max(max(lo-p,p-hi),vec2(0.0));
  float distance=length(outside);
  float face=1.0-smoothstep(0.0,1.2,distance);
  float innerDist=min(min(p.x-lo.x,hi.x-p.x),
                     min(p.y-lo.y,hi.y-p.y));
  float rim=face*(1.0-smoothstep(0.0,2.4,innerDist));
  // The near-field glow stays inside/around the original button outline
  // and decays with the pulse: no indefinite screen burn or ghost textures.
  float halo=exp(-distance*distance/(2.0*11.0*11.0));
  energy+=power*(face*.42+rim*.36+halo*.22);
 }
 gl_FragColor=vec4(vec3(clamp(energy,0.0,1.0)),1.0);
}`;
