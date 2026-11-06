/* NOMAD V107 — source-owned button excitation.
 * Every illuminated button stroke, label, icon or solid face starts at 206
 * and reaches 255 during a press. The Canvas2D source itself animates:
 * no geometric full-screen postprocess, pressed rectangle, or extra glow.
 * Dark reversed text on filled keys remains legible and responds subtly.
 * The shared GPU phosphor decay (when enabled) supplies the afterglow.
 */
export const MAX_BUTTON_FLASHES=8;
export const BUTTON_BASE_LEVEL=206;
export const BUTTON_PEAK_LEVEL=255;
export const BUTTON_FLASH_PEAK_MS=90;
export const MIN_PRESS_FRAME_MS=34;
export const BUTTON_AFTERGLOW_MS=410;
export const BUTTON_FLASH_TOTAL_MS=BUTTON_FLASH_PEAK_MS+BUTTON_AFTERGLOW_MS;
export const buttonLevel=power=>Math.round(BUTTON_BASE_LEVEL+
 (BUTTON_PEAK_LEVEL-BUTTON_BASE_LEVEL)*Math.max(0,Math.min(1,Number(power)||0)));
export const buttonInkLevel=power=>Math.round(6+24*Math.max(0,Math.min(1,Number(power)||0)));
export function createButtonFeedback({capacity=MAX_BUTTON_FLASHES}={}){
 const hits=[],limit=Math.max(1,Math.min(MAX_BUTTON_FLASHES,Math.floor(capacity)||1));
 const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.w===b.w&&a.h===b.h;
 function press(r,now,held=true){
  if(!r||!Number.isFinite(now))return false;
  const {x,y,w,h}=r;
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return false;
  const existing=hits.findIndex(a=>same(a,r));
  if(existing>=0)hits.splice(existing,1);
  hits.push({x,y,w,h,pressedAt:now,releasedAt:held?null:now+BUTTON_FLASH_PEAK_MS});
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
   if(a.releasedAt!==null&&physicalPersistence&&
    now>=Math.max(a.releasedAt,a.pressedAt+MIN_PRESS_FRAME_MS)){
    hits.splice(i,1);continue;
   }
   if(a.releasedAt!==null&&now-a.releasedAt>=BUTTON_AFTERGLOW_MS)hits.splice(i,1);
  }
  return hits.map(a=>{
   const age=a.releasedAt===null?0:Math.max(0,now-a.releasedAt);
   const fade=physicalPersistence?1:Math.max(0,1-age/BUTTON_AFTERGLOW_MS);
   return Object.freeze({x:a.x,y:a.y,w:a.w,h:a.h,power:fade*fade});
  });
 }
 function clear(){const had=hits.length>0;hits.length=0;return had;}
 return Object.freeze({press,release,sample,clear,get count(){return hits.length;}});
}
