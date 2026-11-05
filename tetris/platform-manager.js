/* NOMAD Tetris V087 — platform boundary.
 * Device viewport/safe-area measurements and page lifecycle/update checks
 * live here. All visual dimensions, polling intervals and eligibility
 * rules are retained from V086. No Canvas, game-state or WebGL ownership.
 */
import {parsePublishedBuild,shouldReloadBuild} from './build-version.js?v066';

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
 now=()=>Date.now(),
 fetchPage=(url,options)=>window.fetch(url,options),
 reloadPage=()=>window.location.reload()
}){
 if(!window||!document||!display||!safeProbe||
    typeof getGameStatus!=='function'||typeof isScreenOpen!=='function'||
    typeof onViewport!=='function'||typeof onVisibility!=='function')
  throw new TypeError('Platform Manager requires device and lifecycle adapters');

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
    reloadPage();
    return true;
   }
  }catch(e){/* Offline or fetch error: keep the current playable build. */}
  finally{checkingBuild=false;}
  return false;
 }
 const onVisibilityChange=()=>{
  onVisibility(Boolean(document.hidden));
  if(!document.hidden)void checkForNewBuild();
 };
 const onWake=()=>{void checkForNewBuild();};
 const onOrientation=()=>{resize(true);};
 const onPoll=()=>{if(!document.hidden)void checkForNewBuild();};

 function start(){
  if(started)return false;
  started=true;
  observer=new window.ResizeObserver(()=>resize());
  observer.observe(display);
  window.addEventListener('orientationchange',onOrientation);
  document.addEventListener('visibilitychange',onVisibilityChange);
  window.addEventListener('pageshow',onWake);
  window.addEventListener('focus',onWake);
  interval=window.setInterval(onPoll,CHECK_INTERVAL_MS);
  resize();
  return true;
 }
 function stop(){
  if(!started)return false;
  started=false;
  observer?.disconnect();observer=null;
  window.removeEventListener('orientationchange',onOrientation);
  document.removeEventListener('visibilitychange',onVisibilityChange);
  window.removeEventListener('pageshow',onWake);
  window.removeEventListener('focus',onWake);
  if(interval!==null){window.clearInterval(interval);interval=null;}
  return true;
 }
 return Object.freeze({
  start,stop,resize,safeInsets,checkForNewBuild,
  get viewport(){return measured;},
  get running(){return started;}
 });
}
