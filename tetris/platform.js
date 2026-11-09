import {appleAdapter} from './platform/ios.js';
import {androidAdapter} from './platform/android.js';
import {genericAdapter} from './platform/generic.js';

export function selectDeviceAdapter(win={}){
 const nav=win.navigator||{};
 if(appleAdapter.matches(nav))return appleAdapter;
 if(androidAdapter.matches(nav))return androidAdapter;
 return genericAdapter;
}

/* Build updates, viewport, WebGL health and app lifecycle. */


/* V066: one version contract; authoritative value lives in three-v027.html.
 * No stateful app or browser API dependencies, so these rules are testable.
 */
export const BUILD_META_NAME='tetris-build';
export function getBuildVersion(document){
 const version=document.querySelector('meta[name="tetris-build"]')?.getAttribute('content');
 if(!/^[0-9]{3}$/.test(version||''))throw Error('Missing or invalid Tetris build metadata');
 return version;
}
export function parsePublishedBuild(html){
 if(typeof html!=='string')return null;
 const match=html.match(/<meta\s+name=["']tetris-build["']\s+content=["']([0-9]{3})["']\s*\/?\s*>/i);
 return match?match[1]:null;
}
export function shouldReloadBuild(current,published,{hidden=false,modalOpen=false,gameStatus='ready'}={}){
 if(!/^[0-9]{3}$/.test(current||'')||!/^[0-9]{3}$/.test(published||''))return false;
 return !hidden&&!modalOpen&&gameStatus==='ready'&&Number(published)>Number(current);
}

/* NOMAD Tetris V087 — platform boundary.
 * Device viewport/safe-area measurements and page lifecycle/update checks
 * live here. All visual dimensions, polling intervals and eligibility
 * rules are retained from V086. No Canvas, game-state or WebGL ownership.
 */

const MAX_RENDER_DPR=2;
const CHECK_INTERVAL_MS=60000;
const CHECK_THROTTLE_MS=15000;

export function measureDisplayViewport(display,devicePixelRatio){
 const b=display.getBoundingClientRect();
 return Object.freeze({
  width:Math.max(1,Math.round(b.width)),
  height:Math.max(1,Math.round(b.height)),
  dpr:Math.min(MAX_RENDER_DPR,Math.max(1,devicePixelRatio||1))
 });
}

export function createPlatformManager({
 window,document,display,safeProbe,baseModuleURL,buildVersion,
 getGameStatus,isScreenOpen,onViewport,onVisibility,
 onPageHide=()=>{},onPageShow=()=>{},canReloadNewBuild=()=>true,
 stageWorkerUpdate=()=>{},deviceAdapter=null,
 now=()=>Date.now(),
 fetchPage=(url,options)=>window.fetch(url,options),
 reloadPage=()=>window.location.reload()
}){
 if(!window||!document||!display||!safeProbe||
    typeof getGameStatus!=='function'||typeof isScreenOpen!=='function'||
    typeof onViewport!=='function'||typeof onVisibility!=='function')
  throw new TypeError('Platform Manager requires device and lifecycle adapters');

 const adapter=deviceAdapter||selectDeviceAdapter(window);
 let detachDevice=()=>{};
 let measured=null,cachedInsets=null,observer=null,interval=null,started=false;
 let checkingBuild=false,lastBuildCheck=0;

 function safeInsets(){
  if(cachedInsets)return cachedInsets;
  const cs=window.getComputedStyle(safeProbe);
  cachedInsets={
   top:parseFloat(cs.paddingTop)||0,bottom:parseFloat(cs.paddingBottom)||0,
   left:parseFloat(cs.paddingLeft)||0,right:parseFloat(cs.paddingRight)||0
  };
  return cachedInsets;
 }
 function resize(forceLayout=false){
  const next=measureDisplayViewport(display,window.devicePixelRatio);
  const unchanged=measured&&next.width===measured.width&&
   next.height===measured.height&&next.dpr===measured.dpr;
  if(unchanged&&!forceLayout)return false;
  measured=next;
  cachedInsets=null;
  onViewport(next,Boolean(forceLayout));
  return true;
 }
 async function checkForNewBuild(){
  if(!started||document.hidden||checkingBuild||isScreenOpen()||
     getGameStatus()!=='ready')return false;
  const time=now();
  if(time-lastBuildCheck<CHECK_THROTTLE_MS)return false;
  checkingBuild=true;lastBuildCheck=time;
  try{
   const url=new URL('./three-v027.html?update-check='+time,baseModuleURL);
   const reply=await fetchPage(url,{cache:'no-store'});
   if(!reply.ok)return false;
   const published=parsePublishedBuild(await reply.text());
   // Check eligibility AFTER awaiting the network, not just before it.
   if(started&&shouldReloadBuild(buildVersion,published,{
    hidden:document.hidden,modalOpen:isScreenOpen(),gameStatus:getGameStatus()
   })){
    if(canReloadNewBuild()){
     reloadPage();
     return true;
    }
    // Stage the newer bundle. The browser activates it after the old clients close.
    await stageWorkerUpdate();
   }
  }catch(e){/* Offline or fetch error: keep the current playable build. */}
  finally{checkingBuild=false;}
  return false;
 }
 const onVisibilityChange=()=>{
  onVisibility(Boolean(document.hidden));
  if(!document.hidden)void checkForNewBuild();
 };
 const onWake=event=>{
  if(event?.type==='pageshow')onPageShow(Boolean(event.persisted));
  void checkForNewBuild();
 };
 const onHide=event=>onPageHide(Boolean(event?.persisted));
 const onOrientation=()=>{resize(true);};
 const onPoll=()=>{if(!document.hidden)void checkForNewBuild();};

 function start(){
  if(started)return false;
  started=true;
  adapter.applyRootMode(window.navigator||{},window,document);
  detachDevice=adapter.attach(window,()=>resize());
  observer=new window.ResizeObserver(()=>resize());
  observer.observe(display);
  window.addEventListener('orientationchange',onOrientation);
  document.addEventListener('visibilitychange',onVisibilityChange);
  window.addEventListener('pageshow',onWake);
  window.addEventListener('pagehide',onHide);
  window.addEventListener('focus',onWake);
  interval=window.setInterval(onPoll,CHECK_INTERVAL_MS);
  resize();
  return true;
 }
 function stop(){
  if(!started)return false;
  started=false;
  observer?.disconnect();observer=null;
  detachDevice();detachDevice=()=>{};
  window.removeEventListener('orientationchange',onOrientation);
  document.removeEventListener('visibilitychange',onVisibilityChange);
  window.removeEventListener('pageshow',onWake);
  window.removeEventListener('pagehide',onHide);
  window.removeEventListener('focus',onWake);
  if(interval!==null){window.clearInterval(interval);interval=null;}
  return true;
 }
 return Object.freeze({
  start,stop,resize,safeInsets,checkForNewBuild,
  get adapterId(){return adapter.id;},
  get standalone(){return adapter.standalone(window.navigator||{},window);},
  get viewport(){return measured;},
  get running(){return started;}
 });
}

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

/* Final-page cleanup must continue even if a single adapter throws.
 * Report the first failure to AppLifecycle while preserving the other disposals.
 * Each task is a [name, fn] pair to attribute failures without exposing internals.
 */
export function runCleanupTasks(tasks){
 const errors=[];
 for(const [name,fn] of tasks){
  try{fn();}catch(error){errors.push(name+': '+String(error?.message||error));}
 }
 if(errors.length)throw new Error(errors.join(' | ').slice(0,240));
 return tasks.length;
}

/* NOMAD Tetris V089 — WebGL context lifecycle and bounded diagnostics.
 * Three.js still owns the WebGLRenderer and its internal context recreation.
 * This observer prevents game activity while the context is unavailable and
 * reports recovery outcomes without storage, network calls or visible UI.
 */
export function createGraphicsHealth({
 canvas,onLost,onRestored,now=()=>Date.now(),historyLimit=8
}){
 if(!canvas||typeof canvas.addEventListener!=='function'||
    typeof canvas.removeEventListener!=='function'||
    typeof onLost!=='function'||typeof onRestored!=='function')
  throw new TypeError('Graphics health requires a canvas and lifecycle callbacks');

 let state='ready',attached=false,losses=0,restores=0,failures=0;
 let lastError=null,lostSince=null;
 const history=[];
 function record(type,detail){
  const event={type,at:new Date(now()).toISOString()};
  if(detail)event.detail=String(detail).slice(0,240);
  history.push(event);
  if(history.length>historyLimit)history.shift();
 }
 function recordFailure(error){
  failures++;
  lastError=String(error?.message||error).slice(0,240);
  record('render-error',lastError);
  if(state==='recovering')state='failed';
 }
 function contextLost(event){
  // Calling preventDefault is required by WebGL to allow restoration.
  event?.preventDefault?.();
  if(state==='lost')return;
  losses++;state='lost';lostSince=now();
  record('context-lost');
  try{onLost();}catch(error){recordFailure(error);}
 }
 function contextRestored(){
  if(state!=='lost')return;
  restores++;state='recovering';lostSince=null;
  record('context-restored');
  try{onRestored();}catch(error){
   recordFailure(error);
  }
 }
 function rendered(){
  if(state!=='recovering')return false;
  state='ready';record('frame-recovered');
  return true;
 }
 function attach(){
  if(attached)return false;
  canvas.addEventListener('webglcontextlost',contextLost,false);
  canvas.addEventListener('webglcontextrestored',contextRestored,false);
  attached=true;return true;
 }
 function detach(){
  if(!attached)return false;
  canvas.removeEventListener('webglcontextlost',contextLost,false);
  canvas.removeEventListener('webglcontextrestored',contextRestored,false);
  attached=false;return true;
 }
 function snapshot(){
  return {
   status:state,losses,restores,renderFailures:failures,
   lastError,lossDurationMs:state==='lost'&&lostSince!==null?
    Math.max(0,now()-lostSince):null,
   history:history.map(event=>({...event}))
  };
 }
 return Object.freeze({
  attach,detach,rendered,recordFailure,snapshot,
  get canRender(){return state==='ready'||state==='recovering';},
  get status(){return state;}
 });
}
