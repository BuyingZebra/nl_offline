/* NOMAD V095 — button-only luminance response for all Canvas2D buttons.
 * Pure time/geometry state; the renderer draws this as one small GPU shader
 * over the composited screen, avoiding repeated CanvasTexture uploads.
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

// The button-only luminance pass runs AFTER board-popup compositing and BEFORE
// glow, tint and other CRT effects. The global bloom produces all visible glow.
export const BUTTON_FEEDBACK_VERTEX=String.raw`
varying vec2 vUv;
void main(){
 vUv=uv;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

export const BUTTON_FEEDBACK_FRAGMENT=String.raw`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uViewport;
uniform vec4 uRects[${MAX_BUTTON_FLASHES}];
uniform float uPower[${MAX_BUTTON_FLASHES}];
varying vec2 vUv;
void main(){
  vec2 p=vec2(vUv.x*uViewport.x,(1.0-vUv.y)*uViewport.y);
  float flash=0.0;
  for(int i=0;i<${MAX_BUTTON_FLASHES};i++){
    float power=uPower[i];
    if(power<=0.0001)continue;
    vec2 lo=uRects[i].xy;
    vec2 hi=lo+uRects[i].zw;
    // No halo, rim, or pixels outside the original button rectangle.
    float inside=step(lo.x,p.x)*step(p.x,hi.x)*
                 step(lo.y,p.y)*step(p.y,hi.y);
    flash=max(flash,power*inside);
  }
  // At the peak the button reaches white (100% source luminance),
  // then returns smoothly to its untouched grayscale appearance.
  // The existing global bloom pass supplies the entire phosphor glow.
  vec3 original=texture2D(tDiffuse,vUv).rgb;
  gl_FragColor=vec4(mix(original,vec3(1.0),clamp(flash,0.0,1.0)),1.0);
}`;
