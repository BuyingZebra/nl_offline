/* NOMAD V091: distinguish temporary suspension from final page teardown.
 * A page kept in browser back/forward cache must never release its WebGL
 * resources. Only final navigation or an explicit dispose ends ownership.
 */
export function createAppLifecycle({
 onSuspend=()=>{},onResume=()=>{},onDispose=()=>{},now=()=>Date.now()
}={}){
 let status='active',suspends=0,resumes=0,disposals=0,lastReason=null,lastError=null;
 const events=[];
 function remember(type,reason){
  lastReason=reason;
  events.push({type,reason,at:new Date(now()).toISOString()});
  if(events.length>8)events.shift();
 }
 function invoke(callback){
  try{callback();}catch(error){lastError=String(error?.message||error).slice(0,240);}
 }
 function suspend(reason='background'){
  if(status!=='active')return false;
  status='suspended';suspends++;remember('suspend',reason);
  invoke(()=>onSuspend(reason));
  return true;
 }
 function resume(reason='foreground'){
  if(status!=='suspended')return false;
  status='active';resumes++;remember('resume',reason);
  invoke(()=>onResume(reason));
  return true;
 }
 function dispose(reason='navigation'){
  if(status==='disposed')return false;
  if(status==='active')suspend(reason);
  status='disposed';disposals++;remember('dispose',reason);
  invoke(()=>onDispose(reason));
  return true;
 }
 function pageHide(persisted){
  return persisted?suspend('bfcache'):dispose('navigation');
 }
 function pageShow(persisted){
  return persisted?resume('bfcache'):false;
 }
 function snapshot(){
  return {status,suspends,resumes,disposals,lastReason,lastError,
   events:events.map(event=>({...event}))};
 }
 return Object.freeze({suspend,resume,dispose,pageHide,pageShow,snapshot,
  get canWork(){return status==='active';},
  get status(){return status;}
 });
}

/* The renderer owns its compositor, scene meshes, UI CanvasTextures and audio.
 * Teardown is idempotent and continues when an individual dispose throws.
 * No cleanup is triggered by temporary visibility loss or bfcache entry.
 */
export function createGraphicsCleanup({
 renderer,compositor,scene,textures=[],canvases=[],getAudioContext=()=>null
}={}){
 let done=false;const errors=[];
 function safe(name,callback){
  try{callback();}catch(error){
   errors.push({name,error:String(error?.message||error).slice(0,160)});
  }
 }
 function dispose(){
  if(done)return false;
  done=true;
  safe('compositor',()=>compositor?.dispose?.());
  const geometries=new Set(),materials=new Set();
  safe('scene-traverse',()=>scene?.traverse?.(object=>{
   if(object.geometry)geometries.add(object.geometry);
   const material=object.material;
   if(Array.isArray(material)){
    for(const item of material)if(item)materials.add(item);
   }else if(material)materials.add(material);
  }));
  for(const geometry of geometries)safe('geometry',()=>geometry.dispose?.());
  for(const material of materials)safe('material',()=>material.dispose?.());
  for(const texture of new Set(textures))if(texture)
   safe('texture',()=>texture.dispose?.());
  safe('renderer',()=>renderer?.dispose?.());
  for(const canvas of new Set(canvases))if(canvas)safe('canvas',()=>{
   canvas.width=1;canvas.height=1;
  });
  safe('audio',()=>{
   const audio=getAudioContext();
   const result=audio?.close?.();
   if(result?.catch)result.catch(()=>{});
  });
  return true;
 }
 return Object.freeze({dispose,
  get disposed(){return done;},
  get errors(){return errors.map(e=>({...e}));}
 });
}
