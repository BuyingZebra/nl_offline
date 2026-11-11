import Layout, {createCompositor,createButtonFeedback,buttonFeedbackChanged,buttonFeedbackLayers,createGpuButtonLighting,croppedBounds,sidebarBounds,controlsBounds,drawCroppedCanvas,captureGameVisualState,gameVisualStateChanged,flashPhase,createRenderInvalidation,createVectorTileRenderer,collectPieceShadowGroups,createPieceShadowRenderer,createBoardInsetShadowRenderer,collectIFragments,createCanvasUI,createModalUI,createHudDrawing,boardOverlaySlots,drawMenuScoreBox,fitPreviewCells,createTerminalLog,drawTerminalLog,terminalLineBounds,createPerfMonitor,createTextureUploadProfiler,formatDebugReport,findRegionAt,sliderValueAt,createGraphicsCleanup,createGraphicsHealth,createVisualScene,estimateCanvasSourceBytes} from './render.js?v204';
import {createBrickFrame} from './assets/frames/brick-pattern.mjs?v137';
import {DISPLAY_EFFECTS,LIGHT_PROPERTY_CONTROLS,scanlineChoices,createSettingsManager,createScreenManager,createActionController} from './game.js?v202';


// Private device adapters: share the same viewport subscription mechanism.
function observeVisualViewport(win={},resize=()=>{}){
 const view=win.visualViewport;
 if(!view?.addEventListener)return ()=>{};
 view.addEventListener('resize',resize);
 return ()=>view.removeEventListener?.('resize',resize);
}

const appleAdapter=Object.freeze({
 id:'ios',
 matches(nav={}){return /iPhone|iPad|iPod/i.test(String(nav.userAgent||''))||(nav.platform==='MacIntel'&&Number(nav.maxTouchPoints)>1);},
 standalone(nav={},win={}){return nav.standalone===true||Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);},
 applyRootMode(nav={},win={},doc={}){if(nav.standalone===true)doc.documentElement?.classList?.add?.('ios-standalone');},
 attach:observeVisualViewport
});

const androidAdapter=Object.freeze({
 id:'android',
 matches(nav={}){return /Android/i.test(String(nav.userAgent||''));},
 standalone(nav={},win={}){return Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);},
 applyRootMode(nav={},win={},doc={}){if(this.standalone(nav,win))doc.documentElement?.classList?.add?.('android-standalone');},
 attach:observeVisualViewport
});

const genericAdapter=Object.freeze({
 id:'generic',
 matches:()=>true,
 standalone(nav={},win={}){return Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);},
 applyRootMode:()=>{},
 attach:()=>()=>{}
});

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

/* Pure frame demand: physics, visual changes and CRT history drive RAF.
 * The terminal timer is only armed if this function returns false.
 */
export function needsContinuousFrame({
 gameStatus='ready',lineClearPending=false,redrawPending=false,
 scrolling=false,buttonsActive=false,persistence=false
}={}){
 return gameStatus==='playing'||lineClearPending||redrawPending||
  scrolling||buttonsActive||persistence;
}

/* Top-level application coordination is owned by the platform runtime.
 * Do not initialize the browser when this module is imported for unit tests.
 * Render and gameplay implementations remain independent and are injected
 * through the runtime's explicit public controllers.
 */
let nomadStarted=false;
// Device pointer/keyboard input controller, separate from visual hitbox geometry.
export function createInputController({screen,document,window,
 getViewport,getRegions,getModal,getModalView,getOptionsScroll,
 setOptionsScroll,getOptionsMaxScroll,setScrollVelocity,setBaseDirty,
 handleAction,perform,setSetting,settingValue,toggleScanlineMenu,
 chooseScanline,openModal,invalidate,clamp,canInteract=()=>true,
 getLightBounds=()=>null,onLightPoint=()=>{},onLightExit=()=>{},
 onButtonPress=()=>{},onButtonRelease=()=>{}}){
 let pressed=null,repeatDelay=null,repeatInterval=null,disposed=false;
 const listeners=[];
 function listen(target,name,handler,options){
  target.addEventListener(name,handler,options);
  listeners.push({target,name,handler,options});
 }
function stopRepeat(){
 if(repeatDelay!==null){clearTimeout(repeatDelay);repeatDelay=null;}
 if(repeatInterval!==null){clearInterval(repeatInterval);repeatInterval=null;}
}
function eventPoint(e){
 const rect=screen.getBoundingClientRect();
 return {x:(e.clientX-rect.left)*getViewport().width/rect.width,y:(e.clientY-rect.top)*getViewport().height/rect.height};
}
function regionAt(p){
 return findRegionAt(getRegions(),p,getModal(),getModalView());
}
function setSlider(r,x){
 setSetting(r.field,sliderValueAt(r,x));
}
// One pointer recognizer for the entire grayscale display. Menus defer activation
// until touch-up; axis-aware intent makes scroll work from sliders and switches.
const DRAG_DEADZONE=8;
const optionPoint=p=>getModal()==='options'&&getModalView()&&
 p.x>=getModalView().x&&p.x<=getModalView().x+getModalView().w&&
 p.y>=getModalView().y&&p.y<=getModalView().y+getModalView().h;
const eventStamp=e=>Number.isFinite(e.timeStamp)?e.timeStamp:performance.now();
const isVisualButton=r=>r?.kind==='button'||['toggle','patternSelect','scanlineChoice'].includes(r?.act);
// iOS Safari can invoke native text-selection/callout on a held canvas
// despite touch-action:none. Cancel only the browser's selection menu,
// never the pointerdown/up cycle that powers hold and auto-repeat.
listen(screen,'contextmenu',e=>e.preventDefault());
listen(screen,'selectstart',e=>e.preventDefault());
listen(screen,'pointerdown',e=>{
 if(disposed||!canInteract())return;
 if(e.pointerType==='mouse'&&e.button!==0)return;
 e.preventDefault();
 if(pressed)return; // One active touch: prevents accidental multi-touch changes.
 const p=eventPoint(e),r=regionAt(p),inOptions=optionPoint(p);
 if(getModal()==='light'){
  const b=getLightBounds();
  if(b&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h){
   pressed={id:e.pointerId,mode:'light',region:null,start:p,last:p};
   try{screen.setPointerCapture(e.pointerId);}catch(error){}
   onLightPoint(p);invalidate();return;
  }
 }
 if(!r&&!getModal())return;
 if(isVisualButton(r))onButtonPress(r,performance.now(),true);
 stopRepeat();setScrollVelocity(0);
 pressed={
  id:e.pointerId,region:r,start:p,last:p,action:r?.act,
  box:r,scroll:getOptionsScroll(),mode:getModal()?'pending':'game',
  inOptions,time:eventStamp(e),velocity:0
 };
 try{screen.setPointerCapture(e.pointerId)}catch(err){}
 // Game buttons stay immediate, including auto-repeat movement.
 if(!getModal()&&r){
  setBaseDirty(r.act);
  handleAction(r.act);
  if(r.repeat){
   // Holding soft drop accelerates continuously; lateral movement retains
   // its existing delayed auto-shift and cadence.
   if(r.act==='soft')repeatInterval=setInterval(()=>handleAction(r.act),50);
   else repeatDelay=setTimeout(()=>{
    repeatInterval=setInterval(()=>handleAction(r.act),82);
   },210);
  }
 }
 invalidate();
});
listen(screen,'pointermove',e=>{
 if(disposed||!canInteract())return;
 if(!pressed||pressed.id!==e.pointerId)return;
 const p=eventPoint(e),r=pressed.region,touch=pressed;
 if(touch.mode==='light'){
  onLightPoint(p);touch.last=p;invalidate();return;
 }
 if(!getModal())return;
 const dx=p.x-touch.start.x,dy=p.y-touch.start.y;
 const ax=Math.abs(dx),ay=Math.abs(dy);
 if(touch.mode==='pending'&&(ax>DRAG_DEADZONE||ay>DRAG_DEADZONE)){
  if(touch.inOptions&&ay>DRAG_DEADZONE&&ay>ax*.78)touch.mode='scroll';
  else if(r?.act==='slider'&&ax>DRAG_DEADZONE&&ax>=ay*.78)touch.mode='slider';
  else touch.mode='cancelled';
 }
 if(touch.mode==='scroll'){
  setOptionsScroll(clamp(touch.scroll-dy,0,getOptionsMaxScroll()));
  const dt=Math.max(1,eventStamp(e)-touch.time);
  const v=clamp((touch.last.y-p.y)/dt,-2.3,2.3);
  touch.velocity=touch.velocity*.5+v*.5;
  invalidate();
 }else if(touch.mode==='slider'){
  setSlider(r,p.x);
 }
 touch.last=p;touch.time=eventStamp(e);
});
function releaseTouch(e){
 if(disposed||!canInteract()){cancel();return;}
 if(!pressed||pressed.id!==e.pointerId)return;
 stopRepeat();
 const touch=pressed,p=eventPoint(e);pressed=null;
 if(touch.mode==='light'){
  if(e.type==='pointerup')onLightPoint(p);
  try{if(screen.hasPointerCapture(e.pointerId))screen.releasePointerCapture(e.pointerId);}catch(error){}
  invalidate();return;
 }
  if(isVisualButton(touch.region))onButtonRelease(touch.region,performance.now());
 // Redraw only the touched button's cropped HUD texture on release.
 if(!getModal())setBaseDirty(touch.action);
 try{if(screen.hasPointerCapture(e.pointerId))screen.releasePointerCapture(e.pointerId);}catch(err){}
 if(getModal()){
  if(e.type==='pointerup'){
   if(touch.mode==='scroll'){
    const elapsed=Math.max(0,eventStamp(e)-touch.time);
    if(elapsed<105&&getOptionsMaxScroll()>0)setScrollVelocity(touch.velocity);
   }else if(touch.mode==='pending'&&touch.region){
    const dy=p.y-touch.start.y,dx=p.x-touch.start.x;
    const same=Math.abs(dx)<=DRAG_DEADZONE&&Math.abs(dy)<=DRAG_DEADZONE;
    if(same){
     const r=touch.region;
     if(r.act==='slider')setSlider(r,p.x);
     else if(r.act==='toggle')setSetting(r.field,!settingValue(r.field));
     else if(r.act==='patternSelect'&&optionPoint(p))toggleScanlineMenu();
     else if(r.act==='scanlineChoice'&&optionPoint(p))chooseScanline(r.field);
     else if(!touch.inOptions||optionPoint(p))handleAction(r.act);
    }
   }else if(touch.mode==='slider'&&touch.region?.act==='slider'){
    setSlider(touch.region,p.x);
   }
  }
 }
 invalidate();
}
listen(screen,'pointerup',releaseTouch);
listen(screen,'pointercancel',releaseTouch);
listen(screen,'lostpointercapture',releaseTouch);
listen(window,'blur',cancel);
listen(screen,'wheel',e=>{
 if(disposed||!canInteract())return;
 if(getModal()==='options'){
  e.preventDefault();setOptionsScroll(clamp(getOptionsScroll()+e.deltaY,0,getOptionsMaxScroll()));invalidate();
 }
},{passive:false});
const KEYS={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'cw',KeyX:'cw',
 ArrowDown:'soft',Space:'soft',KeyC:'hold',ShiftLeft:'hold',
 KeyP:'pause',Escape:'pause',Enter:'start',NumpadEnter:'start'};
listen(document,'keydown',e=>{
 if(disposed||!canInteract())return;
 if(getModal()){
  if(e.code==='Escape'){e.preventDefault();if(getModal()==='light')onLightExit();else openModal(null);}
  return;
 }
 const a=KEYS[e.code];
 if(!a)return;
 e.preventDefault();
 if(e.repeat&&['hold','pause','start'].includes(a))return;
 const keyRegion=getRegions().find(r=>r.kind==='button'&&r.act===a);
 if(keyRegion)onButtonPress(keyRegion,performance.now(),false);
 perform(a);
});

 function cancel(){
  stopRepeat();
  if(pressed){
   if(isVisualButton(pressed.region))onButtonRelease(pressed.region,performance.now());
   try{
    if(screen.hasPointerCapture?.(pressed.id))screen.releasePointerCapture(pressed.id);
   }catch(error){/* The pointer may have been released by the browser. */}
  }
  pressed=null;
 }
 function dispose(){
  if(disposed)return false;
  disposed=true;cancel();
  for(const {target,name,handler,options} of listeners)
   target.removeEventListener(name,handler,options);
  listeners.length=0;
  return true;
 }
 return Object.freeze({get pressed(){return pressed;},stopRepeat,cancel,dispose,
  get disposed(){return disposed;}
 });
}


// Browser clipboard and Safari fallback.
export function createDebugClipboard({navigator,document}={}){
 function fallback(text){
  if(!document?.createElement||!document?.execCommand)return false;
  const field=document.createElement('textarea');
  const prior=document.activeElement;
  field.value=text;
  field.setAttribute('readonly','');
  field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
  try{
   (document.body||document.documentElement).appendChild(field);
   field.focus();field.select();field.setSelectionRange?.(0,text.length);
   return Boolean(document.execCommand('copy'));
  }catch(e){return false;}
  finally{
   field.remove();
   try{prior?.focus?.({preventScroll:true});}catch(e){}
  }
 }
 function copyText(input){
  const text=String(input);
  try{
   if(navigator?.clipboard?.writeText){
    // Critical: this call occurs immediately inside the user gesture.
    return Promise.resolve(navigator.clipboard.writeText(text))
     .then(()=>true,()=>fallback(text));
   }
  }catch(e){/* Use the synchronous selection fallback. */}
  return Promise.resolve(fallback(text));
 }
 return Object.freeze({copyText});
}


export function startNOMAD(){
 if(nomadStarted)return false;
 nomadStarted=true;

/* NOMAD TETRIS — Canvas2D source, Three.js CRT compositor.
 * Gameplay belongs to core.js; rendering observes immutable game events.
 * Preserve the approved grayscale source, display pipeline and controls.
 */

const Core=window.FieldAtlasBlocks,Scores=window.FieldAtlasScores;
const screen=document.getElementById('screen'),display=document.getElementById('display');
const safeProbe=document.getElementById('safeArea');
const fatal=document.getElementById('error');
const portraitGate=window.matchMedia(document.getElementById('portraitGate')?.media||'not all');
if(!Core?.Game||!Scores){fatal.hidden=false;fatal.textContent='Tetris core missing';throw Error('Tetris core missing');}
const ScreenLayout=Layout;
if(!ScreenLayout?.computeLayout){fatal.hidden=false;fatal.textContent='Tetris layout module missing';throw Error('Tetris layout module missing');}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v)),fmt=(n,k=6)=>String(Math.max(0,Math.floor(n))).padStart(k,'0');
const gray=n=>{const v=clamp(Math.round(n),0,255);return 'rgb('+v+','+v+','+v+')'};
// Default/unfilled button faces share the exact near-black background value.
// Lift panels by 3 percentage points of the 0–255 grayscale scale (21 -> 29).
const SCREEN_BLACK='#080808';
const C={bg:SCREEN_BLACK,panel:'#1d1d1d',button:SCREEN_BLACK,solid:'#303030',ink:'#e3e3e3',
 bright:'#cecece',weak:'#aeaeae',border:'#777777',subtleBorder:'#2e2e2e',grid:'#373737',dark:'#060606'};
// Fonts follow Fallout 4's UI/terminal roles; original icons stay intact.
const ICON_FONT='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const FONT='"Roboto Condensed",'+ICON_FONT;
const TERMINAL_FONT='"Share Tech Mono",'+ICON_FONT;
// User preferences are owned by the Settings Manager, independent of rendering.
const THREE_BUILD_VERSION=getBuildVersion(document);
// The HTML build meta is authoritative; title, accessibility and debug labels derive from it.
document.title='NOMAD — Tetris System | version: '+THREE_BUILD_VERSION;
display.setAttribute('aria-label','Tetris System — Three.js version: '+THREE_BUILD_VERSION);
// Viewport measurements and render DPR cap now belong to Platform Manager.
// Use one spacing unit for adjacent containers and buttons inside panels.
// Vertically centered header buttons and flexible sidebar space preserve V027.
const UI_GAP=6;
// Font sizes remain 14px for standard buttons and 16px for primary actions;
// all button icons remain 18px. Every label uses the same 0.13em tracking.
const LETTER_SPACING_EM=.13; // Global 13%-of-font-size tracking; no exceptions.
const BUTTON_FONT_SIZE=14,MAIN_ACTION_FONT_SIZE=16;
const BUTTON_ICON_FONT_SIZE=18;
const MAIN_ACTION_LABELS=new Set(['START GAME','RESUME','PLAY AGAIN','RETURN']);
const BUTTON_ICON_LABELS=new Set(['◀','▶','↻','◐','☷','X','✓','!']);
const UI_SPACE=Object.freeze({
 unit:UI_GAP,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,padX:11,stackGap:UI_GAP,side:93,sideGap:UI_GAP,
 headHeight:80,headIcons:46,headIconGap:UI_GAP,headRightPad:UI_GAP,
 headTitleInset:17,
 deckBottom:30,deckPad:UI_GAP,scoreHeight:45,deckGap:UI_GAP,
 padGap:UI_GAP,padHeight:53,extrasHeight:44,extrasGap:UI_GAP,
 holdHeight:88,nextHeight:162,statsHeight:92
});
let storage,scoreDatabase;
try{storage=window.localStorage;}catch(error){/* The storage getter can be disabled. */}
try{scoreDatabase=window.indexedDB;}catch(error){/* Fall back to local storage. */}
const settings=createSettingsManager(storage);
const game=new Core.Game();
let W=1,H=1,DPR=1,regions=[],layoutInfo=null;
let inputController=null;
let scrollVelocity=0; // logical pixels per millisecond, decays during GPU frames
let queued=false,frameHandle=null,lastTime=performance.now(),audioCtx=null;
let appLifecycle=null;
let pageInCache=false;
// One owner for layer invalidation, redraw attribution and pending work.
const layers=createRenderInvalidation();
const terminalLog=createTerminalLog();
// The HTML build marker is authoritative, including when the app is offline.
// Let the boot terminal finish with the exact running build, so the version
// remains on its bright active row until the next gameplay event.
terminalLog.enqueue('BUILD: VERSION V'+THREE_BUILD_VERSION,
 'VER: V'+THREE_BUILD_VERSION);
let terminalTimer=null,lastTerminalCursorVisible=true;
function queueTerminalMessage(full,short=full,priority=false){
 terminalLog.enqueue(full,short,priority);
 layers.mark('terminal');invalidate('terminal-event');
}
// Small rolling history: no overlay, network, persistent storage, or console spam.
const recentPerf=[];
const perf=createPerfMonitor({enabled:true,intervalMs:2000,log:()=>{},
 onSample:sample=>{
  recentPerf.push(sample);
  if(recentPerf.length>8)recentPerf.shift();
 }});
const debugClipboard=createDebugClipboard({navigator,document});
let baseRegions=[]; // Cached layout hitboxes when menus cover the board.
// Snapshot a just-completed board before Core removes its rows, then flash it.
const LINE_FLASH_MS=430,LINE_FLASH_TOGGLE_MS=72;
let lineClearFX=null,lastPaintedBoardPopupStatus=null;
const presentedBoardStatus=()=>lineClearFX?.finalPoints?'playing':game.status;
// Canvas sources and Three.js scene resources belong to the render engine.
const visualScene=createVisualScene({document,window,screen,fatal,
 onControlsFallback:()=>{layers.mark('controls');invalidate('gpu-controls-fallback');}
});
const {input,baseContext,boardCanvas,boardContext,pieceBloomMaskCanvas,pieceBloomMaskContext,sidebarCanvas,sidebarContext,controlsCanvas,controlsContext,terminalCanvas,terminalContext,modalCanvas,modalContext,boardPopupCanvas,boardPopupContext,texture,boardTexture,pieceBloomMaskTexture,sidebarTexture,controlsTexture,terminalTexture,boardPopupTexture,renderer,scene,camera,surface,boardPlane,sidebarPlane,controlsPlane,controlsFallbackMaterial,controlLighting,terminalPlane,scrimPlane,modalTexture,modalPlane,disableGpuControls}=visualScene;
let g=baseContext; // Current Canvas2D drawing target.

// Source-owned button brightness; no fullscreen press overlay or extra glow.
const buttonFeedback=createButtonFeedback();
let buttonSparks=[];
// Button changes are now compared without temporary strings.
let lastHistoryRender=0;

// Upload changed canvases before submitting the composer so that the first
// RenderPass no longer conflates texture transfer and scene rendering.
const textureUploads=createTextureUploadProfiler({renderer,
 onTiming:(kind,elapsed,source)=>perf.recordUpload(kind,elapsed,source)});
// Developer A/B: ?shadowbox=off restores v188's unrestricted bloom.
const shadowBox=new URLSearchParams(window.location.search).get('shadowbox')!=='off';
const compositor=createCompositor({renderer,scene,camera,boardPopupTexture,
 pieceBloomMaskTexture,shadowBox,
 onPassTiming:(name,elapsed)=>perf.recordPass(name,elapsed)});
const {SCANLINE_PRESETS}=compositor;
const graphicsHealth=createGraphicsHealth({
 canvas:screen,
 onLost:()=>{
  // An interrupted GPU must never advance unseen gameplay or repeat inputs.
  if(game.status==='playing')actions.perform('pause');
  inputController?.cancel();scrollVelocity=0;
  buttonFeedback.clear();buttonSparks=[];
  compositor.resetPersistence();
  cancelPendingFrame();lastTime=performance.now();perf.resetPacing();
 },
 onRestored:()=>{
  try{
   // Three.js reinitializes its internal WebGL context. Reapply the
   // established viewport and mark all CanvasTextures dirty. Visible planes
   // reupload immediately; hidden planes upload on their next appearance.
   renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
   compositor.resize(W,H,DPR);
   compositor.resetPersistence();
   for(const source of visualScene.textures)source.needsUpdate=true;
   lastPaintedBoardPopupStatus=null;cachedLayout=null;
   lastTime=performance.now();perf.resetPacing();
   layers.mark('base','board','sidebar','controls','terminal');
   invalidate('context-restored');
  }catch(error){
   fatal.hidden=false;
   fatal.textContent='WebGL restoration failed: '+String(error.stack||error);
   throw error;
  }
 }
});

// Game and terminal now share precisely the same tile-face renderer.
function tone(freq=240,len=.04){
 if(!settings.soundOn)return;
 try{const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;if(!audioCtx)audioCtx=new AC();
  if(audioCtx.state==='suspended'){
   const wake=audioCtx.resume();
   wake?.catch?.(()=>{}); // Safari may reject an interrupted gesture.
  }
  const osc=audioCtx.createOscillator(),vol=audioCtx.createGain();
  osc.type='square';osc.frequency.value=freq;
  vol.gain.setValueAtTime(.014,audioCtx.currentTime);
  vol.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+len);
  osc.connect(vol).connect(audioCtx.destination);
  osc.onended=()=>{osc.disconnect();vol.disconnect();};
  osc.start();osc.stop(audioCtx.currentTime+len);
 }catch(e){}
}
function invalidate(reason='input'){
 // V167: only events that can alter visible menu pixels should redraw the
 // modal. Terminal typing, gravity and background CRT updates cannot.
 if(screenManager.paintsModalLayer&&
   ['input','button-press','button-release','resize','resume',
    'context-restored','font-ready'].includes(reason))layers.mark('modal');
 layers.reason(reason);requestFrame();
}
// The core owns piece locking and line-clear detection. Its read-only event
// includes the landed board BEFORE row removal, preserving the approved flash.
// No core method is replaced or monkeypatched by rendering code.
const unsubscribeGameEvents=game.onEvent(event=>{
 if(event.type==='lines-cleared'){
  const name=['','SINGLE','DOUBLE','TRIPLE','TETRIS'][event.count]||'LINE';
  const points=event.points;
  queueTerminalMessage('CLEAR: '+name+' +'+points,'CLR: '+event.count+'L+'+points);
 }
 if(event.type==='level-changed')queueTerminalMessage(
  'LEVEL: ADVANCED '+fmt(event.to,2),'LVL: '+fmt(event.to,2));
 if(event.type==='game-over'&&!lineClearFX?.finalPoints)
  queueTerminalMessage('SESSION: GAME OVER','GM: OVER',true);
 if(event.type!=='lines-cleared')return;
 if(!event.board||!event.rows.length)return;
 lineClearFX={board:event.board,boardMeta:event.boardMeta,rows:new Set(event.rows),elapsed:0};
 if(event.status==='over')lineClearFX.finalPoints=event.points;
 layers.mark('board');layers.mark('sidebar');invalidate();
});
// The full-screen properties view hides the board. Keep changes to the
// five shadow parameters in the lightweight thumbnail until exit.
let shadowBoardNeedsPaint=false;
let lightPosition=null;
// Light Control geometry is shared between touch clamping and visual
// placement. The label and value may now align flush with the top/bottom
// board bounds; there is no additional 6px text clearance.
const LIGHT_LABEL_Y=13,LIGHT_LABEL_SIZE=9;
const LIGHT_VALUE_Y=14,LIGHT_VALUE_SIZE=12;
const LIGHT_EDGE_PADDING=0,LIGHT_HORIZONTAL_INSET=12;
const LIGHT_HALO_RADIUS=42; // v198: 28px * 1.5
function lightBoardBounds(){
 const r=layout();
 return {x:r.boardX+2,y:r.boardY+2,w:r.boardW-4,h:r.boardH-4};
}
function lightTravelBounds(b){
 const insetTop=Math.ceil(LIGHT_LABEL_Y+LIGHT_LABEL_SIZE/2+LIGHT_EDGE_PADDING);
 const insetBottom=Math.ceil(LIGHT_VALUE_Y+LIGHT_VALUE_SIZE/2+LIGHT_EDGE_PADDING);
 // Short landscape layouts: preserve a reachable marker inside the board
 // even when the label+number stack cannot fit at full size.
 const middleY=b.y+b.h/2;
 const minY=Math.min(b.y+insetTop,middleY);
 const maxY=Math.max(b.y+b.h-insetBottom,middleY);
 const middleX=b.x+b.w/2;
 return {
  minX:Math.min(b.x+LIGHT_HORIZONTAL_INSET,middleX),
  maxX:Math.max(b.x+b.w-LIGHT_HORIZONTAL_INSET,middleX),
  minY,maxY
 };
}
function lightMarkerPosition(){
 const b=lightBoardBounds(),bounds=lightTravelBounds(b),cx=b.x+b.w/2,cy=b.y+b.h/2;
 const angle=(Number(settings.effects.shadowAngle)||0)*Math.PI/180;
 const radius=Math.min(b.w,b.h)*.34;
 return lightPosition||{
  x:clamp(cx-Math.cos(angle)*radius,bounds.minX,bounds.maxX),
  y:clamp(cy-Math.sin(angle)*radius,bounds.minY,bounds.maxY)
 };
}
function setLightPosition(point){
 if(!screenManager.isLight)return;
 const b=lightBoardBounds(),bounds=lightTravelBounds(b);
 const x=clamp(point.x,bounds.minX,bounds.maxX);
 const y=clamp(point.y,bounds.minY,bounds.maxY);
 lightPosition={x,y};
 // One direction for the ENTIRE board. This is not a point light:
 // the marker's radius never affects shadow length, blur or intensity.
 const dx=b.x+b.w/2-x,dy=b.y+b.h/2-y;
 if(Math.hypot(dx,dy)>=3){
  const angle=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
  actions.setSetting('shadowAngle',Number(angle.toFixed(2)));
 }
 layers.mark('modal');invalidate();
}
const screenManager=createScreenManager({
 getGameStatus:()=>game.status,
 pauseGame:()=>actions.perform('pause'),
 onChange:(previous,next)=>{
  // Preserve menu-local reset, touch capture and score popup invalidation.
  // Preserve the scrolled shadow-settings row while entering/leaving the
  // temporary light lab, so DONE returns to the same controls.
  if(previous!=='light'&&next!=='light')modalUI.reset();
  scrollVelocity=0;inputController?.cancel();
  // Buttons release on navigation, but the full-screen afterglow survives.
  buttonFeedback.clear();
  if(previous==='scores'||next==='scores')layers.mark('base');
  if(previous==='light'||next==='light'){
   if(next==='light')lightPosition=null;
   layers.mark('base','board','sidebar','modal');
  }
  // Entering/re-entering Options needs a fresh full menu; leaving it must
  // discard any pending modal dirtiness even if another screen is selected.
  if(previous==='options'||next==='options')layers.mark('modal');
  // Gameplay's base can remain untouched while the full-screen Options
  // view is in front. Refresh it exactly once when becoming visible again.
  if(previous==='options'&&next!=='options'){
   layers.mark('base','controls','terminal');
   if(shadowBoardNeedsPaint){layers.mark('board');shadowBoardNeedsPaint=false;}
  }
  if(next===null)regions=baseRegions;
  invalidate();
 }
});
// All game commands, menu actions and personal-best updates are delegated.
// UI and render adapters remain here; the controller never paints.
const actions=createActionController({
 game,scores:Scores,storage,settings,screens:screenManager,
 persistScore:Scores.createPersistence(storage,scoreDatabase),
 getLineClearActive:()=>Boolean(lineClearFX),
 clearLineClear:()=>{lineClearFX=null;},
 // Score, lines and preview content already belong to sidebar/board.
 // The deck itself is static; presses are now uniform-only GPU changes.
 markLayers:(...names)=>{
  let applicable=visualScene.controlsGpuEnabled?
   names.filter(name=>name!=='controls'):names;
  if(screenManager.isOptions&&applicable.includes('board')){
   shadowBoardNeedsPaint=true;
   applicable=applicable.filter(name=>name!=='board');
  }
  if(applicable.length)layers.mark(...applicable);
 },
 invalidate:()=>invalidate(),
 tone:(freq,len)=>tone(freq,len),
 onCopyDebug:()=>copyDebugReport(),
 onResetSettingsUI:()=>{modalUI.resetSettings();scrollVelocity=0;},
 onTerminalEvent:queueTerminalMessage,
 canInteract:()=>!lineClearFX?.finalPoints&&!portraitGate.matches&&graphicsHealth.status==='ready'&&appLifecycle?.canWork!==false
});
const {panel,wrapText,text,rect,region,key,buttonLight}=createCanvasUI({
 getContext:()=>g,getRegions:()=>regions,
 getButtonPower:r=>(g===controlsContext&&visualScene.controlsGpuEnabled)?0:buttonSparks.find(
  s=>s.x===r.x&&s.y===r.y&&s.w===r.w&&s.h===r.h)?.power??0,
 C,FONT,ICON_FONT,TERMINAL_FONT,LETTER_SPACING_EM,MAIN_ACTION_LABELS,BUTTON_ICON_LABELS,
 MAIN_ACTION_FONT_SIZE,BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE
});
// The official logo is a standalone, resolution-independent SVG asset.
// This exact-path Canvas fallback keeps the logo visible on first paint and
// offline or while SVG image decoding completes.
const nomadMark=new Image();
let nomadMarkReady=false;
nomadMark.onload=()=>{
 nomadMarkReady=true;
 if(appLifecycle?.status!=='disposed'){
  layers.mark('base');
  invalidate('nomad-mark-ready');
 }
};
nomadMark.onerror=()=>{nomadMarkReady=false;};
nomadMark.src='./nomad-mark.svg?v110';
function paintNomadMark(x,y,w,h){
 if(nomadMarkReady){g.drawImage(nomadMark,x,y,w,h);return;}
 g.save();
 g.translate(x,y);g.scale(w/160,h/64);
 g.strokeStyle=C.bright;g.lineWidth=3.8;
 g.lineCap='round';g.lineJoin='round';
 g.beginPath();
 for(const [xa,ya,xb] of [
  [18,18,56],[104,18,142],[8,32,51],
  [109,32,152],[18,46,56],[104,46,142]
 ]){g.moveTo(xa,ya);g.lineTo(xb,ya);}
 g.stroke();
 g.beginPath();g.arc(80,32,24,0,Math.PI*2);g.stroke();
 g.restore();
}
// Do not block first paint on web fonts; redraw once either face loads.
if(document.fonts?.load){
 const specs=['700 20px "Roboto Condensed"','400 20px "Share Tech Mono"'];
 Promise.allSettled(specs.map(spec=>document.fonts.load(spec))).then(results=>{
  if(appLifecycle?.status==='disposed')return;
  if(!results.some(r=>r.status==='fulfilled'&&r.value.length))return;
  layers.mark('base','board','sidebar','controls','terminal');
  invalidate('font-ready');
 }).catch(()=>{});
}
// V121: higher-contrast smooth SVG sprites, raster-cached at display DPR.
// Approved pixel motifs remain a fallback during SVG loading/errors.
const pieceShadows=createPieceShadowRenderer({pixelRatio:()=>DPR,
 getSettings:()=>settings.effects});
const boardInsetShadows=createBoardInsetShadowRenderer({
 getSettings:()=>settings.effects});
const vectorTiles=createVectorTileRenderer({
 pixelRatio:()=>DPR,
 onReady:()=>{
  if(appLifecycle?.status==='disposed')return;
  layers.mark('board','sidebar');
  invalidate('vector-tile-ready');
 }
});
vectorTiles.preload();
const brickFrame=createBrickFrame({
 pixelRatio:()=>DPR,
 onReady:()=>{
  if(appLifecycle?.status==='disposed')return;
  // Once the original SVG is decoded, repaint the static rails from
  // that image instead of keeping the exact-geometry fallback forever.
  layers.mark('base');
  invalidate('brick-svg-ready');
 }
});
// Retain V027-inspired preview tile sizing but use a single uniform scale.
// Tetrominoes are centred and contained in their square preview frames.
// Fresh grayscale tile styling for both the board and miniature previews:
// thin bevel rim, darker inset cap, luminous upper edge and lower shadow.
function tileFace(x,y,w,h,kind){
 vectorTiles.drawTile(g,x,y,w,h,kind);
}
function smallPiece(kind,x,y,w,h,role='next',targetCell=null){
 if(!kind)return;
 // Preview I is a single gravel-textured strip; other pieces repeat the
 // exact approved 12-pixel motif once per occupied square.
 vectorTiles.drawPiece(g,fitPreviewCells(Core.SHAPES[kind],x,y,w,h,role,targetCell),kind);
}
function cell(x,y,col,row,size,kind,isGhost=false){
 if(!kind||col<0||row<0||col>=10||row>=20)return;
 const px=x+col*size,py=y+row*size;
 if(isGhost){
  g.setLineDash([3,3]);g.strokeStyle='#777';g.lineWidth=1;
  g.strokeRect(px+3,py+3,size-6,size-6);g.setLineDash([]);return;
 }
 tileFace(px,py,size,size,kind);
}
function stage(r,drawPieces=true,pieceMask=null){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 panel(x,y,w,h,7,C.panel);
 const offX=x+2,offY=y+2,tile=(w-4)/10;
 // Record occupied piece-face footprints only while painting the actual
 // board. This mask is not a second piece rendering or shadow layer.
 const maskTile=(px,py,pw=tile,ph=tile)=>{
  if(pieceMask&&pw>0&&ph>0)pieceMask.fillRect(px,py,pw,ph);
 };
 if(pieceMask){
  pieceMask.save();pieceMask.beginPath();
  pieceMask.rect(offX,offY,w-4,h-4);pieceMask.clip();
 }
 g.save();g.beginPath();g.rect(offX,offY,w-4,h-4);g.clip();
 rect(offX,offY,w-4,h-4,'#1a1a1a');
 // V202: lift both the playfield background (24 -> 26/255, +8.3%)
 // and grid strokes (50 -> 55/255, +10%) without changing geometry,
 // stroke opacity (0.751355748), or grid line width (0.6px).
 g.globalAlpha=.751355748;g.strokeStyle=C.grid;g.lineWidth=.6;g.beginPath();
 for(let c=0;c<=10;c++){g.moveTo(offX+c*tile,offY);g.lineTo(offX+c*tile,offY+20*tile);}
 for(let row=0;row<=20;row++){g.moveTo(offX,offY+row*tile);g.lineTo(offX+10*tile,offY+row*tile);}
 g.stroke();g.globalAlpha=1;
 // Blink freshly completed rows between the detailed tiles and empty
 // outlined cubes before revealing the core's already-cleared board.
 if(drawPieces){
 const displayBoard=lineClearFX?.board||game.board;
 const clearIsEmpty=lineClearFX&&Math.floor(lineClearFX.elapsed/LINE_FLASH_TOGGLE_MS)%2===1;
 // Join only consecutive original cells from ONE locked piece. Adjacent I
 // pieces keep independent frames; clearing rows never re-seeds the gravel.
 const displayMeta=lineClearFX?.boardMeta||game.boardMeta;
 const iRuns=collectIFragments(displayBoard,displayMeta,{
  hiddenRows:clearIsEmpty?lineClearFX.rows:null
 });
 // V188: draw each piece's cached v06 directional-Gaussian silhouette below
 // the original SVG art; identities and rotation remain piece-correct.
 // This reuses the existing board CanvasTexture and requires no new GPU pass.
 const shadowGroups=collectPieceShadowGroups(displayBoard,displayMeta,
  !lineClearFX&&game.status!=='over'?game.current:null,
  clearIsEmpty?lineClearFX.rows:null);
 pieceShadows.draw(g,shadowGroups,offX,offY,tile);
 displayBoard.forEach((row,ry)=>row.forEach((kind,rx)=>{
  if(!kind)return;
  if(clearIsEmpty&&lineClearFX.rows.has(ry)){
   const px=offX+rx*tile,py=offY+ry*tile;
   g.save();g.strokeStyle=C.border;g.globalAlpha=.42;g.lineWidth=.7;
   g.strokeRect(px+2,py+2,tile-4,tile-4);g.restore();
  }else if(kind!=='I'){
   cell(offX,offY,rx,ry,tile,kind);
   maskTile(offX+rx*tile,offY+ry*tile);
  }
 }));
 for(const run of iRuns){
  const vertical=(run.rotation&1)===1;
  const rw=(vertical?1:run.length)*tile,rh=(vertical?run.length:1)*tile;
  const px=offX+run.x*tile,py=offY+run.y*tile;
  vectorTiles.drawIFragment(g,px,py,rw,rh,
   {sourceOffset:run.sourceOffset,length:run.length,rotation:run.rotation});
  maskTile(px,py,rw,rh);
 }
 if(!lineClearFX&&game.current&&game.status!=='over'){
  const p=game.current;
  if(settings.pieceGhost&&(game.status==='playing'||game.status==='paused')){
   const target=game.ghostY();
   p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{
    if(!kind)return;
    const col=p.x+rx,r=target+ry;
    cell(offX,offY,col,r,tile,kind,true);
    if(col>=0&&col<10&&r>=0&&r<20)maskTile(offX+col*tile,offY+r*tile);
   }));
  }
  const activeTiles=[];
  p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{
   if(!kind)return;
   const col=p.x+rx,row=p.y+ry;
   if(p.kind==='I')activeTiles.push({
    x:offX+col*tile,y:offY+row*tile,size:tile
   });
   else cell(offX,offY,col,row,tile,kind);
   if(col>=0&&col<10&&row>=0&&row<20)
    maskTile(offX+col*tile,offY+row*tile);
  }));
  if(p.kind==='I')vectorTiles.drawPiece(g,activeTiles,'I',{rotation:p.rotation});
 }
 if(lineClearFX?.finalPoints){
  const label='+'+lineClearFX.finalPoints;
  rect(x+w*.17,y+h*.45,w*.66,h*.10,C.bg);
  text(label,x+w/2,y+h/2,Math.min(21,w*.1),C.bright,'center',w*.60);
 }
 }
 // Recessed board walls share the piece-shadow controls; only the interior
 // is darkened, preserving the aperture and shadow-box bloom separation.
 boardInsetShadows.draw(g,offX,offY,w-4,h-4,tile);
 g.restore();
 if(pieceMask)pieceMask.restore();
}
// The stage's inset shadow is blurred along with gameplay. Redraw a
// restrained copy on the separate popup layer, composed AFTER Gaussian blur.
// Keep the same four-sided 2px inset without touching stage geometry.
function drawSharpBoardInsetShadow(r){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 const innerW=w-4,innerH=h-4;
 boardInsetShadows.draw(g,x+2,y+2,innerW,innerH,innerW/10,.62);
}
function paintBoardPopup(r){
 // A freshly rendered status snapshot prevents START GAME from persisting
 // when the engine transitions to PAUSED or GAME OVER.
 const status=presentedBoardStatus();
 lastPaintedBoardPopupStatus=status;
 if(status==='playing')return;
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 g=boardPopupContext;
 try{
  // Reapply the inset shadow above the blur, but not above the score screen.
  if(!screenManager.isScores)drawSharpBoardInsetShadow(r);
  // Top Five is composed as a sharp alpha popup AFTER the Gaussian board blur.
  // Do not draw PAUSED/GAME OVER controls beneath the score screen.
  if(screenManager.isScores){
   modalUI.paintModal(modalUI.modalBounds('scores'));
   return;
  }
  const type=status;
  const title=type==='paused'?'PAUSED':type==='over'?'GAME OVER':'TETRIS';
  const caption=type==='paused'?'RESUME':type==='over'?'PLAY AGAIN':'START GAME';
  const inset=UI_SPACE.unit,headingGap=2*UI_SPACE.unit;
  const primaryH=r.extraH,secondaryH=r.overlaySecondaryH;
  const slots=boardOverlaySlots({x,y,w,h},UI_SPACE);
  // START GAME is unchanged: the pause action uses its same midpoint anchor.
  // A very short playfield may shift the pause stack upward to keep it visible.
  const clusterH=primaryH+2*secondaryH+2*inset;
  const by=type==='paused'?
   Math.min(slots.actionY,y+h-inset-clusterH):slots.actionY;
  const bx=slots.actionX,bw=slots.actionW;
  const headingSize=Math.min(21,w*.079);
  if(type==='ready'){
   // Home screen artwork and layout are intentionally untouched.
   const subSize=10;
   const subY=by-headingGap-subSize/2;
   const titleY=subY-subSize/2-headingGap-headingSize/2;
   text(title,x+w/2,titleY,headingSize,C.bright,'center',w-18);
   text('SURVIVE THE SOVIET CHALLENGE',x+w/2,subY,subSize,C.weak,'center',w-18);
  }else if(type==='paused'){
   text(title,slots.titleX,slots.titleY,headingSize,C.bright,'center',w-18);
   drawMenuScoreBox({text,rect,C},slots.score,{score:game.score,lines:game.lines,level:game.level});
  }else{
   // Game-over layout is outside this menu-alignment pass.
   const titleY=by-headingGap-headingSize/2;
   text(title,x+w/2,titleY,headingSize,C.bright,'center',w-18);
  }
  key(caption,bx,by,bw,primaryH,'start',{light:true,arrow:true});
  if(type==='paused'){
   key('RESTART',bx,by+primaryH+inset,bw,secondaryH,'restart');
   key('HIGH SCORE',bx,by+primaryH+secondaryH+2*inset,bw,secondaryH,'scores');
  }
  }finally{g=baseContext;}
}
// Pure layout calculation remains in layout.js; platform owns safe-area measurement.
let cachedLayout=null;
function insets(){return platform.safeInsets();}
function layout(){
 return cachedLayout||(cachedLayout=ScreenLayout.computeLayout(W,H,insets(),UI_SPACE));
}
// Independent cropped CanvasTexture shares CSS layout geometry with base.
function paintBoardLayer(){
 const r=layout(),x=r.boardX,y=r.boardY,w=r.boardW,h=r.boardH;
 const pixelW=Math.max(1,Math.round(w*DPR)),pixelH=Math.max(1,Math.round(h*DPR));
 // The stencil runs at CSS resolution: a few hundred KB, not an additional
 // DPR-scaled colour framebuffer. Sampling remains aligned with board UVs.
 const maskW=Math.max(1,Math.round(w)),maskH=Math.max(1,Math.round(h));
 if(pieceBloomMaskCanvas.width!==maskW||pieceBloomMaskCanvas.height!==maskH){
  pieceBloomMaskCanvas.width=maskW;pieceBloomMaskCanvas.height=maskH;
 }
 pieceBloomMaskContext.setTransform(1,0,0,1,0,0);
 pieceBloomMaskContext.fillStyle='#000';
 pieceBloomMaskContext.fillRect(0,0,maskW,maskH);
 const mx=maskW/Math.max(1,w),my=maskH/Math.max(1,h);
 pieceBloomMaskContext.setTransform(mx,0,0,my,-x*mx,-y*my);
 pieceBloomMaskContext.fillStyle='#fff';
 if(boardCanvas.width!==pixelW||boardCanvas.height!==pixelH){
  boardCanvas.width=pixelW;boardCanvas.height=pixelH;
 }
 boardContext.setTransform(DPR,0,0,DPR,-x*DPR,-y*DPR);
 const previous=g;g=boardContext;
 try{
  rect(x,y,w,h,C.bg);
  stage(r,true,pieceBloomMaskContext);
 }finally{g=previous;}
 boardPlane.scale.set(w/W,h/H,1);
 boardPlane.position.set(-1+(2*x+w)/W,1-(2*y+h)/H,.01);
 boardTexture.needsUpdate=true;
 pieceBloomMaskTexture.needsUpdate=true;
 perf.textureChanged('board');
}
// Keep all original drawing commands and labels; only their render target changes.
const {drawSidebar,drawControls}=createHudDrawing({
 panel,text,rect,key,smallPiece,getGame:()=>game,
 C,UI_SPACE,fmt
});
// Cached opaque crops cover stale duplicates on the full-screen base. The
// temporary hitbox list prevents dynamic repaints from changing input priority.
function paintUIRegion(canvas,context,plane,layerTexture,bounds,kind,draw){
 const priorContext=g,priorRegions=regions;
 g=context;regions=[];
 try{
  drawCroppedCanvas({canvas,context,plane,texture:layerTexture,bounds,
   dpr:DPR,width:W,height:H,draw:region=>{
    rect(region.x,region.y,region.w,region.h,C.bg);
    draw(layoutInfo||layout());
   }});
 }finally{g=priorContext;regions=priorRegions;}
 perf.textureChanged(kind);
}
function paintSidebarLayer(){
 const r=layoutInfo||layout();
 paintUIRegion(sidebarCanvas,sidebarContext,sidebarPlane,sidebarTexture,
  sidebarBounds(r,W,H,DPR),'sidebar',drawSidebar);
}
function paintControlsLayer(){
 const r=layoutInfo||layout();
 const bounds=controlsBounds(r,W,H,DPR);
 paintUIRegion(controlsCanvas,controlsContext,controlsPlane,controlsTexture,
  bounds,'controls',r=>{
   drawControls(r);
   // The temporary regions list contains the exact button geometry
   // produced by the same Canvas painter and touch-hitbox model.
   if(visualScene.controlsGpuEnabled){
    if(!controlLighting.configure(regions,bounds))disableGpuControls();
    else controlLighting.update(buttonSparks);
   }
  });
}
function paintTerminalLayer(){
 const r=layoutInfo||layout();
 // Keep the ORIGINAL terminal renderer: identical glyph metrics, clipping,
 // cursor, history gradient, pixel coordinates and background luminance.
 // Crop only its two unframed rows, leaving the game controls stationary.
 paintUIRegion(terminalCanvas,terminalContext,terminalPlane,terminalTexture,
  croppedBounds([terminalLineBounds(r)],W,H,DPR,0),'terminal',r=>{
   drawTerminalLog(g,terminalLog,r,performance.now(),C.ink,C.bg,FONT);
  });
}
function paintBaseGame(){
 regions=[];const r=layout();layoutInfo=r;
 // The popup isn't sampled while playing. Avoid clearing and uploading
 // an entire full-resolution transparent texture for every falling piece.
 if(presentedBoardStatus()!=='playing'){
  boardPopupContext.setTransform(1,0,0,1,0,0);
  boardPopupContext.clearRect(0,0,boardPopupCanvas.width,boardPopupCanvas.height);
  boardPopupContext.setTransform(DPR,0,0,DPR,0,0);
 }
 g=baseContext;
 rect(0,0,W,H,C.bg);
 // The stray shaded sub-footer is removed; the log prints on bare black.
 panel(r.hx,r.hy,r.hw,r.hh,0,C.panel);
 // The logo, wordmark, and subtitle use the EXISTING font and luminance
 // palette. Only the title organization changes; header buttons stay put.
 const th=r.headerButtonH;
 const tx=r.hx+r.hw-UI_SPACE.headRightPad-th*2-UI_SPACE.headIconGap;
 const ty=r.hy+(r.hh-th)/2;
 const markX=r.hx+Math.max(6,UI_SPACE.headTitleInset*.48);
 const available=Math.max(20,tx-markX-5);
 const markW=Math.min(74,Math.max(30,available*.34));
 const markH=markW*.4;
 const markY=r.hy+(r.hh-markH)/2;
 paintNomadMark(markX,markY,markW,markH);
 const titleX=markX+markW+Math.max(6,Math.min(11,available*.05));
 const titleWidth=Math.max(12,tx-titleX-5);
 rect(titleX-5,r.hy+r.hh*.27,1,r.hh*.46,C.bright);
 text('NOMAD',titleX,r.hy+r.hh/2-9,
  r.landscape?14:Math.min(20,Math.max(15,r.hw*.056)),
  C.ink,'left',titleWidth);
 text('TETRIS SYSTEM',titleX,r.hy+r.hh/2+11,
  10,C.weak,'left',titleWidth);
 key('◐',tx,ty,th,th,'theme');
 // The menu button exists only in the regular game interface. Light Control
 // draws its confirmation glyph at these SAME coordinates on the modal layer.
 if(!screenManager.isLight)
  key('☷',tx+th+UI_SPACE.headIconGap,ty,th,th,'options');
 stage(r,false);
 // Static 75%-cell brick rails, exactly one control-gap outside either edge.
 // Draw on the base layer, not inside the cropped board texture.
 brickFrame.draw(g,r);
 // Light Control hides the sidebar at its source, not under a painted mask.
 // The bricks are independently drawn by brickFrame and always remain visible.
 if(!screenManager.isLight){
  drawSidebar(r);
  drawControls(r);
 }
 // Re-render the sharp popup from the CURRENT status, registering its hitboxes
 // after all other controls so overlays take input priority.
 paintBoardPopup(r);
 baseRegions=regions;
 texture.needsUpdate=true;
 perf.textureChanged('base');
 if(presentedBoardStatus()!=='playing'){
  boardPopupTexture.needsUpdate=true;
  perf.textureChanged('popup');
 }
}
function paintGame(){
 if(presentedBoardStatus()!==lastPaintedBoardPopupStatus)layers.mark('base');
 let paintedBase=false;
 if(layers.consume('base')){
  const started=performance.now();
  paintBaseGame();
  perf.recordDuration('base',performance.now()-started);
  paintedBase=true;
 }
 if(layers.consume('board')){
  const started=performance.now();
  paintBoardLayer();
  perf.recordDuration('board',performance.now()-started);
 }
 if(layers.consume('sidebar')){
  const started=performance.now();
  paintSidebarLayer();
  perf.recordDuration('sidebar',performance.now()-started);
 }
 if(layers.consume('controls')){
  const started=performance.now();
  paintControlsLayer();
  perf.recordDuration('controls',performance.now()-started);
 }
 if(layers.consume('terminal')&&!screenManager.isOptions){
  const started=performance.now();
  paintTerminalLayer();
  perf.recordDuration('terminal',performance.now()-started);
 }
 if(screenManager.paintsModalLayer){
  // paintBaseGame resets hit regions to the base; repaint the modal too so
  // that its hitboxes still receive touch after a font/viewport refresh.
  if(paintedBase)layers.mark('modal');
  // The existing modal plane retains the last texture on terminal typing
  // or button changes behind an unchanged menu. No canvas paint or upload.
  if(layers.consume('modal')||!modalPlane.visible){
   const started=performance.now();
   paintModalOverlay();
   perf.recordDuration('modal',performance.now()-started);
  }
 }
 else{
  layers.consume('modal');
  surface.visible=true;boardPlane.visible=true;sidebarPlane.visible=true;
  controlsPlane.visible=true;terminalPlane.visible=true;
  modalPlane.visible=false;scrimPlane.visible=false;
  regions=baseRegions;
 }
}

// NOMAD Display System: one continuous full-width list (no category headings).
// Keep the canonical game effect settings and existing storage keys unchanged.
const SCANLINE_CHOICES=scanlineChoices(SCANLINE_PRESETS);
function settingValue(k){
 return settings.settingValue(k);
}
// The menu module owns its scroll, picker and canvas drawing state.
// Only live data and existing Canvas primitives cross this boundary.
const modalUI=createModalUI({
 document,SHAPES:Core.SHAPES,DISPLAY_EFFECTS,SCANLINE_CHOICES,
 getViewport:()=>({W,H,DPR}),layout,insets,
 clearRegions:()=>{regions=[];},getContext:()=>g,
 panel,text,rect,region,key,buttonLight,gray,clamp,fmt,C,UI_SPACE,BUTTON_ICON_FONT_SIZE,
 getFX:()=>settings.effects,activeScanlinePreset:id=>compositor.activeScanlinePreset(id),
 settingValue,chooseScanlineSetting:id=>settings.chooseScanline(id),
 invalidate,setScrollVelocity:value=>{scrollVelocity=value;},
 getBest:()=>actions.best,getGame:()=>game,
 getModal:()=>screenManager.active
});
function createDebugReport(){
 const memory=renderer.info.memory;
 const gpu={...compositor.passStats(),textures:memory?.textures,
  geometries:memory?.geometries,programs:renderer.info.programs?.length};
 return formatDebugReport({
  version:THREE_BUILD_VERSION,createdAt:new Date().toISOString(),
  buttonRenderer:visualScene.controlsGpuEnabled?'GPU uniforms':'Canvas2D fallback',
  platform:navigator.userAgent,
  viewport:{width:W,height:H,dpr:DPR,deviceDpr:Math.max(1,window.devicePixelRatio||1)},
  game:{status:game.status,level:game.level,score:game.score,lines:game.lines},
  display:{theme:settings.theme,orientation:W>H?'landscape':'portrait',phosphor:settings.effects.phosphor,
   settings:JSON.stringify({...settings.effects,pieceGhost:settings.pieceGhost,sound:settings.soundOn})},
  gpu,shadowStats:pieceShadows.stats,
  canvasMemory:estimateCanvasSourceBytes(visualScene.canvases),
  graphics:graphicsHealth.snapshot(),lifecycle:appLifecycle?.snapshot(),
  offline:{network:navigator.onLine===false?'offline':'online',
   supported:'serviceWorker' in navigator,
   controlled:Boolean(navigator.serviceWorker?.controller)},
  samples:recentPerf,current:perf.currentSnapshot()
 });
}
function copyDebugReport(){
 modalUI.debugCopyState='pending';
 // Clipboard access must start inside the original touch-up user gesture.
 const report=createDebugReport();
 debugClipboard.copyText(report).then(success=>{
  if(appLifecycle?.status==='disposed')return;
  modalUI.debugCopyState=success?'copied':'failed';invalidate();
 },()=>{
  if(appLifecycle?.status==='disposed')return;
  modalUI.debugCopyState='failed';invalidate();
 });
}
function paintLightPropertyPanel(r){
 // Exactly the original controls container geometry; no new layout height,
 // overlay backdrop, or persistent alternate gameplay controls asset.
 panel(r.dx,r.dy,r.dw,r.dh,0,C.panel);
 const gap=UI_SPACE.unit;
 const inset=r.deckPad,contentX=r.dx+inset;
 const contentW=Math.max(1,r.dw-2*inset);
 const rowGap=Math.min(gap,Math.max(2,r.dh*.045));
 const rowH=Math.max(1,(r.dh-2*inset-rowGap*3)/4);
 const labelW=Math.min(125,Math.max(80,contentW*.29));
 const barX=contentX+labelW+gap;
 const barW=Math.max(1,contentX+contentW-barX);
 const fill=206,empty=Math.round(fill*.50),darkInk=6;
 for(let i=0;i<LIGHT_PROPERTY_CONTROLS.length;i++){
  const setting=LIGHT_PROPERTY_CONTROLS[i];
  const y=r.dy+inset+i*(rowH+rowGap);
  const midY=y+rowH/2,barH=Math.max(9,Math.min(24,rowH*.76));
  const value=Number(settings.settingValue(setting.field));
  const fraction=clamp((value-setting.min)/(setting.max-setting.min),0,1);
  const barY=midY-barH/2;
  // A single unframed rectangular bar: 206 filled, 50% empty. The
  // dim half-luminance retains readable inverse text at low fill levels.
  rect(barX,barY,barW,barH,gray(empty));
  rect(barX,barY,barW*fraction,barH,gray(fill));
  text(setting.label,contentX,midY,Math.min(11,Math.max(8,rowH*.44)),
   C.ink,'left',Math.max(1,labelW-2));
  // The numeric value is not a separate box. It uses the same 6-luminance
  // negative-space ink as the normal solid DROP button.
  text(String(Math.round(value))+setting.unit,
   barX+barW/2,midY,Math.min(13,Math.max(9,barH*.64)),
   gray(darkInk),'center',Math.max(1,barW-8),'terminal');
  region(barX,barY,barW,barH,'slider',{
   field:setting.field,min:setting.min,max:setting.max,step:setting.step,
   trackX:barX,trackW:barW,modalControl:true
  });
 }
}
function paintLightDirectionOverlay(){
 regions=[];
 const r=layout(),b=lightBoardBounds(),p=lightMarkerPosition();
 // The scoreboard is disabled at its drawing source and its cropped GPU
 // plane is hidden. Do not draw an opaque masking rectangle here: the extra
 // full-screen phosphor/bloom composite would expose the mask's edge.
 // These are two distinct source elements rather than one full-screen line.
 // (1) The game-board crosshairs are clipped to the recessed aperture.
 // Use the light ring's exact, fully opaque 206/255 source luminance:
 // the old .27-alpha, 0.7px crosshair was washed out by CRT effects.
 g.save();
 g.beginPath();g.rect(b.x,b.y,b.w,b.h);g.clip();
 g.strokeStyle=C.bright;g.lineWidth=1;
 g.setLineDash([3,7]);g.beginPath();
 g.moveTo(p.x,b.y);g.lineTo(p.x,b.y+b.h);
 g.moveTo(b.x,p.y);g.lineTo(b.x+b.w,p.y);
 g.stroke();g.setLineDash([]);
 // A Canvas2D radial gradient is continuously interpolated between its
 // centre and transparent edge: two stops, no visible concentric bands.
 // The original 28px radius is now exactly 1.5x larger (42px).
 const halo=g.createRadialGradient(p.x,p.y,0,p.x,p.y,LIGHT_HALO_RADIUS);
 halo.addColorStop(0,'rgba(230,230,230,0.19)');
 halo.addColorStop(1,'rgba(230,230,230,0)');
 g.fillStyle=halo;
 g.fillRect(p.x-LIGHT_HALO_RADIUS,p.y-LIGHT_HALO_RADIUS,
  LIGHT_HALO_RADIUS*2,LIGHT_HALO_RADIUS*2);
 g.strokeStyle=C.bright;g.lineWidth=1;
 g.beginPath();g.arc(p.x,p.y,11,0,2*Math.PI);g.stroke();
 g.fillStyle='rgba(235,235,235,.96)';
 g.beginPath();g.arc(p.x,p.y,3.5,0,2*Math.PI);g.fill();
 g.restore();
 // (2) A separate DASHED DIVIDER lives solely inside the now-empty sidebar.
 // It shares the board guide's y coordinate and 206/255 luminance, but cannot
 // cross the brick rail or overlap the labels above and below it.
 if(r.sideW>25){
  const sideCenter=r.sideX+r.sideW/2,readoutWidth=r.sideW-4;
  g.save();
  g.beginPath();g.rect(r.sideX,r.boardY,r.sideW,r.boardH);g.clip();
  g.strokeStyle=C.bright;g.lineWidth=1;
  g.setLineDash([3,7]);g.beginPath();
  g.moveTo(r.sideX+2,p.y);g.lineTo(r.sideX+r.sideW-2,p.y);
  g.stroke();g.restore();
  text('LIGHT ANGLE',sideCenter,p.y-LIGHT_LABEL_Y,LIGHT_LABEL_SIZE,
   C.weak,'center',readoutWidth);
  text(Number(settings.effects.shadowAngle).toFixed(2)+'°',
   sideCenter,p.y+LIGHT_VALUE_Y,LIGHT_VALUE_SIZE,C.bright,
   'center',readoutWidth,'terminal');
 }
 // Only Light Control receives the alternate controls panel and checkmark.
 // The header check replaces (not accompanies) the old menu icon.
 paintLightPropertyPanel(r);
 const th=r.headerButtonH,tx=r.hx+r.hw-UI_SPACE.headRightPad-th*2-UI_SPACE.headIconGap;
 const ty=r.hy+(r.hh-th)/2;
 key('✓',tx+th+UI_SPACE.headIconGap,ty,th,th,'lightDone');
}
function paintModalOverlay(){
 // Repaint exactly one active dialog. Always clear the entire backing image
 // so no pixels from a previous modal remain after a menu transition.
 // Options is now its own screen: hide the game rather than darken it.
 const standaloneSettings=screenManager.isOptions;
 surface.visible=!standaloneSettings;boardPlane.visible=!standaloneSettings;
 // Do not display a previously cached/sidebar texture in the light lab.
 // Visibility is a property of the independent sidebar layer, Blender-style.
 sidebarPlane.visible=!standaloneSettings&&!screenManager.isLight;
 // The original cropped controls texture stays unchanged in memory; the
 // equally-sized Light Control properties panel replaces it only in this view.
 controlsPlane.visible=!standaloneSettings&&!screenManager.isLight;
 terminalPlane.visible=!standaloneSettings;
 const q=modalUI.modalBounds(screenManager.active);
 const cw=Math.max(1,Math.round(W*DPR)),ch=Math.max(1,Math.round(H*DPR));
 if(modalCanvas.width!==cw||modalCanvas.height!==ch){
  modalCanvas.width=cw;modalCanvas.height=ch;
 }
 modalContext.setTransform(1,0,0,1,0,0);
 modalContext.clearRect(0,0,cw,ch);
 modalContext.setTransform(DPR,0,0,DPR,0,0);
 modalPlane.visible=true;
 // Don't dim the HUD while the score list occupies the board.
 scrimPlane.visible=!standaloneSettings&&!screenManager.isScores&&!screenManager.isLight;
 g=modalContext;
 try{if(screenManager.isLight)paintLightDirectionOverlay();else modalUI.paintModal(q);}
 finally{g=baseContext;}
 modalTexture.needsUpdate=true;
 perf.textureChanged('modal');
}
inputController=createInputController({
 screen,document,window,
 getViewport:()=>({width:W,height:H}),getRegions:()=>regions,
 getModal:()=>screenManager.active,getModalView:()=>modalUI.view,
 getOptionsScroll:()=>modalUI.scroll,setOptionsScroll:v=>{modalUI.scroll=v;},
 getOptionsMaxScroll:()=>modalUI.maxScroll,
 setScrollVelocity:v=>{scrollVelocity=v;},
 setBaseDirty:(act)=>{
  if(act==='theme'||act==='options'||act==='light')layers.mark('base');
  else if(act==='board')layers.mark('board');
  // GPU button brightness needs only a shader-uniform update. Retain
  // original source painting on devices without sufficient GPU capability.
  else if(act&&!visualScene.controlsGpuEnabled)layers.mark('controls');
 },
 handleAction:act=>{
  const previous=game.status;
  const result=actions.dispatch(act);
  // PAUSE must retain its active button until release, even though
  // the game status changes immediately. Other transitions can clear it.
  if(game.status!==previous&&act!=='pause')buttonFeedback.clear();
  return result;
 },
 perform:act=>{
  const previous=game.status;
  const result=actions.perform(act);
  // PAUSE must retain its active button until release, even though
  // the game status changes immediately. Other transitions can clear it.
  if(game.status!==previous&&act!=='pause')buttonFeedback.clear();
  return result;
 },
 setSetting:actions.setSetting,settingValue,
 getLightBounds:lightBoardBounds,onLightPoint:setLightPosition,
 onLightExit:()=>screenManager.openOptions(),
 toggleScanlineMenu:()=>modalUI.toggleScanlineMenu(),
 chooseScanline:id=>modalUI.chooseScanline(id),
 openModal:()=>screenManager.close(),invalidate,clamp,
 onButtonPress:(hit,now,held)=>{
  if(buttonFeedback.press(hit,now,held))invalidate('button-press');
 },
 onButtonRelease:(hit,now)=>{
  if(buttonFeedback.release(hit,now))invalidate('button-release');
 },
 canInteract:()=>!portraitGate.matches&&graphicsHealth.status==='ready'&&appLifecycle?.canWork!==false
});
// Browser and installed-app lifecycle, viewport and update polling are delegated
// to Platform Manager. The renderer retains only its drawing responsibilities.
function syncFX(){
 const scoreBounds=screenManager.isScores?modalUI.modalBounds('scores'):null;
 const blurredLayout=scoreBounds?.landscapeFallback?{
  ...layoutInfo,boardX:scoreBounds.x,boardY:scoreBounds.y,
  boardW:scoreBounds.w,boardH:scoreBounds.h
 }:layoutInfo;
 // Light Control uses the SAME saved rendering effects as gameplay,
 // except phosphor persistence is paused so dragging remains immediate.
 // The paused-board popup blur is suppressed separately in the compositor.
 compositor.syncFX({fx:screenManager.isLight?
  {...settings.effects,persistence:false}:settings.effects,
  theme:settings.theme,width:W,height:H,dpr:DPR,
 boardStatus:presentedBoardStatus(),modalOpen:screenManager.hasModal,
  scoresOverlay:screenManager.isScores,
  popupStatus:lastPaintedBoardPopupStatus,layoutInfo:blurredLayout,
  isolateLightWindow:screenManager.isLight,
  pieceMaskEnabled:boardPlane.visible});
}
function cancelPendingFrame(){
 if(frameHandle!==null){cancelAnimationFrame(frameHandle);frameHandle=null;}
 queued=false;
}
function requestFrame(){
 if(!queued&&!document.hidden&&graphicsHealth.canRender&&
    appLifecycle?.canWork!==false){
  queued=true;frameHandle=requestAnimationFrame(frame);
 }
}
function frame(now){
 queued=false;frameHandle=null;
 if(!graphicsHealth.canRender||appLifecycle?.canWork===false)return;
 perf.recordRaf(now);
 const frameStarted=perf.startFrame();
 try{
  const dt=clamp(now-lastTime,0,100);lastTime=now;
  const prior=captureGameVisualState(game);
  // Only redraw gameplay pixels when the *visible state* really changes.
  // Gravity timers may advance on every RAF tick without moving a piece.
  const tickStarted=performance.now();
  const advanced=lineClearFX?false:game.tick(dt);
  const visualChanged=gameVisualStateChanged(prior,game);
  const terminalChanged=terminalLog.advance(now);
  const cursorVisible=terminalLog.cursorVisible(now);
  if((terminalChanged||cursorVisible!==lastTerminalCursorVisible)&&
      !screenManager.isOptions){
   layers.mark('terminal');layers.reason('terminal-log');
  }
  lastTerminalCursorVisible=cursorVisible;
  perf.recordDuration('logic',performance.now()-tickStarted);
  if(lineClearFX&&(game.status==='playing'||lineClearFX.finalPoints)){
   const previousPhase=flashPhase(lineClearFX.elapsed,LINE_FLASH_TOGGLE_MS);
   lineClearFX.elapsed+=dt;
   const finished=lineClearFX.elapsed>=LINE_FLASH_MS;
   if(finished){
    const finalClear=lineClearFX.finalPoints;
    lineClearFX=null;
    if(finalClear)queueTerminalMessage('SESSION: GAME OVER','GM: OVER',true);
   }
   if(finished||flashPhase(lineClearFX.elapsed,LINE_FLASH_TOGGLE_MS)!==previousPhase){
    layers.mark('board');layers.reason('flash');
   }
  }
  if(visualChanged){
   layers.mark('board');
   // Ordinary gravity shifts only the board, not the surrounding UI.
   if(game.score!==prior.score)actions.observeScore();
   if(game.score!==prior.score||game.lines!==prior.lines||
    game.level!==prior.level)layers.mark('sidebar');
   if(game.pieces!==prior.pieces||game.hold!==prior.hold||
    game.current!==prior.piece)layers.mark('sidebar');
   if(game.status!==prior.status){
    layers.mark('base');
    // Stop the input flash, without clearing photons already on the screen.
    buttonFeedback.clear();
   }
   layers.reason('gravity');
   if(game.lines>prior.lines)tone(590,.1);
   else if(game.pieces>prior.pieces)tone(180,.04);
   actions.onGameOver();
  }
  perf.recordGameChanges({advanced,visualChanged});
  if(screenManager.isOptions&&Math.abs(scrollVelocity)>.015){
   const before=modalUI.scroll;
   modalUI.scroll=clamp(modalUI.scroll+scrollVelocity*dt,0,modalUI.maxScroll);
   scrollVelocity*=Math.exp(-dt/190);
   if(modalUI.scroll===before||modalUI.scroll===0||modalUI.scroll===modalUI.maxScroll)scrollVelocity=0;
   else{layers.mark('modal');layers.reason('scroll');}
  }else scrollVelocity=0;
  // Pressed buttons animate their original grayscale Canvas2D artwork.
  const phosphorOn=settings.effects.persistence===true&&!screenManager.isLight;
  // Decay continues over the *whole display* while gameplay is paused.
  // This GPU-only update does not repaint stationary source canvases.
  if(phosphorOn&&now-lastHistoryRender>=33)
   layers.reason('phosphor-history');
  // Only repaint when the actual source luminance changes (206..255),
  // including the final return to baseline. Phosphor history owns the fade.
  const previousButtonSparks=buttonSparks;
  buttonSparks=buttonFeedback.sample(now,phosphorOn);
  if(buttonFeedbackChanged(previousButtonSparks,buttonSparks)){
   // V166: the opaque, cropped controls plane already hides the base
   // canvas' duplicate deck artwork. Avoid reuploading the entire base
   // texture for deck-only button animations. Header and board-status
   // popup buttons still invalidate base; consider BOTH sets so a
   // completed afterglow repaints the last illuminated pixels.
   if(screenManager.paintsModalLayer){
    // Settings cover the fullscreen source completely. Their buttons
    // illuminate ONLY the modal canvas; the base is refreshed on exit.
    if(buttonSparks.length||previousButtonSparks.length)layers.mark('modal');
   }else{
    const affected=buttonFeedbackLayers(
     previousButtonSparks,buttonSparks,layoutInfo||layout());
    // Game controls now use GPU uniform updates, not CanvasTexture
    // invalidation. Header and board-status popup buttons retain the
    // original source-owned brightness and require base painting.
    const canvasAffected=visualScene.controlsGpuEnabled?
     affected.filter(name=>name!=='controls'):affected;
    if(canvasAffected.length)layers.mark(...canvasAffected);
   }
   layers.reason('button-luminance');
  }
  // Uniform-only updates still render through the unchanged CRT FX,
  // allowing pressed pixels to contribute to bloom and phosphor naturally.
  if(visualScene.controlsGpuEnabled)controlLighting.update(buttonSparks);
  if(layers.needsRender()){
   const why=layers.beginRender();
   perf.recordRedrawReasons(why);
   const canvasDirty=['base','board','sidebar','controls','terminal','modal'].some(layer=>layers.needs(layer));
   if(canvasDirty||why.some(reason=>reason!=='phosphor-history'))paintGame();
   // Game remains visible immediately; terminal startup runs only in its own branch.
   surface.material.map=texture;
   const syncStarted=performance.now();
   syncFX();
   perf.recordDuration('sync',performance.now()-syncStarted);
   if(surface.visible)textureUploads.upload(texture,'base');
   if(boardPlane.visible){
    textureUploads.upload(boardTexture,'board');
    if(settings.effects.bloom)
     textureUploads.upload(pieceBloomMaskTexture,'piece-mask');
   }
   if(sidebarPlane.visible)textureUploads.upload(sidebarTexture,'sidebar');
   if(controlsPlane.visible)textureUploads.upload(controlsTexture,'controls');
   if(terminalPlane.visible)textureUploads.upload(terminalTexture,'terminal');
   if(modalPlane.visible)textureUploads.upload(modalTexture,'modal');
   if((!screenManager.hasModal||screenManager.isScores)&&presentedBoardStatus()!=='playing')
    textureUploads.upload(boardPopupTexture,'popup');
   renderer.info.reset();
   const renderStarted=perf.startRender();
   // Use time between actual GPU frames, not every gameplay RAF tick.
   // Display-wide phosphor light integrates at ~30 FPS; no raster scan.
   const elapsedRenderMs=lastHistoryRender>0?now-lastHistoryRender:dt;
   compositor.render(Math.max(1,Math.min(100,elapsedRenderMs))/1000);
   lastHistoryRender=now;
   graphicsHealth.rendered(); // A successful real frame completes recovery.
   perf.endRender(renderStarted);
   perf.recordWebglCalls(renderer.info.render.calls);
   const memory=renderer.info.memory;
   perf.setGPUStats({...compositor.passStats(),
    textures:memory?.textures,geometries:memory?.geometries,
    programs:renderer.info.programs?.length});
  }
  perf.recordState(game.status);
  perf.endFrame(frameStarted);
  const keepAnimating=needsContinuousFrame({
   gameStatus:game.status,lineClearPending:Boolean(lineClearFX?.finalPoints),
   redrawPending:layers.needsRender(),scrolling:Math.abs(scrollVelocity)>.015,
   buttonsActive:buttonSparks.length>0,persistence:phosphorOn
  });
  // A continuously active RAF already advances the terminal. Scheduling a
  // second timeout for the same work wastes callbacks and timer allocations.
  if(terminalTimer!==null){window.clearTimeout(terminalTimer);terminalTimer=null;}
  if(keepAnimating)requestFrame();
  else if(game.status!=='playing'&&!document.hidden){
   terminalTimer=window.setTimeout(()=>{
    terminalTimer=null;
    if(!document.hidden)requestFrame();
   },terminalLog.nextDelay(now));
  }
 }catch(e){
  graphicsHealth.recordFailure(e);
  // A WebGL loss can interrupt a frame in progress. Its restoration event
  // owns recovery; never leave a persistent fatal banner for that case.
  if(graphicsHealth.status==='lost')return;
  fatal.hidden=false;fatal.textContent='Three.js Tetris frame failed: '+String(e.stack||e);
  console.error(e);
 }
}
// All GPU and input resources belong to this page. They remain allocated
// during rotation, visibility suspension and Safari back/forward-cache navigation.
// Release only when the browser abandons the page without caching it.
const graphicsCleanup=createGraphicsCleanup({
 renderer,compositor,scene,
 textures:visualScene.textures,
 canvases:visualScene.canvases,
 getAudioContext:()=>audioCtx
});
appLifecycle=createAppLifecycle({
 onSuspend:()=>{
  // The lifecycle is already suspended: guarded UI actions are blocked.
  // Pause the rules directly and repaint the paused HUD on foreground return.
  if(game.status==='playing'){
   game.pause();
   layers.mark('base','board','controls');
   queueTerminalMessage('GAME: PAUSED','PAUSED');
  }
  inputController?.cancel();scrollVelocity=0;
  buttonFeedback.clear();buttonSparks=[];
  if(terminalTimer!==null){window.clearTimeout(terminalTimer);terminalTimer=null;}
  compositor.resetPersistence();
  cancelPendingFrame();lastTime=performance.now();perf.resetPacing();
  if(audioCtx?.state==='running'){
   try{void audioCtx.suspend().catch(()=>{});}catch(error){}
  }
 },
 onResume:()=>{
  lastTime=performance.now();perf.resetPacing();
  compositor.resetPersistence();
  // Re-measure the safe area after iOS Home Screen and bfcache returns.
  platform.resize(true);
  invalidate('resume');
 },
 onDispose:()=>runCleanupTasks([
  ['animation',cancelPendingFrame],
  ['terminal-timer',()=>{if(terminalTimer!==null)window.clearTimeout(terminalTimer);}],
  ['game-observer',unsubscribeGameEvents],
  ['input',()=>inputController?.dispose()],
  ['vector-tiles',()=>vectorTiles.dispose()],
  ['piece-shadows',()=>pieceShadows.dispose()],
  ['board-inset-shadows',()=>boardInsetShadows.dispose()],
  ['shadow-preview',()=>modalUI.dispose()],
  ['brick-frame',()=>brickFrame.dispose()],
  ['gpu-button-fallback-material',()=>controlsFallbackMaterial.dispose()],
  ['graphics-health',()=>graphicsHealth.detach()],
  ['portrait-gate',()=>portraitGate.removeEventListener('change',onPortraitGateChange)],
  ['platform',()=>platform.stop()],
  ['graphics',()=>graphicsCleanup.dispose()]
 ])
});
function syncAvailability(reason){
 if(document.hidden||pageInCache||portraitGate.matches)appLifecycle.suspend(reason);
 else appLifecycle.resume(reason);
}
function onPortraitGateChange(){syncAvailability('orientation');}
const platform=createPlatformManager({
 window,document,display,safeProbe,baseModuleURL:import.meta.url,
 buildVersion:THREE_BUILD_VERSION,
 getGameStatus:()=>game.status,
 isScreenOpen:()=>screenManager.hasModal,
 canReloadNewBuild:()=>!navigator.serviceWorker?.controller,
 stageWorkerUpdate:async()=>{
  const registration=await navigator.serviceWorker?.getRegistration?.('./');
  if(registration)await registration.update();
 },
 onViewport:({width,height,dpr})=>{
  if(portraitGate.matches)return;
  const unchanged=width===W&&height===H&&dpr===DPR;
  cachedLayout=null;
  if(!unchanged){
   W=width;H=height;DPR=dpr;
   lightPosition=null;
   buttonFeedback.clear();buttonSparks=[];
  compositor.resetPersistence();
   input.width=Math.round(W*DPR);input.height=Math.round(H*DPR);
   boardPopupCanvas.width=input.width;boardPopupCanvas.height=input.height;
   g.setTransform(DPR,0,0,DPR,0,0);
   renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
   compositor.resize(W,H,DPR);
   compositor.resetPersistence();
   perf.setViewport(W,H,DPR);
  }
  layers.mark('base','board','sidebar','controls','terminal');
  invalidate('resize');
 },
 onVisibility:()=>syncAvailability('visibility'),
 onPageHide:persisted=>{
  pageInCache=persisted;
  appLifecycle.pageHide(persisted);
 },
 onPageShow:persisted=>{
  if(!persisted)return;
  pageInCache=false;
  syncAvailability('bfcache');
 }
});
graphicsHealth.attach();
platform.start();
portraitGate.addEventListener('change',onPortraitGateChange);
syncAvailability(portraitGate.matches?'orientation':'visibility');
requestFrame();
// One check after initialization also covers standalone cold launches.
void platform.checkForNewBuild();

 return true;
}
