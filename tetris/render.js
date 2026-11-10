/* NOMAD — internally compartmentalized visual engine; game rules live elsewhere. */
import * as THREE from './vendor/three/three.bundle.js';
import {I_GRAVEL_BITS,J_GRAVEL_BITS} from './assets/tiles/gravel-layout.mjs?v119';
import {PIECE_LUMINANCE,renderIFragmentSVG} from './assets/tiles/smooth-geometry.mjs?v126';
// Rendering diagnostics: frame timing, GPU pass instrumentation and reports.
const RenderDiagnostics=(()=>{
/* Frame timings, debug reports and clipboard. */


/* Tetris System — low-overhead in-memory performance recorder.
 * V055 enables recording quietly for explicit user-initiated debug copies.
 * CPU render submission is not GPU execution time; RAF is not display FPS.
 * No network requests or persistent data are made by this module.
 */
function createPerfMonitor({enabled=false,now=()=>performance.now(),
 log=summary=>console.info('[TETRIS PERF]',summary),
 onSample=()=>{},intervalMs=5000}={}){
 let started=enabled?now():0,last=null,lastRaf=null;
 let viewport=null,gpu=null;
 // Internal scheduler labels, kept exact rather than all mapped to "unknown".
 const reasonNames=new Set([
  'startup','input','gravity','flash','scroll','resize','resume',
  'terminal-log','terminal-event','button-luminance','button-press',
  'button-release','phosphor-history','context-restored',
  'nomad-mark-ready','font-ready','vector-tile-ready','brick-svg-ready'
 ]);
 const fresh=()=>({ticks:0,draws:0,frameMs:0,renderMs:0,maxFrameMs:0,
  rafSamples:0,rafDeltaTotal:0,maxRafDelta:0,slowRafTicks:0,
  baseUploadRequests:0,boardUploadRequests:0,sidebarUploadRequests:0,controlsUploadRequests:0,terminalUploadRequests:0,popupUploadRequests:0,modalUploadRequests:0,
  logicMs:0,logicCalls:0,basePaintMs:0,basePaintCount:0,
  boardPaintMs:0,boardPaintCount:0,sidebarPaintMs:0,sidebarPaintCount:0,
  controlsPaintMs:0,controlsPaintCount:0,
  terminalPaintMs:0,terminalPaintCount:0,
  modalPaintMs:0,modalPaintCount:0,syncMs:0,syncCount:0,
  redrawReasons:{},frameStates:{},gravityTickAdvances:0,visualStateChanges:0,
  passTimes:{},webglCalls:0,renderSubmissions:0,uploadTimes:{},
  worstFrame:null});
 let counters=fresh();
 // Reused during each RAF: no additional timers, paints, or GPU readbacks.
 let frameReasons=new Set(),frameStageMs={},frameUploadMs=0,
  frameUploadLayers={},frameState='other';
 function recordRaf(timestamp){
  if(!enabled||!Number.isFinite(timestamp))return;
  if(lastRaf!==null){
   const dt=timestamp-lastRaf;
   // Exclude suspended tabs and idle-to-active transitions.
   if(dt>0&&dt<250){
    counters.rafSamples++;
    counters.rafDeltaTotal+=dt;
    counters.maxRafDelta=Math.max(counters.maxRafDelta,dt);
    if(dt>34)counters.slowRafTicks++;
   }
  }
  lastRaf=timestamp;
 }
 function resetPacing(){if(enabled)lastRaf=null;}
 function setViewport(width,height,dpr){
  if(!enabled)return;
  viewport={width:Math.max(1,Math.round(width)),
   height:Math.max(1,Math.round(height)),dpr:Number(dpr)||1};
 }
 function setGPUStats(stats){
  if(!enabled)return;
  gpu={textures:stats?.textures??null,geometries:stats?.geometries??null,
   programs:stats?.programs??null,activePasses:stats?.activePasses??null,
   totalPasses:stats?.totalPasses??null};
 }
 function buildSnapshot(period=now()-started){
  const rounded=value=>+value.toFixed(2);
  return {seconds:rounded(Math.max(0,period)/1000),
   frameTicks:counters.ticks,draws:counters.draws,
   avgFrameCpuMs:+(counters.frameMs/Math.max(1,counters.ticks)).toFixed(3),
   maxFrameCpuMs:+counters.maxFrameMs.toFixed(3),
   avgRenderSubmitMs:+(counters.renderMs/Math.max(1,counters.draws)).toFixed(3),
   rafSamples:counters.rafSamples,
   avgRafMs:counters.rafSamples?rounded(counters.rafDeltaTotal/counters.rafSamples):null,
   maxRafMs:counters.rafSamples?rounded(counters.maxRafDelta):null,
   slowRafTicks:counters.slowRafTicks,
   baseUploadRequests:counters.baseUploadRequests,
   boardUploadRequests:counters.boardUploadRequests,
   sidebarUploadRequests:counters.sidebarUploadRequests,
   controlsUploadRequests:counters.controlsUploadRequests,
   terminalUploadRequests:counters.terminalUploadRequests,
   popupUploadRequests:counters.popupUploadRequests,
   modalUploadRequests:counters.modalUploadRequests,
   avgLogicMs:+(counters.logicMs/Math.max(1,counters.logicCalls)).toFixed(3),
   avgBasePaintMs:+(counters.basePaintMs/Math.max(1,counters.basePaintCount)).toFixed(3),
   avgBoardPaintMs:+(counters.boardPaintMs/Math.max(1,counters.boardPaintCount)).toFixed(3),
   avgSidebarPaintMs:+(counters.sidebarPaintMs/Math.max(1,counters.sidebarPaintCount)).toFixed(3),
   avgControlsPaintMs:+(counters.controlsPaintMs/Math.max(1,counters.controlsPaintCount)).toFixed(3),
   avgTerminalPaintMs:+(counters.terminalPaintMs/Math.max(1,counters.terminalPaintCount)).toFixed(3),
   avgModalPaintMs:+(counters.modalPaintMs/Math.max(1,counters.modalPaintCount)).toFixed(3),
   avgSyncMs:+(counters.syncMs/Math.max(1,counters.syncCount)).toFixed(3),
   basePaints:counters.basePaintCount,boardPaints:counters.boardPaintCount,
   sidebarPaints:counters.sidebarPaintCount,controlsPaints:counters.controlsPaintCount,
   terminalPaints:counters.terminalPaintCount,
   modalPaints:counters.modalPaintCount,
   redrawReasons:{...counters.redrawReasons},frameStates:{...counters.frameStates},
   gravityTickAdvances:counters.gravityTickAdvances,
   visualStateChanges:counters.visualStateChanges,
   avgWebglCalls:+(counters.webglCalls/Math.max(1,counters.renderSubmissions)).toFixed(2),
   uploadTimes:Object.fromEntries(Object.entries(counters.uploadTimes).map(([name,v])=>
    [name,{calls:v.calls,avgCpuMs:+(v.cpuMs/v.calls).toFixed(3),
     maxCpuMs:+v.maxCpuMs.toFixed(3),totalCpuMs:+v.cpuMs.toFixed(2),
     estimatedSourceMB:+(v.sourceBytes/1048576).toFixed(2),
     sourcePixels:v.sourcePixels}])),
   passTimes:Object.fromEntries(Object.entries(counters.passTimes).map(([name,v])=>
    [name,{calls:v.calls,avgCpuMs:+(v.cpuMs/v.calls).toFixed(3),
     maxCpuMs:+v.maxCpuMs.toFixed(3),totalCpuMs:+v.cpuMs.toFixed(2)}])),
   worstFrame:counters.worstFrame?{...counters.worstFrame,
    reasons:[...counters.worstFrame.reasons],
    stageCpuMs:{...counters.worstFrame.stageCpuMs},
    uploadLayers:{...counters.worstFrame.uploadLayers}}:null,
   viewport:viewport?{...viewport}:null,gpu:gpu?{...gpu}:null};
 }
 function currentSnapshot(){return enabled?buildSnapshot():null;}
 // Stage measurements are CPU-side only. Measuring each stage separately avoids
 // interpreting time inside compositor.render() as game logic or canvas drawing.
 function recordDuration(kind,elapsed){
  if(!enabled||!Number.isFinite(elapsed)||elapsed<0)return;
  frameStageMs[kind]=(frameStageMs[kind]||0)+elapsed;
  if(kind==='logic'){counters.logicCalls++;counters.logicMs+=elapsed;}
  else if(kind==='base'){counters.basePaintCount++;counters.basePaintMs+=elapsed;}
  else if(kind==='board'){counters.boardPaintCount++;counters.boardPaintMs+=elapsed;}
  else if(kind==='sidebar'){counters.sidebarPaintCount++;counters.sidebarPaintMs+=elapsed;}
  else if(kind==='controls'){counters.controlsPaintCount++;counters.controlsPaintMs+=elapsed;}
  else if(kind==='terminal'){counters.terminalPaintCount++;counters.terminalPaintMs+=elapsed;}
  else if(kind==='modal'){counters.modalPaintCount++;counters.modalPaintMs+=elapsed;}
  else if(kind==='sync'){counters.syncCount++;counters.syncMs+=elapsed;}
 }
 function recordRedrawReasons(reasons){
  if(!enabled)return;
  const names=Array.isArray(reasons)&&reasons.length?new Set(reasons):new Set(['unknown']);
  for(const name of names){
   const key=reasonNames.has(name)?name:'unknown';
   counters.redrawReasons[key]=(counters.redrawReasons[key]||0)+1;
   frameReasons.add(key);
  }
 }
 function recordUpload(name,elapsed,source={}){
  if(!enabled||!Number.isFinite(elapsed)||elapsed<0)return;
  const key=['base','board','sidebar','controls','terminal','popup','modal'].includes(name)?name:'other';
  const v=counters.uploadTimes[key]||(counters.uploadTimes[key]={
   calls:0,cpuMs:0,maxCpuMs:0,sourcePixels:0,sourceBytes:0
  });
  // Approximate uncompressed RGBA8 source size, NOT GPU VRAM/bandwidth.
  const width=Number(source.width),height=Number(source.height);
  const pixels=Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&
   width>0&&height>0&&width<=16384&&height<=16384?width*height:0;
  v.calls++;v.cpuMs+=elapsed;v.maxCpuMs=Math.max(v.maxCpuMs,elapsed);
  v.sourcePixels+=pixels;v.sourceBytes+=pixels*4;
  frameUploadMs+=elapsed;
  frameUploadLayers[key]=(frameUploadLayers[key]||0)+1;
 }
 function recordPass(name,elapsed){
  if(!enabled||!Number.isFinite(elapsed)||elapsed<0)return;
  const key=String(name);
  const v=counters.passTimes[key]||(counters.passTimes[key]={calls:0,cpuMs:0,maxCpuMs:0});
  v.calls++;v.cpuMs+=elapsed;v.maxCpuMs=Math.max(v.maxCpuMs,elapsed);
 }
 function recordWebglCalls(n){
  if(!enabled||!Number.isFinite(n)||n<0)return;
  counters.renderSubmissions++;counters.webglCalls+=n;
 }
 function recordGameChanges({advanced=false,visualChanged=false}={}){
  if(!enabled)return;
  if(advanced)counters.gravityTickAdvances++;
  if(visualChanged)counters.visualStateChanges++;
 }
 function recordState(state){
  if(!enabled)return;
  const key=['playing','paused','ready','over'].includes(state)?state:'other';
  counters.frameStates[key]=(counters.frameStates[key]||0)+1;
  frameState=key;
 }
 function startFrame(){
  if(!enabled)return 0;
  frameReasons=new Set();frameStageMs={};frameUploadMs=0;
  frameUploadLayers={};frameState='other';
  return now();
 }
 function endFrame(start){
  if(!enabled)return;
  const elapsed=now()-start;
  counters.ticks++;
  counters.frameMs+=elapsed;
  if(elapsed>counters.maxFrameMs){
   counters.maxFrameMs=elapsed;
   counters.worstFrame={
    cpuMs:+elapsed.toFixed(3),state:frameState,
    reasons:[...frameReasons],stageCpuMs:Object.fromEntries(
     Object.entries(frameStageMs).map(([name,ms])=>[name,+ms.toFixed(3)])),
    preuploadCpuMs:+frameUploadMs.toFixed(3),
    uploadLayers:{...frameUploadLayers}
   };
  }
  const period=now()-started;
  if(period>=intervalMs){
   const value=buildSnapshot(period);
   last=value;
   try{log(value);}catch(err){/* Diagnostics must never break gameplay. */}
   try{onSample(value);}catch(err){/* Ignore diagnostics errors. */}
   counters=fresh();started=now();
  }
 }
 function startRender(){return enabled?now():0;}
 function endRender(start){
  if(!enabled)return;
  counters.draws++;counters.renderMs+=now()-start;
 }
 function textureChanged(kind){
  if(!enabled)return;
  if(kind==='base')counters.baseUploadRequests++;
  else if(kind==='board')counters.boardUploadRequests++;
  else if(kind==='sidebar')counters.sidebarUploadRequests++;
  else if(kind==='controls')counters.controlsUploadRequests++;
  else if(kind==='terminal')counters.terminalUploadRequests++;
  else if(kind==='popup')counters.popupUploadRequests++;
  else if(kind==='modal')counters.modalUploadRequests++;
 }
 return Object.freeze({enabled,startFrame,endFrame,startRender,endRender,
  textureChanged,recordRaf,resetPacing,setViewport,setGPUStats,
  recordDuration,recordRedrawReasons,recordGameChanges,recordState,
  recordUpload,recordPass,recordWebglCalls,snapshot:()=>last,currentSnapshot});
}

/* V059: opt-in-friendly, CPU-side per-pass instrumentation.
 * WebGL commands can queue asynchronously or block; elapsed time from these
 * wrappers is NOT GPU shader duration. Restore original methods on disposal.
 */
function instrumentCompositorPasses(passes,labels,onTiming,now=()=>performance.now()){
 const originals=[];
 passes.forEach((pass,i)=>{
  const original=pass.render;
  if(typeof original!=='function')return;
  const name=labels[i]||('Pass '+(i+1));
  function timedRender(...args){
   const began=now();
   try{return original.apply(this,args);}
   finally{
    const elapsed=now()-began;
    try{onTiming(name,elapsed);}catch(e){/* Never break compositor */ }
   }
  }
  originals.push({pass,original,timedRender});
  pass.render=timedRender;
 });
 return Object.freeze({
  dispose(){
   for(const {pass,original,timedRender} of originals)
    if(pass.render===timedRender)pass.render=original;
  }
 });
}

/* V060: Pre-upload only newly changed CanvasTextures through Three.js's
 * supported WebGLRenderer.initTexture API. Measures CPU-side upload submission,
 * which may include graphics-driver waits; NOT actual GPU execution time.
 *
 * Tracks Texture.version (incremented by needsUpdate) independently for each
 * texture and never uploads the same version twice through this helper.
 */
function createTextureUploadProfiler({renderer,onTiming=()=>{},now=()=>performance.now()}={}){
 const revisions=new WeakMap();
 function upload(texture,name){
  if(!texture||typeof renderer?.initTexture!=='function')return false;
  const revision=texture.version;
  if(revisions.get(texture)===revision)return false;
  const began=now();
  // Do not mark as synchronized until the upload API returned successfully.
  renderer.initTexture(texture);
  revisions.set(texture,revision);
  // Source dimensions are passed only as diagnostic metadata. They
  // estimate RGBA8 input pixels; they are not GPU timing or VRAM usage.
  const source=texture.image;
  try{onTiming(name,now()-began,{
   width:source?.width||0,height:source?.height||0
  });}catch(e){/* Profiling must not affect gameplay. */}
  return true;
 }
 return Object.freeze({upload});
}

/* Tetris System — diagnostics exported only by explicit user action.
 * Pure formatter: no network, storage, automatic sharing or mutable state.
 */
function formatDebugReport({version,createdAt,platform,viewport,game,display,buttonRenderer,gpu,graphics,lifecycle,offline,samples=[],current}={}){
 const value=(v,unit='')=>v===null||v===undefined||v===''?'n/a':String(v)+unit;
 const rows=[
  'TETRIS SYSTEM / DEBUG REPORT',
  'Build: V'+value(version),
  'Captured: '+value(createdAt),
  'Browser: '+value(platform),
  'Viewport: '+(viewport?[viewport.width+'x'+viewport.height,'render DPR '+viewport.dpr,'device DPR '+value(viewport.deviceDpr)].join(' / '):'n/a'),
  'State: '+value(game?.status)+' / level '+value(game?.level)+' / score '+value(game?.score)+' / lines '+value(game?.lines),
  'Display: '+value(display?.theme)+' phosphor / '+value(display?.orientation)+' / '+value(display?.phosphor?'on':'off')+' tint',
  'Controls rendering: '+value(buttonRenderer),
  '',
  'RECENT FRAME SAMPLES (2-second windows, newest last)',
  'CPU frame = JS time; GPU submit = CPU call time, not GPU shader duration.',
  'RAF interval = pacing between scheduled frames, not physical display refresh rate.',
  'PASS CPU = time inside each compositor pass; may include driver waits, NOT GPU shader timing.',
  'PRE-UPLOAD = CPU time for renderer.initTexture on changed canvases; not GPU execution time.',
  'DIRTY B/D/S/C/T/P/M = canvas texture refresh requests: base / board / sidebar / controls / terminal / popup / modal.',
  'PRE-UPLOAD counts = actual changed-texture initTexture calls; source MB assumes uncompressed RGBA8 (NOT VRAM).',
  'PEAK FRAME attributes the slowest JS frame in each sample; input and render causes may overlap.'
 ];
 const observed=samples.slice(-8);
 if(current&&current.frameTicks>0)observed.push(current);
 if(!observed.length)rows.push('No complete sample yet. Start a game for a few seconds, then copy again.');
 observed.forEach((s,i)=>{
  rows.push('Sample '+(i+1)+': '+value(s.seconds,'s')+
   ' | frames '+value(s.frameTicks)+' | draws '+value(s.draws)+
   ' | RAF avg/max '+value(s.avgRafMs,'ms')+'/'+value(s.maxRafMs,'ms')+
   ' | slow '+value(s.slowRafTicks)+
   ' | CPU avg/max '+value(s.avgFrameCpuMs,'ms')+'/'+value(s.maxFrameCpuMs,'ms')+
   ' | submit '+value(s.avgRenderSubmitMs,'ms')+
   ' | DIRTY B/D/S/C/T/P/M '+value(s.baseUploadRequests)+'/'+value(s.boardUploadRequests)+'/'+value(s.sidebarUploadRequests)+'/'+value(s.controlsUploadRequests)+'/'+value(s.terminalUploadRequests??0)+'/'+value(s.popupUploadRequests)+'/'+value(s.modalUploadRequests));
  if(s.basePaints!==undefined||s.avgLogicMs!==undefined){
   const reasons=Object.entries(s.redrawReasons||{}).map(([k,n])=>k+':'+n).join(', ')||'none';
   rows.push('  STAGES: logic '+value(s.avgLogicMs,'ms/RAF')+
    ' | Canvas base '+value(s.avgBasePaintMs,'ms')+' ('+value(s.basePaints)+' paints)'+
    ' | Canvas board '+value(s.avgBoardPaintMs,'ms')+' ('+value(s.boardPaints)+' paints)'+
    ' | Canvas sidebar '+value(s.avgSidebarPaintMs,'ms')+' ('+value(s.sidebarPaints)+' paints)'+
    ' | Canvas controls '+value(s.avgControlsPaintMs,'ms')+' ('+value(s.controlsPaints)+' paints)'+
    ' | Canvas terminal '+value(s.avgTerminalPaintMs,'ms')+' ('+value(s.terminalPaints)+' paints)'+
    ' | Canvas modal '+value(s.avgModalPaintMs,'ms')+' ('+value(s.modalPaints)+' paints)'+
    ' | FX setup '+value(s.avgSyncMs,'ms'));
   const states=Object.entries(s.frameStates||{}).map(([k,n])=>k+':'+n).join(', ')||'unclassified';
   rows.push('  RAF STATES: '+states);
   rows.push('  REDRAW CAUSES: '+reasons+
    ' (multiple causes may apply to one render)');
   if(s.gravityTickAdvances!==undefined||s.visualStateChanges!==undefined)
    rows.push('  GAME CHANGES: gravity tick advances '+value(s.gravityTickAdvances)+
     ' | actual visual changes '+value(s.visualStateChanges));
   if(s.uploadTimes){
    const parts=Object.entries(s.uploadTimes).map(([name,v])=>
     name+' '+value(v.avgCpuMs,'ms')+'×'+v.calls+
      (Number.isFinite(v.estimatedSourceMB)?' / ~'+v.estimatedSourceMB+'MB src':''));
    rows.push('  PRE-UPLOAD: '+(parts.length?parts.join(' | '):'none'));
   }
   if(s.worstFrame){
    const peak=s.worstFrame;
    const reasons=(peak.reasons||[]).join(', ')||'none';
    const uploads=Object.entries(peak.uploadLayers||{}).map(
     ([name,n])=>name+':'+n).join(', ')||'none';
    const stages=Object.entries(peak.stageCpuMs||{}).map(
     ([name,ms])=>name+':'+ms+'ms').join(', ')||'none';
    rows.push('  PEAK FRAME: '+value(peak.cpuMs,'ms')+
     ' / state '+value(peak.state)+' / causes '+reasons+
     ' / pre-upload '+value(peak.preuploadCpuMs,'ms')+
     ' / layers '+uploads+' / stages '+stages);
   }
   if(s.passTimes){
    const passes=Object.entries(s.passTimes)
     .sort((a,b)=>b[1].totalCpuMs-a[1].totalCpuMs);
    rows.push('  WEBGL: '+value(s.avgWebglCalls)+' draw calls/render (entire pipeline)');
    rows.push('  PASS CPU: '+(passes.length?passes.map(([name,v])=>
     name+' '+value(v.avgCpuMs,'ms')+'×'+v.calls).join(' | '):'none'));
   }
  }
 });
 const gfx=gpu||current?.gpu||samples.at(-1)?.gpu;
 rows.push('', 'GPU RESOURCES (Three.js counters; not GPU utilization)');
 rows.push('Textures: '+value(gfx?.textures)+' / geometries: '+value(gfx?.geometries)+' / programs: '+value(gfx?.programs));
 rows.push('Active passes: '+value(gfx?.activePasses)+' / total passes: '+value(gfx?.totalPasses));
 // Three.js counters are not byte counts. Sample trends can reveal persistent
 // growth, but cannot by themselves prove a GPU memory leak.
 const gpuHistory=[...samples.slice(-8),...(current?.frameTicks>0?[current]:[])]
  .map(sample=>sample?.gpu).filter(Boolean);
 rows.push('', 'GPU RESOURCE TREND (recent samples; counts, not VRAM bytes)');
 let hasTrend=false;
 for(const [field,label] of [['textures','Textures'],['geometries','Geometries'],['programs','Programs']]){
  const values=gpuHistory.map(sample=>sample[field]).filter(Number.isFinite);
  if(!values.length)continue;
  hasTrend=true;
  const delta=values.at(-1)-values[0];
  rows.push(label+': first '+values[0]+' / latest '+values.at(-1)+
   ' / peak '+Math.max(...values)+' / change '+(delta>0?'+':'')+delta+
   ' (samples '+values.length+')');
 }
 if(!hasTrend)rows.push('No resource trend samples yet.');
 rows.push('These are Three.js resource counters, not measured GPU memory usage or proof of a leak.');
 if(graphics){
  rows.push('', 'WEBGL LIFECYCLE');
  rows.push('Context: '+value(graphics.status)+
   ' / losses '+value(graphics.losses)+
   ' / restore events '+value(graphics.restores)+
   ' / frame errors '+value(graphics.renderFailures));
  if(graphics.lossDurationMs!==null&&graphics.lossDurationMs!==undefined)
   rows.push('Context unavailable for '+value(Math.round(graphics.lossDurationMs),'ms'));
  if(graphics.lastError)rows.push('Last render error: '+String(graphics.lastError).replace(/\s+/g,' ').slice(0,240));
  const recent=(graphics.history||[]).slice(-8);
  rows.push('Recent graphics events: '+(recent.length?recent.map(event=>
   value(event.at)+' '+value(event.type)).join(' | '):'none'));
 }
 if(lifecycle){
  rows.push('', 'APPLICATION LIFECYCLE');
  rows.push('Page: '+value(lifecycle.status)+
   ' / suspensions '+value(lifecycle.suspends)+
   ' / resumes '+value(lifecycle.resumes)+
   ' / disposals '+value(lifecycle.disposals));
  rows.push('Last transition: '+value(lifecycle.lastReason));
  if(lifecycle.lastError)rows.push('Last lifecycle error: '+
   String(lifecycle.lastError).replace(/\s+/g,' ').slice(0,240));
  const recent=(lifecycle.events||[]).slice(-8);
  rows.push('Recent page events: '+(recent.length?recent.map(event=>
   value(event.type)+'('+value(event.reason)+')').join(' | '):'none'));
  rows.push('Temporary background and bfcache suspensions preserve WebGL resources.');
 }
 if(offline){
  rows.push('', 'OFFLINE PACKAGE');
  rows.push('Network: '+value(offline.network)+
   ' / service worker: '+(offline.supported?'supported':'unsupported')+
   ' / controlling page: '+(offline.controlled?'yes':'no'));
  rows.push('Offline use requires a completed online install; browser cache may be cleared or evicted.');
 }
 rows.push('Current settings: '+value(display?.settings));
 return rows.join('\n');
}

/* Tetris System — direct, user-initiated copy with Safari fallback.
 * Call copyText synchronously from the pointer/key activation handler.
 */

return {createPerfMonitor,instrumentCompositorPasses,createTextureUploadProfiler,formatDebugReport};
})();
const {instrumentCompositorPasses}=RenderDiagnostics;

// Visual interaction geometry: drawn buttons and hitboxes share one definition.
const InteractionGeometry=(()=>{
/* Shared control geometry, hit testing and input dispatch. */


/* V065 — one geometry/interaction model for drawn Canvas2D controls.
 * No Canvas, Three.js, DOM, settings, or game state dependencies.
 * Values use the app's established CSS-pixel coordinates.
 */
function makeRegion(x,y,w,h,act,options={}){
 return {x,y,w,h,act,...options};
}
function makeButtonControl(label,x,y,w,h,act,
 {light=false,repeat=false,arrow=false,modalControl=false}={}){
 return {
  kind:'button',label,x,y,w,h,act,light,repeat,arrow,modalControl,
  hitbox:makeRegion(x,y,w,h,act,{kind:'button',light,repeat,modalControl})
 };
}
// Slider label/value geometry and pointer hitbox must always agree.
function makeSliderControl(x,y,w,setting,value,size=15,gap=6){
 const [label,field,min,max,step,unit]=setting;
 const digits=step<.1?2:step<1?1:0;
 const valueText=Number(value).toFixed(digits)+unit;
 const labelW=label?(label==='X'||label==='Y'?12:label==='RADIUS'?51:65):0;
 const valueW=Math.max(30,Math.ceil(valueText.length*6.8));
 const trackX=x+labelW+(label?gap:0)+size/2;
 const trackEnd=x+w-valueW-gap-size/2;
 const trackW=Math.max(1,trackEnd-trackX);
 const fraction=Math.max(0,Math.min(1,(value-min)/(max-min)));
 const hitbox=makeRegion(trackX-size/2,y-14,trackW+size,28,'slider',
  {field,min,max,step,trackX,trackW,modalControl:true});
 return {kind:'slider',label,field,min,max,step,unit,value,
  x,y,w,size,gap,valueText,labelW,valueW,trackX,trackW,fraction,hitbox};
}
// Last-drawn region wins, matching the existing overlay z-order.
// A settings control must lie inside the scroll viewport vertically.
function findRegionAt(regions,point,modal=null,modalView=null){
 for(let i=regions.length-1;i>=0;i--){
  const r=regions[i];
  if(!(point.x>=r.x&&point.x<=r.x+r.w&&point.y>=r.y&&point.y<=r.y+r.h))continue;
  if(modal==='options'&&r.modalControl&&modalView&&
   (point.y<modalView.y||point.y>modalView.y+modalView.h))continue;
  return r;
 }
 return undefined;
}
// The handle geometry exported by makeSliderControl is used without
// recomputing a potentially different track in the pointer controller.
function sliderValueAt(region,x){
 const f=Math.max(0,Math.min(1,(x-region.trackX)/Math.max(1,region.trackW)));
 const v=region.min+f*(region.max-region.min);
 const stepped=Math.round(v/region.step)*region.step;
 return Number(stepped.toFixed(4));
}

/* Tetris System V052 — touch/mouse/keyboard input adapter.
 * Hit regions come from the rendering layer; gameplay and settings changes
 * go through injected callbacks. A controller owns the repeat timers and
 * active pointer so they can be cancelled safely on modal transitions.
 */

return {makeRegion,makeButtonControl,makeSliderControl,findRegionAt,sliderValueAt};
})();
const {makeRegion,makeButtonControl,makeSliderControl,findRegionAt,sliderValueAt}=InteractionGeometry;

// GPU effects, compositing, rendering feedback.
const CRT=(()=>{
/* CRT passes, button lighting and render invalidation. */

const {Pass,FullScreenQuad,EffectComposer,RenderPass,UnrealBloomPass,ShaderPass,OutputPass}=THREE;

/* NOMAD V104 — whole-display phosphor envelope.
 * No raster beam or refresh coupling. Rise is fast; falling light follows a
 * continuously adjustable exponential time constant. GPU uses the same model.
 * This is a neutral luminance approximation, not calibrated tube physics.
 */
const PHOSPHOR_BOUNDS=Object.freeze({
 minPersistenceMs:10,maxPersistenceMs:120,
 stepPersistenceMs:10,defaultPersistenceMs:120,
 riseMs:12
});
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
function normalizePersistenceMs(value){
 const n=Number(value);
 return Number.isFinite(n)?
  clamp(Math.round(n/PHOSPHOR_BOUNDS.stepPersistenceMs)*
   PHOSPHOR_BOUNDS.stepPersistenceMs,
   PHOSPHOR_BOUNDS.minPersistenceMs,PHOSPHOR_BOUNDS.maxPersistenceMs):
  PHOSPHOR_BOUNDS.defaultPersistenceMs;
}
// Fast excitation plus a slower fall after the incoming video loses light.
// No artificial reset is needed for a menu, pause, or gameplay transition.
function integratePhosphorResponse(
 prior,drive,seconds,persistenceMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,riseMs=PHOSPHOR_BOUNDS.riseMs
){
 const previous=clamp(Number(prior)||0,0,1);
 const target=clamp(Number(drive)||0,0,1);
 const duration=Math.max(0,Number(seconds)||0);
 const tau=(target>previous?Math.max(.001,riseMs):normalizePersistenceMs(persistenceMs))/1000;
 return target+(previous-target)*Math.exp(-duration/tau);
}

/* NOMAD V104 — spatially local, full-display phosphor persistence.
 * Preserve the V103 temporal envelope: 12ms excitation, 10-120ms decay.
 * Only the luminance at the SAME native-resolution pixel influences its
 * history. No spatial point-spread, kernel, bloom, or scanline filtering.
 * The downstream artistic Bloom pass exclusively owns glow and halation;
 * the downstream CRT mask independently owns optional static scanlines.
 * No reset on game pause or menu transition.
 */

const vertex=String.raw`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

const historyFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tPrevious;
uniform float uBase,uDelta,uDecayTau,uRiseTau,uReset;
void main(){
 float intensity=dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722));
 float drive=clamp((intensity-uBase)/max(.001,1.0-uBase),0.0,1.0);
 float encoded=texture2D(tPrevious,vUv).r;
 float previous=encoded*encoded;
 if(uReset>.5)previous=drive;
 float tau=drive>previous?uRiseTau:uDecayTau;
 float emitted=drive+(previous-drive)*exp(-uDelta/max(.001,tau));
 // Sqrt encoding preserves faint emission in RGBA8; this texture stores
 // ONLY the local emission history, not spatially scattered energy.
 gl_FragColor=vec4(sqrt(clamp(emitted,0.0,1.0)),0.0,0.0,1.0);
}`;

const outputFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tHistory;
uniform float uBase;
void main(){
 float encoded=texture2D(tHistory,vUv).r;
 float emitted=encoded*encoded;
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*emitted),1.0);
}`;

const BASE_SRGB=8/255;
const BASE=BASE_SRGB<=.04045?BASE_SRGB/12.92:
 Math.pow((BASE_SRGB+.055)/1.055,2.4);
function createPhosphorPersistencePass(){
 const pass=new Pass();
 let width=1,height=1,read=null,write=null;
 let decayMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,first=true;
 const history={
  tSource:{value:null},tPrevious:{value:null},uBase:{value:BASE},
  uDelta:{value:1/60},uDecayTau:{value:decayMs/1000},
  uRiseTau:{value:PHOSPHOR_BOUNDS.riseMs/1000},uReset:{value:1}
 };
 const display={tHistory:{value:null},uBase:{value:BASE}};
 const createMaterial=(uniforms,fragmentShader)=>new THREE.ShaderMaterial({
  uniforms,vertexShader:vertex,fragmentShader,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending
 });
 const update=createMaterial(history,historyFragment);
 const output=createMaterial(display,outputFragment);
 const quad=new FullScreenQuad(update);
 function allocate(){
  read?.dispose();write?.dispose();
  const options={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  const make=()=>{
   const rt=new THREE.WebGLRenderTarget(width,height,options);
   rt.texture.colorSpace=THREE.NoColorSpace;
   return rt;
  };
  // Full physical display resolution prevents past pixels from bleeding
  // into nearby glyph edges due to lower-resolution history interpolation.
  read=make();write=make();first=true;
 }
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const x=Math.max(1,Math.ceil(w)),y=Math.max(1,Math.ceil(h));
  if(x===width&&y===height)return;
  width=x;height=y;
  if(read||write)allocate();
 };
 pass.reset=()=>{first=true;};
 pass.configure=(persistenceMs=PHOSPHOR_BOUNDS.defaultPersistenceMs)=>{
  decayMs=normalizePersistenceMs(persistenceMs);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!read||!write)allocate();
  const dt=Math.max(.001,Math.min(.1,Number(deltaTime)||1/60));
  history.tSource.value=readBuffer.texture;
  history.tPrevious.value=read.texture;
  history.uDelta.value=dt;
  history.uDecayTau.value=decayMs/1000;
  history.uReset.value=first?1:0;
  quad.material=update;
  renderer.setRenderTarget(write);
  quad.render(renderer);

  display.tHistory.value=write.texture;
  quad.material=output;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
  [read,write]=[write,read];
  first=false;
 };
 pass.dispose=()=>{
  read?.dispose();write?.dispose();read=null;write=null;
  update.dispose();output.dispose();quad.dispose();
 };
 return pass;
}

/* Tetris System V051 — independent GPU compositor.
 * The exact V050 pass order and GLSL are intentionally preserved.
 * Source canvases belong to the caller; internal CRT textures belong here.
 */

// Fixed V049 optical constants; unchanged by modularization.
const MENU_BLUR_PERCENT=47,BOARD_POPUP_FADE=.87;
const VIGNETTE_FADE_SPREAD=.57,CRT_PATTERN_SCALE=1;
function boardBlurParams(){
 const p=MENU_BLUR_PERCENT/100;
 return {sigma:13*Math.pow(p,1.25),step:1+2*Math.pow(p,6)};
}

function createCompositor({renderer,scene,camera,boardPopupTexture,onPassTiming=()=>{}}){
 const composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 // Extract bloom from grayscale luminance before colourization.
const glow=new UnrealBloomPass(new THREE.Vector2(1,1),1.5,.42,.55);
glow.threshold=0;
// Avoid degenerate smoothstep(0,0,x) without a visible brightness cutoff.
if(glow.highPassUniforms?.smoothWidth)glow.highPassUniforms.smoothWidth.value=.0001;

 const passVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';

 // A Gaussian is separable: horizontal + vertical convolution gives a
 // genuinely smooth 2D Gaussian, without the widely spaced 7x7 samples that
 // caused tiled duplicates at stronger blur settings. Edge Softness uses
 // the same normalized Gaussian weighting in a single 2D pass.
 const boardGaussianShader=`
   varying vec2 vUv;uniform sampler2D tDiffuse,uPopup;
   uniform vec4 uRect;uniform vec2 uSize,uAxis;
   uniform float uSigma,uStep,uComposite,uFade;
   uniform vec3 uFadeTo;
   void main(){
    vec3 backdrop=texture2D(tDiffuse,vUv).rgb;
    float inside=step(uRect.x,vUv.x)*step(vUv.x,uRect.z)*
                 step(uRect.y,vUv.y)*step(vUv.y,uRect.w);
    if(inside>.5&&uSigma>.01){
     vec3 sum=vec3(0.0);float weights=0.0;
     vec2 texel=uAxis*(uStep/max(vec2(1.0),uSize));
     for(int i=-12;i<=12;i++){
      float offset=float(i);
      float weight=exp(-offset*offset/(2.0*uSigma*uSigma));
      vec2 uv=clamp(vUv+offset*texel,uRect.xy,uRect.zw);
      sum+=texture2D(tDiffuse,uv).rgb*weight;
      weights+=weight;
     }
     backdrop=sum/max(.001,weights);
    }
    if(uComposite>.5){
     if(inside>.5)backdrop=mix(backdrop,uFadeTo,uFade);
     vec4 popup=texture2D(uPopup,vUv);
     backdrop=mix(backdrop,popup.rgb,popup.a);
    }
    gl_FragColor=vec4(backdrop,1.0);
   }`;
 function createBoardGaussianPass(axis,composite){
  return new ShaderPass({
   uniforms:{
    tDiffuse:{value:null},uPopup:{value:boardPopupTexture},
    uRect:{value:new THREE.Vector4(0,0,0,0)},
    uSize:{value:new THREE.Vector2(1,1)},
    uAxis:{value:new THREE.Vector2(axis,1-axis)},
    uSigma:{value:0},uStep:{value:1},
    uComposite:{value:composite?1:0},
    uFade:{value:.87},uFadeTo:{value:new THREE.Color(0x101010)}
   },
   vertexShader:passVertex,fragmentShader:boardGaussianShader
  });
 }
 const boardBlurHorizontal=createBoardGaussianPass(1,false);
 const boardPopupPass=createBoardGaussianPass(0,true);
 // ShaderPass clones input uniforms, including texture objects. Reattach
 // the ORIGINAL live CanvasTexture so every PAUSED/READY/OVER redraw reaches
 // the GPU, rather than displaying an old START GAME snapshot.
 boardPopupPass.uniforms.uPopup.value=boardPopupTexture;
 boardBlurHorizontal.enabled=false;boardPopupPass.enabled=false;
 composer.addPass(boardBlurHorizontal);
 composer.addPass(boardPopupPass);

 // Buttons are drawn into source textures at their current brightness.
 // No postprocessing pass manipulates their geometric bounds.
 // Experimental phosphor time history: grayscale, before optical glow/tint.
 // Disabled when users toggle PHOSPHOR HISTORY off (V096 baseline).
 const persistencePass=createPhosphorPersistencePass();
 composer.addPass(persistencePass);

 // Analog ghost is a displaced image sample, not a duplicate HTML element.
 const ghostPass=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uX:{value:8},uY:{value:0},uStrength:{value:.22},uSize:{value:new THREE.Vector2(1,1)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uX,uY,uStrength;uniform vec2 uSize;
   void main(){
    vec3 currentImage=texture2D(tDiffuse,vUv).rgb;
    vec2 uv2=vUv+vec2(-uX/max(1.0,uSize.x),uY/max(1.0,uSize.y));
    float mask=step(0.0,uv2.x)*step(uv2.x,1.0)*step(0.0,uv2.y)*step(uv2.y,1.0);
    vec3 echo=texture2D(tDiffuse,clamp(uv2,vec2(0.0),vec2(1.0))).rgb;
    gl_FragColor=vec4(clamp(currentImage+echo*uStrength*mask,0.0,1.0),1.0);
   }`
 });
 ghostPass.enabled=false;
 composer.addPass(ghostPass);

 const tint=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uEnabled:{value:0},uVoltage:{value:1},uTint:{value:new THREE.Vector3(.2,1,.2)}},
  vertexShader:passVertex,
  fragmentShader:'varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uEnabled,uVoltage;uniform vec3 uTint;void main(){vec3 rgb=texture2D(tDiffuse,vUv).rgb*clamp(uVoltage,1.0,1.2);float lum=dot(rgb,vec3(.2126,.7152,.0722));gl_FragColor=vec4(mix(rgb,vec3(lum)*uTint,clamp(uEnabled,0.0,1.0)),1.);}'
 });

 // Lens blur: normalized 7x7 Gaussian convolution, not shifted copies.
 const edgeSoftness=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.65},uRadius:{value:4},uSize:{value:new THREE.Vector2(1,1)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uRadius;uniform vec2 uSize;
   // This is exactly the same separable Gaussian kernel (sigma=1.25),
   // with its constant weights calculated once instead of 49 exp() calls
   // per pixel. Keep 7x7 sampling and all edge falloff settings unchanged.
   float gaussianWeight(int k){
    if(k==0)return 1.0;
    if(k==1||k==-1)return .7261490371;
    if(k==2||k==-2)return .2780373005;
    return .0561347628;
   }
   void main(){
    vec4 sharp=texture2D(tDiffuse,vUv);
    vec2 distPx=min(vUv,1.0-vUv)*uSize;
    float d=min(distPx.x,distPx.y);
    float amount=clamp(uAmount*(1.0-smoothstep(0.0,min(uSize.x,uSize.y)*.36,d)),0.0,1.0);
    if(amount<.001||uRadius<.001){gl_FragColor=sharp;return;}
    vec2 pixel=1.0/max(vec2(1.0),uSize);
    float interval=max(.001,uRadius)/3.0;
    vec4 sum=vec4(0.0);float weights=0.0;
    for(int y=-3;y<=3;y++){
     float wy=gaussianWeight(y);
     for(int x=-3;x<=3;x++){
      vec2 offset=vec2(float(x),float(y));
      float weight=gaussianWeight(x)*wy;
      sum+=texture2D(tDiffuse,clamp(vUv+offset*interval*pixel,vec2(0.0),vec2(1.0)))*weight;
      weights+=weight;
     }
    }
    gl_FragColor=mix(sharp,sum/max(.001,weights),amount);
   }`
 });
 edgeSoftness.enabled=false;
 // Independent optical falloff; hue and image content stay intact.
 const edgeVignette=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.55},uStart:{value:.50}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uStart;
   void main(){
    vec4 src=texture2D(tDiffuse,vUv);
    vec2 p=abs(vUv*2.0-1.0);
    float edge=smoothstep(uStart,1.0,max(p.x,p.y));
    float corners=smoothstep(.86,1.4,length(p))*.2;
    gl_FragColor=vec4(src.rgb*(1.0-uAmount*clamp(edge+corners,0.0,1.0)),1.0);
   }`
 });
 edgeVignette.enabled=false;
 // Grayscale luminance produces bloom, then phosphor tint colours both.
 composer.addPass(glow);
 composer.addPass(tint);
 composer.addPass(edgeSoftness);

 composer.addPass(edgeVignette);
 // Five small literal grayscale CRT patterns, nearest-neighbor tiled.
 // ORIGINAL is pixel-for-pixel the previously approved 3x6 Photoshop tile.
 const SCANLINE_PRESETS=[
  {id:'original',name:'ORIGINAL',rows:[
   [255,89,89],[255,89,89],[89,89,89],[0,0,0],[0,0,0],[0,0,0]
  ]},
  {id:'horizontal',name:'HORIZONTAL SCANLINES',rows:[
   [220],[110],[40],[0]
  ]},
  {id:'aperture',name:'APERTURE GRILLE',rows:[
   [255,120,60]
  ]},
  {id:'slot',name:'SLOT MASK',rows:[
   [220,110,220,110],[220,110,220,110],[70,0,70,0],
   [110,220,110,220],[110,220,110,220],[0,0,0,0]
  ]},
  {id:'dot',name:'DOT SHADOW MASK',rows:[
   [220,60,220,60],[60,0,60,0],[220,60,220,60],[60,0,60,0]
  ]}
 ];
 function makeScanlineTexture(rows){
  const height=rows.length,width=rows[0].length;
  if(!rows.every(row=>row.length===width))throw Error('Invalid CRT mask tile');
  const tile=document.createElement('canvas');
  tile.width=width;tile.height=height;
  const ctx=tile.getContext('2d',{alpha:false});
  if(!ctx)throw Error('CRT mask texture canvas missing');
  const pixels=ctx.createImageData(width,height);
  rows.forEach((row,y)=>row.forEach((luminance,x)=>{
   const p=(y*width+x)*4;
   pixels.data[p]=luminance;
   pixels.data[p+1]=luminance;
   pixels.data[p+2]=luminance;
   pixels.data[p+3]=255;
  }));
  ctx.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(tile);
  texture.wrapS=THREE.RepeatWrapping;
  texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.NearestFilter;
  texture.minFilter=THREE.NearestFilter;
  texture.generateMipmaps=false;
  return texture;
 }
 const scanlineTextures=Object.fromEntries(
  SCANLINE_PRESETS.map(p=>[p.id,makeScanlineTexture(p.rows)])
 );
 function activeScanlinePreset(id){return SCANLINE_PRESETS.find(p=>p.id===id)||SCANLINE_PRESETS[0];}
 // Photoshop-like repeating texture layer: scale tile in CSS pixels,
 // then blend it over the finished composite with independently adjustable
 // layer opacity. Multiply only source brightness, so no RGB tint is added.
 const scanlineOverlay=new ShaderPass({
  uniforms:{
   tDiffuse:{value:null},
   uPattern:{value:scanlineTextures.original},
   uPatternSize:{value:new THREE.Vector2(3,6)},
   uOpacity:{value:.20},
   uScale:{value:1},
   uDpr:{value:1},
   uScreenHeight:{value:1}
  },
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse,uPattern;
   uniform float uOpacity,uScale,uDpr,uScreenHeight;
   uniform vec2 uPatternSize;
   void main(){
    vec3 image=texture2D(tDiffuse,vUv).rgb;
    vec2 pixel=vec2(gl_FragCoord.x,uScreenHeight-gl_FragCoord.y);
    vec2 period=max(.25,uScale)*max(1.0,uDpr)*uPatternSize;
    float luminance=texture2D(uPattern,pixel/period).r;
    gl_FragColor=vec4(image*mix(1.0,luminance,clamp(uOpacity,0.0,1.0)),1.0);
   }`
 });
 // ShaderPass clones textures on creation. Rebind the original source.
 scanlineOverlay.uniforms.uPattern.value=scanlineTextures.original;
 scanlineOverlay.enabled=false;
 composer.addPass(scanlineOverlay);
 // Vertical hold/roll is a pure signal-space transform AFTER all existing
 // phosphor and CRT treatments. It is disabled outside the boot handoff.
 // fract() wraps the complete image instead of exposing blank strips.
 // Share one signal-space pass for momentary vertical sync errors,
 // horizontal tearing and the existing vertical-roll handoff. No extra pass
 // is added to the normal gameplay pipeline.
 const bootRoll=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uOffset:{value:0},
   uGlitch:{value:0},uTime:{value:0},
   uContentLuminance:{value:1},
   // THREE.Color(hex) converts sRGB #080808 to LINEAR working-space RGB.
   // Applying this base after the CRT mask makes the actual displayed
   // inactive screen #080808, rather than gamma-lifted charcoal gray.
   uDisplayBase:{value:new THREE.Color(0x080808)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uOffset,uGlitch,uTime,uContentLuminance;
   uniform vec3 uDisplayBase;
   void main(){
    float band=floor(vUv.y*48.0);
    float phase=floor(uTime*47.0);
    float noise=fract(sin(band*97.17+phase*23.19)*43758.5453);
    // Only a few horizontal strips slip during a sync fault.
    float gate=step(.80,noise);
    float dx=(noise-.5)*.065*uGlitch*gate;
    float dy=step(.97,noise)*.007*uGlitch;
    vec2 position=vec2(clamp(vUv.x+dx,0.0,1.0),
     fract(vUv.y+uOffset+dy));
    vec3 completed=texture2D(tDiffuse,position).rgb;
    // Preserve #080808 independently of source/CRT/phosphor.
    // All completed pixel differences share ONE luminance multiplier.
    vec3 emitted=completed-uDisplayBase;
    gl_FragColor=vec4(uDisplayBase+emitted*clamp(uContentLuminance,0.0,1.0),1.0);
   }`
 });
 bootRoll.enabled=false;
 composer.addPass(bootRoll);
 composer.addPass(new OutputPass());
 // Keep the exact pass order, source textures and FX behavior. Measure the
 // CPU time spent issuing each pass only; no extra GL renders or readbacks.
 const passProfiler=instrumentCompositorPasses(composer.passes,[
  'Scene + uploads','Board blur H','Board popup','Phosphor history','Ghost','Bloom',
  'Phosphor','Edge softness','Vignette','CRT mask','Boot roll','Output'
 ],onPassTiming);
 // Restore the original fixed green and amber phosphor ratios;
 // the blue experiment is removed without changing luminance or bloom.
 const hues={green:new THREE.Vector3(.2,1,.2),
  amber:new THREE.Vector3(185/255,79/255,9/255)};
 let persistenceWasEnabled=false;
 // Immutable popup blur parameters and pass references need no per-frame allocation.
 const popupBlur=boardBlurParams();
 const popupPasses=[boardBlurHorizontal,boardPopupPass];
function syncFX({fx,theme,width:W,height:H,dpr:DPR,boardStatus,modalOpen,scoresOverlay=false,popupStatus,layoutInfo,phosphorStrength=1,voltage=1,glitch=0,signalTime=0,contentLuminance=1}){
 const historyEnabled=fx.persistence===true;
 if(historyEnabled!==persistenceWasEnabled)persistencePass.reset();
 persistenceWasEnabled=historyEnabled;
 persistencePass.enabled=historyEnabled;
 persistencePass.configure(fx.persistenceMs);
 ghostPass.enabled=fx.ghost;
 ghostPass.uniforms.uX.value=fx.ghostX;
 ghostPass.uniforms.uY.value=fx.ghostY;
 ghostPass.uniforms.uStrength.value=fx.ghostStrength/100;
 // Colour strength is bounded to the selected fixed phosphor tint.
 tint.uniforms.uEnabled.value=fx.phosphor?clamp(phosphorStrength,0,1):0;
 // The instant startup voltage spike changes luminance only, never hue.
 tint.uniforms.uVoltage.value=clamp(voltage,1,1.2);
 // Identical artistic hue whether history is on or off; decay is neutral.
 tint.uniforms.uTint.value.copy(hues[theme]||hues.green);
 bootRoll.uniforms.uGlitch.value=clamp(glitch,0,1);
 bootRoll.uniforms.uTime.value=Math.max(0,Number(signalTime)||0)/1000;
 const faded=clamp(Number(contentLuminance),0,1);
 bootRoll.uniforms.uContentLuminance.value=faded;
 bootRoll.enabled=(bootRoll.uniforms.uOffset.value>0.00001&&
  bootRoll.uniforms.uOffset.value<.99999)||bootRoll.uniforms.uGlitch.value>0.00001||faded<1;
 glow.enabled=fx.bloom;
 glow.strength=fx.bloomStrength;
 edgeSoftness.enabled=fx.softness;
 edgeSoftness.uniforms.uAmount.value=fx.softnessStrength;
 edgeSoftness.uniforms.uRadius.value=fx.softnessRadius;
 const boardOverlayActive=boardStatus!=='playing'&&(!modalOpen||scoresOverlay)&&
  popupStatus===boardStatus;
 boardBlurHorizontal.enabled=boardOverlayActive;
 boardPopupPass.enabled=boardOverlayActive;
 for(const pass of popupPasses){
  pass.uniforms.uSigma.value=popupBlur.sigma;
  pass.uniforms.uStep.value=popupBlur.step;
 }
 boardPopupPass.uniforms.uFade.value=BOARD_POPUP_FADE;
 // Keep the live CanvasTexture bound through all update paths.
 boardPopupPass.uniforms.uPopup.value=boardPopupTexture;
 if(layoutInfo){
  const r=layoutInfo,x=r.boardX+2,y=r.boardY+2,w=Math.max(0,r.boardW-4),h=Math.max(0,r.boardH-4);
  for(const pass of popupPasses){
   pass.uniforms.uRect.value.set(x/W,1-(y+h)/H,(x+w)/W,1-y/H);
  }
 }
 edgeVignette.enabled=fx.vignette;
 edgeVignette.uniforms.uAmount.value=fx.vignetteAmount;
 edgeVignette.uniforms.uStart.value=VIGNETTE_FADE_SPREAD;
 // Static CRT scanline artwork is independent of phosphor persistence.
 // A user-enabled mask must remain visible whether history is on or off.
 scanlineOverlay.enabled=fx.scanlines&&fx.scanlineOpacity>0;
 const scanlinePreset=activeScanlinePreset(fx.scanlinePreset);
 scanlineOverlay.uniforms.uPattern.value=scanlineTextures[scanlinePreset.id];
 scanlineOverlay.uniforms.uPatternSize.value.set(scanlinePreset.rows[0].length,scanlinePreset.rows.length);
 scanlineOverlay.uniforms.uOpacity.value=clamp(fx.scanlineOpacity/100,0,1);
 scanlineOverlay.uniforms.uScale.value=CRT_PATTERN_SCALE;
 scanlineOverlay.uniforms.uDpr.value=DPR;
 scanlineOverlay.uniforms.uScreenHeight.value=H*DPR;
}
 function setStartupRoll(turns=0){
  // Turns are complete-screen revolutions; a whole number is perfectly static.
  const offset=((Number(turns)||0)%1+1)%1;
  bootRoll.uniforms.uOffset.value=offset;
  bootRoll.enabled=(offset>0.00001&&offset<0.99999)||
   bootRoll.uniforms.uGlitch.value>0.00001||
   bootRoll.uniforms.uContentLuminance.value<1;
 }
 function resize(W,H,DPR){
  composer.setPixelRatio(DPR);
  composer.setSize(W,H);
  ghostPass.uniforms.uSize.value.set(W,H);
  edgeSoftness.uniforms.uSize.value.set(W,H);
  boardBlurHorizontal.uniforms.uSize.value.set(W,H);
  boardPopupPass.uniforms.uSize.value.set(W,H);
 }
 // EffectComposer.dispose() only owns its render targets and copy pass.
 // It does NOT release added passes (notably bloom render targets/materials).
 // All pass resources and CRT pattern textures must be explicitly released.
 let disposed=false;
 function dispose(){
  if(disposed)return false;
  disposed=true;
  const failures=[];
  function safe(name,fn){
   try{fn();}catch(error){failures.push(name+': '+String(error?.message||error));}
  }
  safe('profiler',()=>passProfiler.dispose());
  for(const pass of composer.passes)
   safe('pass',()=>pass.dispose?.());
  safe('composer',()=>composer.dispose());
  for(const texture of Object.values(scanlineTextures))
   safe('scanline',()=>texture.dispose());
  if(failures.length)throw new Error(failures.join(' | ').slice(0,240));
  return true;
 }
 // Sampling is opt-in; do not scan the pipeline during normal gameplay.
 function passStats(){
  let activePasses=0;
  for(const pass of composer.passes)if(pass.enabled!==false)activePasses++;
  return {activePasses,totalPasses:composer.passes.length};
 }
 return Object.freeze({syncFX,resize,setStartupRoll,
  resetPersistence:()=>persistencePass.reset(),
  render:(dt)=>composer.render(dt),dispose,passStats,
  activeScanlinePreset,SCANLINE_PRESETS});
}

/* NOMAD V107 — source-owned button excitation.
 * Every illuminated button stroke, label, icon or solid face starts at 206
 * and reaches 255 during a press. The Canvas2D source itself animates:
 * no geometric full-screen postprocess, pressed rectangle, or extra glow.
 * Dark reversed text on filled keys remains legible and responds subtly.
 * The shared GPU phosphor decay (when enabled) supplies the afterglow.
 */
const MAX_BUTTON_FLASHES=8;
const BUTTON_BASE_LEVEL=206;
const BUTTON_PEAK_LEVEL=255;
const BUTTON_FLASH_PEAK_MS=90;
const MIN_PRESS_FRAME_MS=34;
const BUTTON_AFTERGLOW_MS=410;
const BUTTON_FLASH_TOTAL_MS=BUTTON_FLASH_PEAK_MS+BUTTON_AFTERGLOW_MS;
const buttonLevel=power=>Math.round(BUTTON_BASE_LEVEL+
 (BUTTON_PEAK_LEVEL-BUTTON_BASE_LEVEL)*Math.max(0,Math.min(1,Number(power)||0)));
const buttonInkLevel=power=>Math.round(6+24*Math.max(0,Math.min(1,Number(power)||0)));
function createButtonFeedback({capacity=MAX_BUTTON_FLASHES}={}){
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

/* NOMAD V169 — reusable GPU-driven luminance for static Canvas2D buttons.
 * This shader changes ONLY the ink and fill levels inside known button
 * rectangles. The source canvas, glyph rasterization, layout, hitboxes,
 * phosphor, bloom, and afterglow timing remain owned by their existing modules.
 *
 * The baseline CanvasTexture is rendered ONCE at 206/6 (solid) or 8/206
 * (outline). On a press, shader uniforms remap the baseline raster to the
 * exact 8-bit face/ink levels used by createCanvasUI. No per-frame upload,
 * extra canvas, geometry, scene layer, or postprocessing pass.
 */

const GPU_BUTTON_CAPACITY=8;
const GPU_BUTTON_SOURCE_LEVELS=Object.freeze({
 solidFace:206,solidInk:6,outlineFace:8,outlineInk:206
});

const finiteBox=b=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0;
const sameBox=(a,b)=>a.x===b.x&&a.y===b.y&&a.w===b.w&&a.h===b.h;
const levelFor=(lit,power)=>Object.freeze({
 face:lit?buttonLevel(power):GPU_BUTTON_SOURCE_LEVELS.outlineFace,
 ink:lit?buttonInkLevel(power):buttonLevel(power)
});
// Canvas text antialiasing interpolates 8-bit sRGB gray against the backing
// fill. This identity follows that interpolation; a zero-power button is
// returned unmodified by the shader, avoiding any cumulative resampling drift.
function excitedButtonGray(value,{light=false,power=0}={}){
 const original=clamp(Number(value)||0,0,255);
 const power0=clamp(Number(power)||0,0,1);
 if(power0===0)return original;
 const srcFace=light?GPU_BUTTON_SOURCE_LEVELS.solidFace:GPU_BUTTON_SOURCE_LEVELS.outlineFace;
 const srcInk=light?GPU_BUTTON_SOURCE_LEVELS.solidInk:GPU_BUTTON_SOURCE_LEVELS.outlineInk;
 const destination=levelFor(light,power0);
 const amount=clamp((original-srcFace)/(srcInk-srcFace),0,1);
 return destination.face+(destination.ink-destination.face)*amount;
}

const vertexShader=`
 varying vec2 vUv;
 void main(){
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
 }
`;
// Three.js decodes CanvasTexture's sRGB sample before fragment processing.
// Convert back to encoded sRGB for 8-bit Canvas2D interpolation, remap to
// the approved integer levels, then return to linear for OutputPass.
const fragmentShader=`
 varying vec2 vUv;
 uniform sampler2D uMap;
 uniform int uCount;
 uniform int uExcited;
 uniform vec4 uRects[${GPU_BUTTON_CAPACITY}];
 uniform vec4 uLevels[${GPU_BUTTON_CAPACITY}];

 float encodeSRGB(float x){
  return x<=0.0031308?12.92*x:1.055*pow(max(0.0,x),1.0/2.4)-0.055;
 }
 float decodeSRGB(float x){
  return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);
 }
 void main(){
  vec4 pixel=texture2D(uMap,vUv);
  if(uExcited>0){
   for(int i=0;i<${GPU_BUTTON_CAPACITY};i++){
    if(i>=uCount)break;
    vec4 box=uRects[i];
    vec4 state=uLevels[i]; // x solid(1)/outline(0), y face, z ink, w enabled
    if(state.w<0.5)continue;
    if(vUv.x>=box.x&&vUv.x<box.z&&vUv.y>=box.y&&vUv.y<box.w){
     float baseFace=state.x>0.5?206.0:8.0;
     float baseInk=state.x>0.5?6.0:206.0;
     float original=clamp(encodeSRGB(pixel.r),0.0,1.0)*255.0;
     float inkCoverage=clamp((original-baseFace)/(baseInk-baseFace),0.0,1.0);
     float outEncoded=mix(state.y,state.z,inkCoverage);
     float outLinear=decodeSRGB(outEncoded);
     pixel.rgb=vec3(outLinear);
     break;
    }
   }
  }
  gl_FragColor=pixel;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }
`;

function createGpuButtonLighting({THREE,texture,capacity=GPU_BUTTON_CAPACITY}={}){
 if(!THREE?.ShaderMaterial||!THREE?.Vector4||!texture)
  throw new TypeError('GPU button lighting needs Three.js and a CanvasTexture');
 // Shader source has a fixed capacity to remain portable on WebGL1/iOS.
 if(capacity!==GPU_BUTTON_CAPACITY)
  throw new RangeError('GPU button material capacity is fixed at 8');
 const rects=Array.from({length:capacity},()=>new THREE.Vector4());
 const levels=Array.from({length:capacity},()=>new THREE.Vector4());
 const uniforms={
  uMap:{value:texture},uCount:{value:0},uExcited:{value:0},
  uRects:{value:rects},uLevels:{value:levels}
 };
 const material=new THREE.ShaderMaterial({
  uniforms,vertexShader,fragmentShader,
  transparent:false,depthTest:false,depthWrite:false,
  side:THREE.DoubleSide,toneMapped:false
 });
 let geometry=[],active=false;
 let layoutSignature='';
 function configure(buttons,bounds){
  if(!Array.isArray(buttons)||!finiteBox(bounds))return false;
  const visible=buttons.filter(b=>b?.kind==='button'&&finiteBox(b));
  if(!visible.length||visible.length>capacity)return false;
  if(visible.some(b=>b.x<bounds.x-.5||b.y<bounds.y-.5||
    b.x+b.w>bounds.x+bounds.w+.5||b.y+b.h>bounds.y+bounds.h+.5))
   return false;
  const fingerprint=JSON.stringify([
   bounds.x,bounds.y,bounds.w,bounds.h,
   ...visible.map(b=>[b.x,b.y,b.w,b.h,Boolean(b.light)])
  ]);
  if(fingerprint===layoutSignature)return true;
  geometry=visible.map(b=>({x:b.x,y:b.y,w:b.w,h:b.h,light:Boolean(b.light)}));
  for(let i=0;i<capacity;i++){
   if(i>=geometry.length){
    rects[i].set(0,0,0,0);levels[i].set(0,0,0,0);continue;
   }
   const b=geometry[i];
   rects[i].set(
    clamp((b.x-bounds.x)/bounds.w,0,1),
    clamp((bounds.y+bounds.h-b.y-b.h)/bounds.h,0,1),
    clamp((b.x+b.w-bounds.x)/bounds.w,0,1),
    clamp((bounds.y+bounds.h-b.y)/bounds.h,0,1)
   );
   levels[i].set(b.light?1:0,b.light?206/255:8/255,
    b.light?6/255:206/255,0);
  }
  uniforms.uCount.value=geometry.length;
  uniforms.uExcited.value=0;
  // Three.js ShaderMaterial does not always upload changed uniform arrays
  // after its first draw unless this flag is explicitly raised.
  material.uniformsNeedUpdate=true;
  layoutSignature=fingerprint;active=true;
  return true;
 }
 function update(sparks=[]){
  if(!active)return false;
  let any=false,updated=false;
  for(let i=0;i<geometry.length;i++){
   const b=geometry[i];
   const spark=sparks.find(s=>sameBox(s,b));
   const power=clamp(Number(spark?.power)||0,0,1);
   const face=b.light?buttonLevel(power):8;
   const ink=b.light?buttonInkLevel(power):buttonLevel(power);
   const isActive=b.light?face!==206||ink!==6:ink!==206;
   const nextFace=face/255,nextInk=ink/255;
   const state=levels[i];
   if(state.y!==nextFace||state.z!==nextInk||
     state.w!==(isActive?1:0)){
    state.set(b.light?1:0,nextFace,nextInk,isActive?1:0);
    updated=true;
   }
   if(isActive)any=true;
  }
  if(uniforms.uExcited.value!==(any?1:0)){
   uniforms.uExcited.value=any?1:0;
   updated=true;
  }
  if(updated)material.uniformsNeedUpdate=true;
  return updated;
 }
 return Object.freeze({
  material,configure,update,
  get configured(){return active;},
  get count(){return geometry.length;},
  get active(){return uniforms.uExcited.value>0;},
  get regions(){return geometry.map(b=>({...b}));}
 });
}

/* NOMAD V166 — isolate button source invalidation by visible HUD layer.
 * The fullscreen base canvas includes the header and the board-status popup.
 * Its duplicated deck artwork is hidden by the opaque cropped controls layer.
 * Game-deck button excitation therefore needs ONLY that cropped texture.
 * Both prior and current silhouettes are considered so the last afterglow
 * frame is always cleared when a released button disappears.
 * Pure CSS-pixel geometry; no Canvas2D, WebGL, or gameplay dependency.
 */
function buttonFeedbackLayers(previous=[],current=[],layout=null){
 const deck=layout&&Number.isFinite(layout.dx)&&Number.isFinite(layout.dy)&&
  Number.isFinite(layout.dw)&&Number.isFinite(layout.dh)&&
  layout.dw>0&&layout.dh>0?layout:null;
 let base=false,controls=false;
 const inDeck=b=>deck&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&
  b.w>0&&b.h>0&&
  b.x>=deck.dx-.01&&b.y>=deck.dy-.01&&
  b.x+b.w<=deck.dx+deck.dw+.01&&
  b.y+b.h<=deck.dy+deck.dh+.01;
 for(const b of [...previous,...current]){
  if(inDeck(b))controls=true;
  else base=true; // header, board popup, or ambiguous geometry
  if(base&&controls)break;
 }
 return [...(base?['base']:[]),...(controls?['controls']:[])];
}

/* Tetris V062 — geometry and drawing helper for cropped, opaque HUD layers.
 * All bounds use CSS pixels and snap to the 2x canvas pixel grid.
 * Preserves the existing Canvas2D coordinate system and Three.js passes.
 */
function croppedBounds(boxes,width,height,dpr=1,pad=2){
 const scale=Math.max(1,dpr||1);
 const valid=boxes.filter(b=>b&&b.w>0&&b.h>0);
 if(!valid.length)return {x:0,y:0,w:1/scale,h:1/scale};
 const x=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.x))-pad)*scale)/scale);
 const y=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.y))-pad)*scale)/scale);
 const right=Math.min(width,Math.ceil((Math.max(...valid.map(b=>b.x+b.w))+pad)*scale)/scale);
 const bottom=Math.min(height,Math.ceil((Math.max(...valid.map(b=>b.y+b.h))+pad)*scale)/scale);
 return {x,y,w:Math.max(1/scale,right-x),h:Math.max(1/scale,bottom-y)};
}
function sidebarBounds(r,width,height,dpr){
 // NEXT and HOLD labels now sit above the compact preview frames.
 const headingSpace=r.previewLabelSpace??0;
 const headingBox=p=>({
  x:p.x,y:p.y-headingSpace,w:p.w,h:headingSpace
 });
 return croppedBounds([
  r.holdPanel,r.nextPanel,r.statsPanel,
  headingBox(r.holdPanel),headingBox(r.nextPanel)
 ],width,height,dpr);
}
function controlsBounds(r,width,height,dpr){
 // V168: buttons own only the deck. The operation log has its own
 // independently invalidated, much smaller opaque CanvasTexture.
 return croppedBounds([{x:r.dx,y:r.dy,w:r.dw,h:r.dh}],width,height,dpr);
}
function drawCroppedCanvas({canvas,context,plane,texture,bounds,dpr,width,height,draw}){
 const {x,y,w,h}=bounds;
 const pxW=Math.max(1,Math.round(w*dpr)),pxH=Math.max(1,Math.round(h*dpr));
 if(canvas.width!==pxW||canvas.height!==pxH){canvas.width=pxW;canvas.height=pxH;}
 context.setTransform(dpr,0,0,dpr,-x*dpr,-y*dpr);
 draw(bounds);
 plane.scale.set(w/width,h/height,1);
 plane.position.set(-1+(2*x+w)/width,1-(2*y+h)/height,plane.position.z);
 texture.needsUpdate=true;
 return {pixels:pxW*pxH,width:pxW,height:pxH};
}

/* V168 — the single owner of rendering dirtiness and attribution.
 * No canvas, DOM, game engine, or Three.js dependencies.
 * A mark schedules work; consume(layer) acknowledges one layer repaint.
 */
function createRenderInvalidation(initial=['base','board','sidebar','controls','terminal']){
 const layers=new Set(['base','board','sidebar','controls','terminal','modal']);
 const pending=new Set(initial.filter(x=>layers.has(x)));
 const reasons=new Set(['startup']);
 let renderNeeded=true;
 function mark(...names){
  for(const n of names){
   if(!layers.has(n))throw Error('Unknown render layer: '+n);
   pending.add(n);
  }
  renderNeeded=true;
 }
 function reason(name='input'){
  reasons.add(name);
  renderNeeded=true;
 }
 function needs(layer){return pending.has(layer);}
 function consume(layer){
  if(!pending.has(layer))return false;
  pending.delete(layer);
  // A paint can mark (then consume) a layer after beginRender(). A fully
  // serviced frame must not request a second no-op composition.
  if(pending.size===0&&reasons.size===0)renderNeeded=false;
  return true;
 }
 function needsRender(){return renderNeeded;}
 function beginRender(){
  const why=[...reasons];
  reasons.clear();renderNeeded=false;
  return why;
 }
 function snapshot(){return Object.freeze({pending:[...pending],reasons:[...reasons],renderNeeded});}
 return Object.freeze({mark,reason,needs,consume,needsRender,beginRender,snapshot});
}

/* Tetris V058 — visual state guard, independent of FPS and gravity timers.
 * A renderer should only upload Canvas2D pixels when displayed game data
 * actually changes. Capture before ticking; compare after ticking.
 */
function captureGameVisualState(game){
 const p=game.current;
 return {piece:p,x:p?.x,y:p?.y,rotation:p?.rotation,kind:p?.kind,
  pieces:game.pieces,lines:game.lines,score:game.score,level:game.level,
  hold:game.hold,status:game.status};
}
function gameVisualStateChanged(before,game){
 const p=game.current;
 return before.piece!==p||before.x!==p?.x||before.y!==p?.y||
  before.rotation!==p?.rotation||before.kind!==p?.kind||
  before.pieces!==game.pieces||before.lines!==game.lines||
  before.score!==game.score||before.level!==game.level||
  before.hold!==game.hold||before.status!==game.status;
}
function flashPhase(elapsed,interval=72){
 return Math.floor(elapsed/interval)%2;
}

return {PHOSPHOR_BOUNDS,normalizePersistenceMs,integratePhosphorResponse,createPhosphorPersistencePass,createCompositor,MAX_BUTTON_FLASHES,BUTTON_BASE_LEVEL,BUTTON_PEAK_LEVEL,BUTTON_FLASH_PEAK_MS,MIN_PRESS_FRAME_MS,BUTTON_AFTERGLOW_MS,BUTTON_FLASH_TOTAL_MS,buttonLevel,buttonInkLevel,createButtonFeedback,GPU_BUTTON_CAPACITY,GPU_BUTTON_SOURCE_LEVELS,excitedButtonGray,createGpuButtonLighting,buttonFeedbackLayers,croppedBounds,sidebarBounds,controlsBounds,drawCroppedCanvas,createRenderInvalidation,captureGameVisualState,gameVisualStateChanged,flashPhase};
})();
const {buttonLevel,buttonInkLevel}=CRT;
// Textures, sprite art, fragments, silhouette shadows.
const Art=(()=>{
/* Piece sprites, tile fallback, fragments and shadows. */

function pieceLuminance(kind){
 return PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
}

/* NOMAD V118 — approved 1989 Game Boy tile motifs.
 * Exactly the seven approved lower-row designs (I/O/T/S/Z/J/L).
 * Pixel-art source is grayscale; the existing phosphor compositor provides
 * green/amber tint, CRT bloom and scanlines. No layout or rules changes.
 */

const PIECE_PATTERNS=Object.freeze({
 I:'continuous-gravel',
 J:'dotted-field',
 L:'recessed-square',
 O:'corner-highlight',
 S:'small-center',
 T:'solid-fill',
 Z:'centered-square'
});
const SIZE=12;
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
const gray=v=>{const n=clamp(v);return 'rgb('+n+','+n+','+n+')';};
const matrix=(w,h)=>Array.from({length:h},()=>Array(w).fill(-1));
function box(m,x,y,w,h,c){
 for(let yy=Math.max(0,y);yy<Math.min(m.length,y+h);yy++)
  for(let xx=Math.max(0,x);xx<Math.min(m[0].length,x+w);xx++)m[yy][xx]=clamp(c);
}
function outline(m,cTop,cLeft,cBottom,cRight){
 const w=m[0].length,h=m.length;
 box(m,1,1,w-2,1,cTop);box(m,1,1,1,h-2,cLeft);
 box(m,1,h-2,w-2,1,cBottom);box(m,w-2,1,1,h-2,cRight);
}
function tilePixels(kind){
 const m=matrix(SIZE,SIZE),L=PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
 const bright=clamp(L+25);
 switch(kind){
 case 'O': // luminous top-left corner within a recessed medium-gray face
  box(m,1,1,10,10,L-95);
  outline(m,bright,bright,L-45,L-48);
  box(m,3,3,5,1,bright);box(m,3,3,1,5,bright);
  box(m,4,4,3,1,L+5);box(m,4,4,1,3,L+5);
  box(m,2,9,8,1,L-125);
  break;
 case 'T': // intentionally plain, without an invented frame or texture
  box(m,1,1,10,10,L-5);
  break;
 case 'S': // bright flat square with one small black central recess
  box(m,1,1,10,10,L+12);
  box(m,1,1,10,1,L+25);box(m,1,1,1,10,L+25);
  box(m,5,5,2,2,8);
  break;
 case 'Z': // black field, bright nested square, dark centered pixel
  box(m,1,1,10,10,10);
  outline(m,bright,bright,L+5,L+5);
  box(m,4,4,4,4,L+48);
  box(m,5,5,2,2,8);
  break;
 case 'J': // scattered isolated dark dots, never checkerboard
  box(m,1,1,10,10,L+17);
  outline(m,L+45,L+45,L+35,L+35);
  for(const [x,y,w,h] of J_GRAVEL_BITS)box(m,x,y,w,h,12);
  break;
 case 'L': // medium face with a square beveled recess
  box(m,1,1,10,10,L-26);
  outline(m,L+24,L+18,L-12,L-12);
  box(m,3,3,7,7,L-54);
  box(m,3,3,7,1,L-3);box(m,3,3,1,7,L-3);
  box(m,4,4,5,5,L-46);
  box(m,9,3,1,7,L-108);box(m,3,9,7,1,L-108);
  break;
 default:
  return barPixels(1,false);
 }
 return m;
}
function rotate90(m){
 const h=m.length,w=m[0].length;
 const rotated=matrix(h,w);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)rotated[x][h-1-y]=m[y][x];
 return rotated;
}
function barPixels(length,vertical,sourceOffset=0,rotation=vertical?1:0){
 const count=Math.round(length),offset=Math.round(sourceOffset);
 if(count<1||count>4||offset<0||offset+count>4)
  throw new RangeError('Invalid I fragment length or sourceOffset');
 if(!Number.isInteger(rotation)||rotation<0||rotation>3)
  throw new RangeError('Invalid I fragment rotation');
 const w=SIZE*count,L=PIECE_LUMINANCE.I;
 let m=matrix(w,SIZE);
 // Face and outer rim belong to this one contiguous fragment, never each
 // adjacent block. Only actual source gravel spots appear inside this rim.
 box(m,1,1,w-2,10,L-55);
 outline(m,L+16,L+16,L+8,L+8);
 for(const [x,y,dw,dh] of I_GRAVEL_BITS){
  const localX=x-offset*SIZE;
  if(localX>=2&&localX+dw<=w-2)box(m,localX,y,dw,dh,L-167);
 }
 for(let n=0;n<rotation;n++)m=rotate90(m);
 return m;
}
const tileCache=new Map();
function sprite(kind){
 if(!tileCache.has(kind))tileCache.set(kind,tilePixels(kind));
 return tileCache.get(kind);
}
const barCache=new Map();
function barSprite(length,vertical){
 const key=length+':'+vertical;
 if(!barCache.has(key))barCache.set(key,barPixels(length,vertical));
 return barCache.get(key);
}
function raster(g,pixels,x,y,w,h){
 if(!(w>0&&h>0)||!pixels.length)return;
 const rows=pixels.length,cols=pixels[0].length;
 const dx=w/cols,dy=h/rows;
 for(let yy=0;yy<rows;yy++){
  const line=pixels[yy];
  for(let xx=0;xx<cols;){
   const color=line[xx],start=xx++;
   while(xx<cols&&line[xx]===color)xx++;
   if(color<0)continue;
   g.fillStyle=gray(color);
   // Fractional cell sizes are allowed; tiny overlap avoids raster cracks.
   g.fillRect(x+start*dx,y+yy*dy,(xx-start)*dx+.001,dy+.001);
  }
 }
}
function drawIFragment(g,x,y,w,h,{sourceOffset=0,length=4,rotation=0}={}){
 if(!(w>0&&h>0))return;
 raster(g,barPixels(length,Boolean(rotation%2),sourceOffset,rotation),x,y,w,h);
}
function drawIBar(g,x,y,w,h){
 if(!(w>0&&h>0))return;
 const vertical=h>w;
 const length=Math.max(1,Math.round((vertical?h:w)/(vertical?w:h)));
 raster(g,barSprite(length,vertical),x,y,w,h);
}
function drawTileFace(g,x,y,w,h,kind){
 if(kind==='I'){drawIBar(g,x,y,w,h);return;}
 raster(g,sprite(kind),x,y,w,h);
}
// The four I cells share ONE continuous rectangle in NEXT/HOLD and in flight.
function drawPieceTiles(g,tiles,kind,{rotation}={}){
 if(!Array.isArray(tiles)||!tiles.length)return;
 if(kind==='I'){
  const minX=Math.min(...tiles.map(t=>t.x)),minY=Math.min(...tiles.map(t=>t.y));
  const maxX=Math.max(...tiles.map(t=>t.x+t.size));
  const maxY=Math.max(...tiles.map(t=>t.y+t.size));
  const vertical=maxY-minY>maxX-minX;
  drawIFragment(g,minX,minY,maxX-minX,maxY-minY,
   {sourceOffset:0,length:tiles.length,rotation:rotation??(vertical?1:0)});
  return;
 }
 for(const t of tiles)drawTileFace(g,t.x,t.y,t.size,t.size,kind);
}

/* NOMAD V121 — cached SVG sprite rendering for grayscale CRT source.
 * Uses the authored /assets/tiles/vector/*.svg files, not approximated
 * Canvas paths. SVGs are decoded once per shape; responsive sizes are then
 * rasterized at display DPR and cached. I-fragment variants are generated
 * from the same authored SVG geometry with original source coordinates.
 * Pixel renderer is a resilient fallback while SVG images finish loading.
 */

const KINDS=Object.freeze(['I','J','L','O','S','T','Z']);
const VECTOR_PIECE_KINDS=KINDS;
function spriteIdentity(kind,{sourceOffset=0,length=4,rotation=0}={}){
 if(kind!=='I'){
  if(!KINDS.includes(kind))throw new RangeError('Unknown tile kind: '+kind);
  return kind;
 }
 if(!Number.isInteger(sourceOffset)||!Number.isInteger(length)||
  !Number.isInteger(rotation)||rotation<0||rotation>3||
  length<1||length>4||sourceOffset<0||sourceOffset+length>4)
  throw new RangeError('Invalid I fragment source metadata');
 return 'I:'+sourceOffset+':'+length+':'+rotation;
}

function createVectorTileRenderer({
 createImage=()=>new Image(),
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1,
 onReady=()=>{},
 assetPrefix='./assets/tiles/vector/'
}={}){
 const images=new Map(),rasterized=new Map();
 let disposed=false;
 const MAX_RASTERS=128;
 const sendReady=()=>{if(!disposed)onReady();};
 function spriteSource(key){
  if(key.length===1||key==='I:0:4:0')return assetPrefix+key[0]+'.svg?v126';
  const [,offset,length,rotation]=key.split(':').map((n,i)=>i?Number(n):n);
  const svg=renderIFragmentSVG({sourceOffset:offset,length,rotation});
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 }
 function load(key){
  let asset=images.get(key);
  if(asset)return asset;
  const image=createImage();
  asset={status:'loading',image};
  images.set(key,asset);
  image.onload=()=>{
   if(disposed)return;
   asset.status='ready';
   sendReady();
  };
  image.onerror=()=>{
   if(disposed)return;
   asset.status='failed';
   sendReady(); // repaint using the pixel fallback
  };
  image.src=spriteSource(key);
  return asset;
 }
 function draw(key,g,x,y,w,h,fallback){
  if(disposed||!(w>0&&h>0))return false;
  const asset=load(key);
  if(asset.status!=='ready'){fallback?.();return false;}
  const dpr=Math.max(1,Math.min(4,Number(pixelRatio())||1));
  const pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
  const cacheKey=key+'@'+pw+'x'+ph;
  let canvas=rasterized.get(cacheKey);
  if(!canvas){
   canvas=createCanvas();
   canvas.width=pw;canvas.height=ph;
   const ctx=canvas.getContext('2d',{alpha:true});
   if(!ctx){fallback?.();return false;}
   ctx.imageSmoothingEnabled=true;
   if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
   try{ctx.drawImage(asset.image,0,0,pw,ph);}
   catch(error){fallback?.();return false;}
   if(rasterized.size>=MAX_RASTERS){
    const oldest=rasterized.keys().next().value;
    rasterized.delete(oldest);
   }
   rasterized.set(cacheKey,canvas);
  }else{
   // Recently used sprites remain in the small least-recently-used cache.
   rasterized.delete(cacheKey);rasterized.set(cacheKey,canvas);
  }
  g.drawImage(canvas,x,y,w,h);
  return true;
 }
 function drawTile(g,x,y,w,h,kind){
  if(!KINDS.includes(kind))return false;
  if(kind==='I')return drawVectorIFragment(g,x,y,w,h,{
   sourceOffset:0,length:1,rotation:0
  });
  return draw(spriteIdentity(kind),g,x,y,w,h,()=>drawTileFace(g,x,y,w,h,kind));
 }
 function drawVectorIFragment(g,x,y,w,h,{sourceOffset=0,length=4,rotation=0}={}){
  const options={sourceOffset,length,rotation};
  const key=spriteIdentity('I',options);
  return draw(key,g,x,y,w,h,()=>drawIFragment(g,x,y,w,h,options));
 }
 function drawPiece(g,tiles,kind,{rotation=0}={}){
  if(!Array.isArray(tiles)||!tiles.length)return;
  if(kind!=='I'){
   for(const t of tiles)drawTile(g,t.x,t.y,t.size,t.size,kind);
   return;
  }
  const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x+t.size));
  const minY=Math.min(...tiles.map(t=>t.y)),maxY=Math.max(...tiles.map(t=>t.y+t.size));
  drawVectorIFragment(g,minX,minY,maxX-minX,maxY-minY,{
   sourceOffset:0,length:tiles.length,rotation
  });
 }
 function preload(){for(const kind of KINDS)load(kind==='I'?'I:0:4:0':kind);}
 function dispose(){
  disposed=true;
  for(const asset of images.values()){
   asset.image.onload=null;asset.image.onerror=null;
  }
  images.clear();rasterized.clear();
 }
 return Object.freeze({
  drawTile,drawIFragment:drawVectorIFragment,drawPiece,preload,dispose,
  get imageCount(){return images.size;},
  get rasterCount(){return rasterized.size;}
 });
}

/* NOMAD piece-instance layout. Rendering only; game rules and board cell kinds
 * remain untouched. A contiguous I fragment must belong to ONE locked piece,
 * have consecutive original source indexes, and be physically adjacent in the
 * same direction. Clearing rows never re-seeds the remaining texture.
 */
function collectIFragments(board,metadata,{hiddenRows=null}={}){
 const grouped=new Map(),missing=[];
 const hidden=y=>hiddenRows?.has(y)===true;
 for(let y=0;y<board.length;y++)for(let x=0;x<(board[y]?.length||0);x++){
  if(board[y][x]!=='I'||hidden(y))continue;
  const cell=metadata?.[y]?.[x];
  const valid=cell?.kind==='I'&&Number.isSafeInteger(cell.pieceId)&&
   cell.pieceId>0&&Number.isInteger(cell.sourceIndex)&&
   cell.sourceIndex>=0&&cell.sourceIndex<4&&
   Number.isInteger(cell.rotation)&&cell.rotation>=0&&cell.rotation<=3;
  if(!valid){
   missing.push(Object.freeze({x,y,pieceId:null,sourceOffset:0,length:1,rotation:0,untracked:true}));
   continue;
  }
  if(!grouped.has(cell.pieceId))grouped.set(cell.pieceId,[]);
  grouped.get(cell.pieceId).push({x,y,pieceId:cell.pieceId,index:cell.sourceIndex,rotation:cell.rotation});
 }
 const runs=[];
 for(const entries of grouped.values()){
  entries.sort((a,b)=>a.index-b.index);
  let group=[];
  const emit=()=>{
   if(!group.length)return;
   runs.push(Object.freeze({
    pieceId:group[0].pieceId,
    x:Math.min(...group.map(e=>e.x)),
    y:Math.min(...group.map(e=>e.y)),
    sourceOffset:group[0].index,
    length:group.length,
    rotation:group[0].rotation,
    untracked:false
   }));
   group=[];
  };
  for(const entry of entries){
   if(group.length){
    const last=group[group.length-1],dr=entry.rotation;
    // 0=right,1=down,2=left,3=up in source-index order.
    const dx=[1,0,-1,0][dr],dy=[0,1,0,-1][dr];
    if(dr!==last.rotation||entry.index!==last.index+1||
      entry.x!==last.x+dx||entry.y!==last.y+dy)emit();
   }
   group.push(entry);
  }
  emit();
 }
 return Object.freeze([...runs,...missing].sort((a,b)=>a.y-b.y||a.x-b.x||String(a.pieceId).localeCompare(String(b.pieceId))));
}

/* NOMAD V163 — deeper per-piece raised cast shadows.
 * Preserve core piece IDs and current rotated matrices. Pre-rasterized stamps
 * are cached by SILHOUETTE (not position) for fast movement and rotation on iOS.
 * Shadows darken the floor/grid only; SVG piece artwork remains untouched.
 */
const COLS=10,ROWS=20;
const depthForTile=tile=>Math.min(20,Math.max(8,tile*.8));
const cappedDpr=n=>Math.max(1,Math.min(3,Number(n)||1));

// Respect immutable boardMeta.pieceId even when two independent tetrominoes
// share edges or have been split by completed rows. Fallback legacy cells
// have distinct IDs rather than merging every connected block.
function collectPieceShadowGroups(board,meta,active=null,hiddenRows=null){
 const groups=new Map();
 function add(id,x,y){
  if(!Number.isInteger(x)||!Number.isInteger(y)||
     x<0||x>=COLS||y<0||y>=ROWS)return;
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push({x,y});
 }
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(!board?.[y]?.[x]||hiddenRows?.has(y))continue;
  const pieceId=meta?.[y]?.[x]?.pieceId;
  add(Number.isSafeInteger(pieceId)&&pieceId>0?'locked:'+pieceId:'cell:'+x+':'+y,x,y);
 }
 // A new group is rebuilt from the live matrix EVERY repaint. Rotations,
 // wall kicks, gravity and hold therefore update the silhouette immediately.
 if(active?.matrix){
  const id='active:'+(Number.isSafeInteger(active.id)?active.id:'current');
  active.matrix.forEach((row,dy)=>row.forEach((kind,dx)=>{
   if(kind)add(id,active.x+dx,active.y+dy);
  }));
 }
 return [...groups].map(([id,cells])=>{
  cells.sort((a,b)=>a.y-b.y||a.x-b.x);
  const minX=Math.min(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y));
  const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
  return {id,cells,minX,minY,maxX,maxY};
 });
}

function pieceShadowProfile(tile){
 const depth=depthForTile(tile);
 return Object.freeze({
  // Keep the existing shadow reach, but deepen its projection so phosphor
  // bloom doesn't wash it out. An opaque central shadow is offset below
  // the piece, while a soft penumbra gradually extinguishes the grid.
  cast:{blur:depth,offsetX:6,offsetY:7,alpha:1},
  core:{blur:5,offsetX:6,offsetY:7,alpha:1},
  // Tight contact shadow preserves the apparent separation at each edge.
  contact:{blur:2.25,offsetX:2.5,offsetY:3.5,alpha:1},
  depth
 });
}

function createPieceShadowRenderer({
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1,capacity=48
}={}){
 const cache=new Map();
 const limit=Math.max(1,Math.floor(capacity)||48);
 function stamp(group,tile,dpr){
  const profile=pieceShadowProfile(tile);
  const normalized=group.cells.map(c=>(c.x-group.minX)+','+(c.y-group.minY)).sort().join(';');
  const key=tile.toFixed(4)+'@'+dpr.toFixed(2)+':'+normalized;
  const prev=cache.get(key);
  if(prev){cache.delete(key);cache.set(key,prev);return prev;}
  const pad=Math.ceil(profile.depth*2+Math.max(
   profile.cast.offsetX,profile.cast.offsetY)+4);
  const shapeW=(group.maxX-group.minX+1)*tile;
  const shapeH=(group.maxY-group.minY+1)*tile;
  const width=shapeW+2*pad,height=shapeH+2*pad;
  const canvas=createCanvas();
  canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return null;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const silhouette=()=>{
   ctx.beginPath();
   for(const {x,y} of group.cells)ctx.rect(
    pad+(x-group.minX)*tile,pad+(y-group.minY)*tile,tile,tile);
  };
  // Apply physical pixel offsets to Canvas2D shadow props because shadowBlur
  // and shadowOffset are not transformed with the canvas coordinate matrix.
  for(const layer of [profile.cast,profile.core,profile.contact]){
   ctx.save();
   ctx.fillStyle='#000000';
   ctx.shadowColor='rgba(0,0,0,'+layer.alpha+')';
   ctx.shadowBlur=layer.blur*dpr;
   ctx.shadowOffsetX=layer.offsetX*dpr;
   ctx.shadowOffsetY=layer.offsetY*dpr;
   silhouette();ctx.fill();
   ctx.restore();
  }
  // Erase each source silhouette from the offscreen shadow, so transparent
  // motifs in the actual SVG pieces still show their correct original floor.
  ctx.save();
  ctx.globalCompositeOperation='destination-out';
  ctx.fillStyle='#000000';
  silhouette();ctx.fill();
  ctx.restore();
  const item={canvas,width,height,pad};
  if(cache.size>=limit)cache.delete(cache.keys().next().value);
  cache.set(key,item);
  return item;
 }
 function draw(g,groups,offX,offY,tile){
  if(!(tile>0)||!groups?.length)return 0;
  const dpr=cappedDpr(pixelRatio());
  let drawn=0;
  // The board's existing clip confines every shadow to the recessed floor.
  for(const group of groups){
   if(!group.cells.length)continue;
   const item=stamp(group,tile,dpr);
   if(!item)continue;
   g.drawImage(item.canvas,
    offX+group.minX*tile-item.pad,
    offY+group.minY*tile-item.pad,item.width,item.height);
   drawn++;
  }
  return drawn;
 }
 return Object.freeze({
  draw,dispose:()=>cache.clear(),
  get cacheSize(){return cache.size;}
 });
}

return {pieceLuminance,PIECE_PATTERNS,drawIFragment,drawIBar,drawTileFace,drawPieceTiles,VECTOR_PIECE_KINDS,spriteIdentity,createVectorTileRenderer,collectIFragments,collectPieceShadowGroups,pieceShadowProfile,createPieceShadowRenderer};
})();
// Canvas user interface, overlay and terminal drawing.
const UI=(()=>{
/* Canvas controls, overlays, sidebar and terminal. */

/* Tetris System V052 — Canvas2D drawing primitives.
 * Drawing targets and hitboxes are caller-owned and resolve on each draw,
 * allowing the same primitives to draw gameplay and modal canvases.
 */
function createCanvasUI({getContext,getRegions,C,FONT,
 LETTER_SPACING_EM,MAIN_ACTION_LABELS,BUTTON_ICON_LABELS,
 MAIN_ACTION_FONT_SIZE,BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE,
 getButtonPower=()=>0,ICON_FONT=FONT,TERMINAL_FONT=FONT}){
function panel(x,y,w,h,r=8,fill=C.panel,border=C.border){
 const g=getContext();
 if(w<=0||h<=0)return;
 // All UI containers and buttons have square (unbeveled) corners.
 // Preserve existing fills, grayscale luminance, borders and hitbox geometry.
 g.beginPath();g.roundRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1),0);
 if(fill){g.fillStyle=fill;g.fill();}
 if(border){g.strokeStyle=border;g.lineWidth=1;g.stroke();}
}
// No per-label overrides. Canvas fillText(maxWidth) compresses glyph widths,
// so measure naturally and wrap only text that exceeds a caller's available width.
function wrapText(source,maxWidth){
 const g=getContext();
 const paragraphs=String(source).split('\n');
 if(!Number.isFinite(maxWidth))return paragraphs;
 const limit=Math.max(1,maxWidth),lines=[];
 for(const paragraph of paragraphs){
  if(g.measureText(paragraph).width<=limit){lines.push(paragraph);continue;}
  let line='';
  for(const word of paragraph.trim().split(/\s+/)){
   const joined=line?line+' '+word:word;
   if(g.measureText(joined).width<=limit){line=joined;continue;}
   if(line){lines.push(line);line='';}
   if(g.measureText(word).width<=limit){line=word;continue;}
   for(const ch of Array.from(word)){
    if(line&&g.measureText(line+ch).width>limit){lines.push(line);line='';}
    line+=ch;
   }
  }
  lines.push(line);
 }
 return lines;
}
function text(str,x,y,size=12,color=C.ink,align='left',maxWidth=Infinity,role='ui'){
 const g=getContext();
 // Fallout 4 roles: Roboto Condensed for the UI, Share Tech Mono for data.
 const isIcon=BUTTON_ICON_LABELS.has(String(str))||str==='▶';
 const terminal=role==='terminal'&&!isIcon;
 g.font=(terminal?'400 ':'700 ')+size+'px '+
  (isIcon?ICON_FONT:terminal?TERMINAL_FONT:FONT);
 g.textAlign=align;
 g.letterSpacing=(size*LETTER_SPACING_EM).toFixed(3)+'px';
 g.fillStyle=color;
 const lines=wrapText(str,maxWidth),step=size*1.2;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],centerY=y+(i-(lines.length-1)/2)*step;
  // Canvas "middle" tracks the em box, not the ink of the selected font.
  // Align the measured visible glyph bounds with the existing text anchor.
  g.textBaseline='alphabetic';
  const metrics=g.measureText(line);
  const ascent=metrics.actualBoundingBoxAscent;
  const descent=metrics.actualBoundingBoxDescent;
  if(Number.isFinite(ascent)&&Number.isFinite(descent)&&ascent+descent>0){
   g.fillText(line,x,centerY+(ascent-descent)/2);
  }else{
   // Older contexts exposing width alone keep the previous behavior.
   g.textBaseline='middle';
   g.fillText(line,x,centerY);
  }
 }
 g.letterSpacing='0px';
}
function rect(x,y,w,h,color){const g=getContext();g.fillStyle=color;g.fillRect(x,y,w,h);}
function region(x,y,w,h,act,opts={}){const model=makeRegion(x,y,w,h,act,opts);getRegions().push(model);return model;}
// All visible button emission is set at the source, not by a later rectangle.
 const grayLevel=n=>{const v=Math.max(0,Math.min(255,Math.round(n)));return 'rgb('+v+','+v+','+v+')';};
 const buttonLight=(x,y,w,h)=>{
  const power=getButtonPower({x,y,w,h});
  return buttonLevel(power);
 };
function key(label,x,y,w,h,act,opts={}){
 const model=makeButtonControl(label,x,y,w,h,act,opts);
 const power=Math.max(0,Math.min(1,Number(getButtonPower(model.hitbox))||0));
 const lit=grayLevel(buttonLevel(power));
 // Negative-space text in solid buttons follows the press (6→30) without
 // disappearing into the bright solid face (206→255).
 const inverseInk=grayLevel(buttonInkLevel(power));
 const size=MAIN_ACTION_LABELS.has(String(model.label))?MAIN_ACTION_FONT_SIZE:
  BUTTON_ICON_LABELS.has(String(model.label))?BUTTON_ICON_FONT_SIZE:BUTTON_FONT_SIZE;
 // V165: keep button artwork as a single flat face. Solid buttons
 // remain exactly the approved full luminance (206 base, 255 pressed);
 // press afterglow, text, stroke, and hitboxes are unchanged.
 panel(model.x,model.y,model.w,model.h,8,model.light?lit:C.button,lit);
 text(model.label,model.x+model.w/2,model.y+model.h/2,size,
  model.light?inverseInk:lit,'center',Math.max(10,model.w-14));
 if(model.arrow)text('▶',model.x+17,model.y+model.h/2,
  BUTTON_ICON_FONT_SIZE,model.light?inverseInk:lit,'center');
 getRegions().push(model.hitbox);
 return model;
}

 return Object.freeze({panel,wrapText,text,rect,region,key,buttonLight});
}

/* V063 — Canvas2D HUD painting extracted without visual changes.
 * Caller supplies drawing primitives, live game state and existing button
 * registrar; the same UI can draw on the cached base or cropped canvases.
 */
// Square tetromino cells at every preview aspect ratio, including narrow phones.
function fitPreviewCells(shape,x,y,w,h,role='next',targetCell=null){
 if(!Array.isArray(shape)||!(w>0)||!(h>0))return [];
 const points=[];
 for(let row=0;row<shape.length;row++){
  const values=shape[row];
  if(!Array.isArray(values))continue;
  for(let col=0;col<values.length;col++)if(values[col])points.push([col,row]);
 }
 if(!points.length)return [];
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const minX=Math.min(...xs),minY=Math.min(...ys);
 const cols=Math.max(...xs)-minX+1,rows=Math.max(...ys)-minY+1;
 let size;
 if(Number.isFinite(targetCell)&&targetCell>0){
  // Exactly 75% of a gameplay cell on normal viewports; shrink only when
  // a constrained panel cannot contain the entire four-block piece.
  size=Math.min(targetCell,w/cols,h/rows);
 }else{
  // Preserve the legacy fit for external callers without a board-cell target.
  const sourceH=role==='hold'?90:75;
  const sourceCell=Math.min(21,(120-12)/cols,(sourceH-10)/rows);
  const scale=Math.min(w/120,h/sourceH);
  size=Math.min(sourceCell*scale,Math.max(0,w-4)/cols,Math.max(0,h-4)/rows);
 }
 if(!(size>0))return [];
 const startX=x+(w-size*cols)/2,startY=y+(h-size*rows)/2;
 return points.map(([col,row])=>({
  x:startX+(col-minX)*size,y:startY+(row-minY)*size,size
 }));
}

function createHudDrawing({panel,text,rect,key,smallPiece,getGame,
 C,UI_SPACE,fmt}){
function drawSidebar(r){
 const game=getGame();
 const {nextPanel:next,statsPanel:stats,holdPanel:hold}=r;
 const inset=Math.max(3,Math.min(6,stats.w*.06));
 // V141: the same square double-border housing for all five boxes.
 const doubleFrame=(x,y,w,h)=>{
  const rim=Math.min(4,Math.max(2,(h-12)/2));
  panel(x,y,w,h,0,C.panel,C.border);
  if(w>rim*2+1&&h>rim*2+1)
   panel(x+rim,y+rim,w-rim*2,h-rim*2,0,null,C.bright);
  return rim;
 };
 const preview=(box,kind,role)=>{
  // One compact panel only. The NEXT/HOLD label is outside its border.
  const heading=role==='next'?'NEXT':'HOLD';
  // The panel aligns right with the header/footer; the label itself
  // stays left-aligned, just outside the panel's top edge.
  text(heading,box.x+inset+1,box.y-r.previewLabelSpace/2,
   9,C.weak,'left',Math.max(8,box.w-2*inset));
  doubleFrame(box.x,box.y,box.w,box.h);
  const pad=5;
  smallPiece(kind,box.x+pad,box.y+pad,
   Math.max(0,box.w-2*pad),Math.max(0,box.h-2*pad),
   role,r.previewCell);
 };
 preview(next,game.queue[0],'next');
 // Three independent flat LCD readouts, not one combined score panel.
 // Labels live outside their boxes; every box has the SAME right-aligned
 // width (also matching the NEXT and HOLD containers).
 const readouts=[['SCORE',fmt(game.score)],['LEVEL',fmt(game.level,2)],['LINES',fmt(game.lines,2)]];
 const slot=stats.h/3;
 const titleSpace=Math.min(15,Math.max(8,slot*.31));
 const bottomGap=Math.min(5,Math.max(2,slot*.10));
 const readoutHeight=Math.max(1,slot-titleSpace-bottomGap);
 readouts.forEach(([title,value],i)=>{
  const top=stats.y+i*slot,boxY=top+titleSpace;
  text(title,stats.x+inset+1,top+titleSpace*.50,9,C.weak,
   'left',Math.max(8,stats.w-2*inset));
  const rim=doubleFrame(stats.x,boxY,stats.w,readoutHeight);
  // Terminal data values are LEFT aligned within their frames.
  const valueInset=Math.max(10,Math.min(12,stats.w*.14));
  const digitSize=Math.max(10,Math.min(16,stats.w*.175,readoutHeight*.54));
  text(value,stats.x+valueInset,boxY+readoutHeight/2,digitSize,
   C.ink,'left',Math.max(8,stats.w-valueInset-rim-4),'terminal');
 });
 preview(hold,game.hold,'hold');
}
function drawControls(r){
 // V114: restore the enclosing controls panel; button geometry and hitboxes
 // stay exactly as before.
 panel(r.dx,r.dy,r.dw,r.dh,0,C.panel);
 const px=r.dx+r.deckPad,pw=r.dw-2*r.deckPad;
 // The score strip is now in the right-hand column; leave the approved
 // positions and dimensions of every game control unchanged.
 const cy=r.dy+r.deckPad,ch=r.buttonH;
 const gap=UI_SPACE.padGap;
 let ey;
 if(r.compactControls){
  // Narrow landscape: maintain usable touch targets by reflowing controls.
  const third=Math.max(0,(pw-2*gap)/3);
  key('◀',px,cy,third,ch,'left',{light:true,repeat:true});
  key('↻',px+third+gap,cy,third,ch,'cw');
  key('▶',px+2*(third+gap),cy,third,ch,'right',{light:true,repeat:true});
  key('DROP',px,cy+ch+gap,pw,ch,'soft',{light:true,repeat:true});
  ey=cy+2*(ch+gap);
 }else{
  const col=Math.max(0,(pw-gap*4)/5);
  key('◀',px,cy,col,ch,'left',{light:true,repeat:true});
  key('DROP',px+col+gap,cy,col*2+gap,ch,'soft',{light:true,repeat:true});
  key('▶',px+col*3+gap*3,cy,col,ch,'right',{light:true,repeat:true});
  key('↻',px+col*4+gap*4,cy,col,ch,'cw');
  ey=cy+ch+r.deckGap;
 }
 // Keep the secondary controls centered at their approved 75% width.
 const extraGap=UI_SPACE.extrasGap;
 const ew=(pw-extraGap)/2*UI_SPACE.buttonWidthScale;
 const groupW=ew*2+extraGap,groupX=px+(pw-groupW)/2;
 key('HOLD',groupX,ey,ew,r.extraH,'hold');
 key('PAUSE',groupX+ew+extraGap,ey,ew,r.extraH,'pause');
}

 return Object.freeze({drawSidebar,drawControls});
}

/* V064 — isolated Canvas2D settings and modal interface.
 * All original drawing primitives/layout measurements are preserved.
 * State is limited to menu scroll, scanline picker, status and view hit area.
 * No WebGL, frame-scheduler, or gameplay dependencies.
 */
function createModalUI({
 document,SHAPES,DISPLAY_EFFECTS,SCANLINE_CHOICES,
 getViewport,layout,insets,clearRegions,getContext,
 panel,text,rect,region,key,buttonLight,gray,clamp,fmt,C,UI_SPACE,BUTTON_ICON_FONT_SIZE,
 getFX,activeScanlinePreset,settingValue,chooseScanlineSetting,invalidate,setScrollVelocity,
 getBest,getGame,getModal
}){
 const PREVIEW_SIZE=96,SETTINGS_SQUARE_SIZE=15;
 let modalView=null,optionsScroll=0,optionsMaxScroll=0;
 let scanlineMenuOpen=false,debugCopyState='idle';
// Menu geometry shares the six-pixel unit and the existing 46/42/37px
// phosphor/settings, HOLD and PAUSE button height.
function modalBounds(name){
 const {W,H}=getViewport();
 const safe=insets(),pad=UI_SPACE.unit,gap=UI_SPACE.unit;
 const buttonH=layout().headerButtonH;
 // Display System is its own full-screen view, not a 410px floating dialog.
 // Its title and fixed bottom control still respect the iPhone safe areas.
 if(name==='options')return {w:W,h:H,x:0,y:0,pad,gap,buttonH,
  safeTop:safe.top,safeBottom:safe.bottom};
 // The personal record fills the existing blurred playfield.
 // Unusually narrow landscape boards need a wider, legible overlay.
 if(name==='scores'){
  const b=layout(),narrow=b.boardW<205||b.boardH<310;
  if(narrow){
   const w=Math.min(410,W-2*UI_SPACE.padX);
   const h=Math.min(330,Math.max(0,H-safe.top-safe.bottom-2*gap));
   return {x:(W-w)/2,y:safe.top+(H-safe.top-safe.bottom-h)/2,
    w,h,pad,gap,buttonH:b.extraH,secondaryH:b.overlaySecondaryH,landscapeFallback:true};
  }
  return {x:b.boardX,y:b.boardY,w:b.boardW,h:b.boardH,pad,gap,
   buttonH:b.extraH,secondaryH:b.overlaySecondaryH,landscapeFallback:false};
 }
 const usable=Math.max(0,H-safe.top-safe.bottom);
 const wanted=2*pad+4*buttonH+4*gap+18;
 const w=Math.max(0,Math.min(410,W-2*UI_SPACE.padX));
 const h=Math.max(0,Math.min(wanted,usable-2*gap));
 return {w,h,x:(W-w)/2,y:safe.top+(usable-h)/2,pad,gap,buttonH};
}
// All visual previews share the very same T tetromino matrix and base image
// treatment. Per-effect rendering alters ONLY the effect, not the subject.
// The same real T tetromino and dim grayscale phosphor screen appear in every
// effect preview. These neutral pixels are tinted later by the EXISTING GPU.
function effectPreview(id){
 const canvas=document.createElement('canvas');
 canvas.width=PREVIEW_SIZE;canvas.height=PREVIEW_SIZE;
 const p=canvas.getContext('2d');if(!p)return canvas;
 const n=PREVIEW_SIZE;
 p.fillStyle=gray(26);p.fillRect(0,0,n,n);
 p.fillStyle=gray(31);
 for(let v=8;v<n;v+=8){p.fillRect(v,0,1,n);p.fillRect(0,v,n,1);}
 if(id==='phosphor'){
  // A single fully solid inset square; the edge gap is intentionally empty.
  p.fillStyle=gray(173);p.fillRect(13,13,n-26,n-26);
  return canvas;
 }
 if(id==='sound'){
  p.fillStyle=gray(193);
  [16,27,43,54,35,23].forEach((h,i)=>p.fillRect(15+i*12,70-h,7,h));
  return canvas;
 }
 const matrix=SHAPES.T,cells=[],size=20;
 for(let ry=0;ry<matrix.length;ry++)
  for(let rx=0;rx<matrix[ry].length;rx++)
   if(matrix[ry][rx])cells.push([rx,ry]);
 const drawPiece=(ghost=false)=>{
  p.save();if(ghost)p.globalAlpha=.43;
  for(const [cx,cy] of cells){
   const x=18+cx*size,y=28+cy*size;
   if(ghost){
    p.strokeStyle=gray(222);p.lineWidth=2;
    p.strokeRect(x+2,y+2,size-4,size-4);
    p.fillStyle=gray(58);p.fillRect(x+4,y+4,size-8,size-8);
   }else{
    // Bright outline and dark face emulate the approved Fallout thumbnail.
    p.fillStyle=gray(201);p.fillRect(x+1,y+1,size-2,size-2);
    p.fillStyle=gray(94);p.fillRect(x+3,y+4,size-6,size-7);
    p.fillStyle=gray(229);p.fillRect(x+3,y+2,size-6,2);
    p.fillStyle=gray(165);p.fillRect(x+3,y+4,2,size-7);
   }
  }
  p.restore();
 };
 if(id==='ghost'){
  p.save();p.globalAlpha=.33;p.translate(-8,2);drawPiece();p.restore();
  p.save();p.globalAlpha=.48;p.translate(8,-2);drawPiece();p.restore();
  drawPiece();
 }else if(id==='softness'){
  p.save();p.filter='blur(4.2px)';drawPiece();p.restore();
 }else if(id==='bloom'){
  p.save();p.shadowColor=gray(240);p.shadowBlur=22;drawPiece();p.restore();
  p.save();p.globalAlpha=.24;p.filter='blur(7px)';drawPiece();p.restore();
 }else if(id==='piece'){drawPiece(true);}
 else{
  drawPiece();
  if(id==='scanlines'){
   p.fillStyle='rgba(0,0,0,.68)';
   for(let y=0;y<n;y+=5)p.fillRect(0,y,n,2);
  }else if(id==='vignette'){
   const mask=p.createRadialGradient(48,48,8,48,48,66);
   mask.addColorStop(0,'rgba(0,0,0,0)');
   mask.addColorStop(.45,'rgba(0,0,0,.09)');
   mask.addColorStop(1,'rgba(0,0,0,.98)');
   p.fillStyle=mask;p.fillRect(0,0,n,n);
  }
 }
 return canvas;
}
const EFFECT_PREVIEWS=Object.fromEntries(
 DISPLAY_EFFECTS.map(effect=>[effect.id,effectPreview(effect.id)]));
// Match the shared square panel outline around every thumbnail, with a
// subtle 1px light-top/left and dark-bottom/right rim for terminal-style bevel.
function drawEffectThumbnail(id,x,y,size){
 const g=getContext();
 panel(x,y,size,size,9,C.panel,C.border);
 const inset=3,inner=Math.max(1,size-2*inset);
 g.save();
 g.beginPath();
 g.rect(x+inset,y+inset,inner,inner);
 g.clip();
 g.drawImage(EFFECT_PREVIEWS[id],x+inset,y+inset,inner,inner);
 g.restore();
 g.save();
 g.lineWidth=1;
 g.strokeStyle=gray(128);
 g.beginPath();
 g.moveTo(x+9,y+1.5);g.lineTo(x+size-9,y+1.5);
 g.moveTo(x+1.5,y+9);g.lineTo(x+1.5,y+size-9);
 g.stroke();
 g.strokeStyle=gray(45);
 g.beginPath();
 g.moveTo(x+9,y+size-1.5);g.lineTo(x+size-9,y+size-1.5);
 g.moveTo(x+size-1.5,y+9);g.lineTo(x+size-1.5,y+size-9);
 g.stroke();
 g.restore();
}
function selectedScanlineChoice(){const FX=getFX();return FX.scanlines?activeScanlinePreset(FX.scanlinePreset).id:'off';}
function toggleScanlineMenu(){
 scanlineMenuOpen=!scanlineMenuOpen;setScrollVelocity(0);invalidate();
}
function chooseScanline(id){
 if(!SCANLINE_CHOICES.some(choice=>choice.id===id))return;
 chooseScanlineSetting(id);
 scanlineMenuOpen=false;setScrollVelocity(0);invalidate();
}
function settingSquare(x,y,size,active,color=C.bright){
 const g=getContext();
 g.lineWidth=1;
 if(active){g.fillStyle=color;g.fillRect(x,y,size,size);}
 else{g.strokeStyle=color;g.strokeRect(x+.5,y+.5,size-1,size-1);}
}
function settingsExpandArrow(x,y,expanded,color){
 const g=getContext();
 g.save();g.translate(x,y);if(expanded)g.rotate(Math.PI/2);
 text('▶',0,0,BUTTON_ICON_FONT_SIZE,color,'center');g.restore();
}
// Size EVERY row against the most complex effect, as approved. With
// thumbnails centered, their edge-to-edge black space is identical.
const SETTINGS_ROW_GAP=UI_SPACE.unit; // 6px between equal-height row slots.
const SETTINGS_TITLE_H=20,SETTINGS_CONTROL_H=28,SETTINGS_SELECT_H=30;
function settingsPreviewSize(width){
 return Math.min(68,Math.max(56,Math.round(width*.185)));
}
function settingsContentHeight(effect,gap){
 const controls=effect.id==='ghost'?2:(effect.sliders?.length||0);
 return SETTINGS_TITLE_H+controls*(SETTINGS_CONTROL_H+gap)+
  (effect.pattern?(SETTINGS_SELECT_H+gap):0);
}
function settingsRows(buttonH,gap,width){
 const image=settingsPreviewSize(width),rows=[];let offset=0;
 const maxContentHeight=Math.max(...DISPLAY_EFFECTS.map(effect=>
  settingsContentHeight(effect,gap)));
 // 102px slots at 6px inner gaps, containing 68px image: 40px between
 // thumbnail edges after including the standard 6px between row slots.
 const rowHeight=Math.max(image,maxContentHeight+2*gap);
 for(const effect of DISPLAY_EFFECTS){
  const contentHeight=settingsContentHeight(effect,gap);
  const choiceHeight=Math.max(34,buttonH-8);
  const expanded=effect.pattern&&scanlineMenuOpen;
  const height=rowHeight+(expanded?SCANLINE_CHOICES.length*(choiceHeight+gap):0);
  rows.push({kind:'effect',effect,offset,height,rowHeight,contentHeight,choiceHeight});
  offset+=height+SETTINGS_ROW_GAP;
 }
 return {rows,height:Math.max(0,offset-SETTINGS_ROW_GAP)};
}
// One uniform slider primitive everywhere: 15px square, 6px gaps, real
// persisted values and full remaining row width from image to right inset.
function drawSettingsSlider(x,y,w,setting){
 const ctrl=makeSliderControl(x,y,w,setting,Number(settingValue(setting[1])),
  SETTINGS_SQUARE_SIZE,UI_SPACE.unit);
 const {label,size,labelW,trackX,trackW,fraction,valueText,valueW}=ctrl;
 if(label)text(label,x,y,10,C.ink,'left',labelW);
 rect(trackX,y-1.5,trackW,3,C.bright);
 rect(trackX,y-1.5,trackW*fraction,3,C.bright);
 rect(trackX+trackW*fraction-size/2,y-size/2,size,size,C.bright);
 text(valueText,x+w,y,10,C.bright,'right',valueW,'terminal');
 const hit=ctrl.hitbox;
 region(hit.x,hit.y,hit.w,hit.h,hit.act,{
  field:hit.field,min:hit.min,max:hit.max,step:hit.step,
  trackX:hit.trackX,trackW:hit.trackW,modalControl:hit.modalControl
 });
}
// Monochrome 16px bug glyph, so no multicolour system emoji enters our CRT.
function drawDebugBug(cx,cy,color=C.ink){
 const g=getContext();
 g.save();
 g.strokeStyle=color;g.lineWidth=1.5;g.lineCap='round';g.lineJoin='round';
 g.beginPath();
 g.ellipse(cx,cy+1.5,4.5,6,0,0,Math.PI*2);
 g.moveTo(cx-3,cy-5);g.lineTo(cx-5,cy-8);
 g.moveTo(cx+3,cy-5);g.lineTo(cx+5,cy-8);
 for(const dy of [-3,1,5]){
  g.moveTo(cx-4.5,cy+dy);g.lineTo(cx-8,cy+dy-2);
  g.moveTo(cx+4.5,cy+dy);g.lineTo(cx+8,cy+dy-2);
 }
 g.moveTo(cx-4,cy);g.lineTo(cx+4,cy);
 g.stroke();g.restore();
}

function drawOptions(q){
 const {W,H}=getViewport(),g=getContext();
 // The whole WebGL surface is a separate black terminal page. No outer
 // rounded panel, no translucent scrim and no game artwork beneath it.
 clearRegions();region(0,0,W,H,'block');
 const r=layout(),pad=q.pad,gap=q.gap,headH=r.hh;
 rect(0,0,W,H,C.bg);
 // Centre the same content column (<=520px) in portrait and landscape.
 // On phones its X coordinates are identical to the previous dialog,
 // retaining the approved title, X and Restore Defaults geometry.
 const pageW=Math.max(0,Math.min(r.width-2*UI_SPACE.padX,
  UI_SPACE.appMax-2*UI_SPACE.padX));
 const pageX=r.off+(r.width-pageW)/2,headerY=r.hy;
 // Use the very same panel radius, fill, border, header centre, font size,
 // colour, tracking and title inset as the TETRIS SYSTEM home-screen header.
 panel(pageX,headerY,pageW,headH,12,C.panel);
 const titleSize=r.landscape?13:Math.min(21,Math.max(16,W*.05));
 const closeX=pageX+pageW-UI_SPACE.headRightPad-q.buttonH;
 const debugX=closeX-q.buttonH-UI_SPACE.headIconGap;
 text('DISPLAY SYSTEM',pageX+UI_SPACE.headTitleInset,
  headerY+headH/2,titleSize,C.ink,'left',
  Math.max(10,debugX-pageX-UI_SPACE.headTitleInset-gap));
 const headerButtonY=headerY+(headH-q.buttonH)/2;
 key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug');
 const debugLum=gray(buttonLight(debugX,headerButtonY,q.buttonH,q.buttonH));
 if(debugCopyState==='copied'||debugCopyState==='failed')
  text(debugCopyState==='copied'?'✓':'!',debugX+q.buttonH/2,
   headerButtonY+q.buttonH/2,BUTTON_ICON_FONT_SIZE,debugLum,'center');
 else drawDebugBug(debugX+q.buttonH/2,headerButtonY+q.buttonH/2,debugLum);
 key('X',closeX,headerButtonY,q.buttonH,q.buttonH,'close');
 const restoreW=Math.min(pageW-2*pad,
  r.boardW*UI_SPACE.overlayButtonWidthScale);
 const restoreY=H-q.safeBottom-gap-r.extraH;
 key('RESTORE DEFAULTS',pageX+(pageW-restoreW)/2,restoreY,
  restoreW,r.extraH,'resetFX',{light:true});
 const contentX=pageX+pad,contentW=pageW-2*pad;
 const top=headerY+headH+gap,bottom=restoreY-gap;
 const visibleH=Math.max(0,bottom-top);
 modalView={x:contentX,y:top,w:contentW,h:visibleH};
 const model=settingsRows(q.buttonH,gap,contentW);
 optionsMaxScroll=Math.max(0,model.height-visibleH);
 optionsScroll=clamp(optionsScroll,0,optionsMaxScroll);
 g.save();g.beginPath();g.rect(contentX,top,contentW,visibleH);g.clip();
 region(contentX,top,contentW,visibleH,'scroll',{scroll:true});
 for(const row of model.rows){
  const y=top+row.offset-optionsScroll;
  if(y+row.height<top||y>bottom)continue;
  const effect=row.effect,previewSize=settingsPreviewSize(contentW);
  // Centre thumbnail and content block independently in the SAME measured row.
  const previewX=contentX+gap;
  const previewY=y+(row.rowHeight-previewSize)/2;
  drawEffectThumbnail(effect.id,previewX,previewY,previewSize);
  const ctrlX=previewX+previewSize+gap;
  const ctrlW=contentX+contentW-gap-ctrlX;
  const blockTop=y+(row.rowHeight-row.contentHeight)/2;
  const titleY=blockTop+SETTINGS_TITLE_H/2;
  const toggleLum=gray(buttonLight(ctrlX,titleY-17,ctrlW,34));
  settingSquare(ctrlX,titleY-SETTINGS_SQUARE_SIZE/2,
   SETTINGS_SQUARE_SIZE,Boolean(settingValue(effect.toggle)),toggleLum);
  text(effect.title,ctrlX+SETTINGS_SQUARE_SIZE+gap,titleY,12,toggleLum,
   'left',Math.max(10,ctrlW-SETTINGS_SQUARE_SIZE-gap));
  region(ctrlX,titleY-17,ctrlW,34,'toggle',
   {field:effect.toggle,modalControl:true});
  const firstY=blockTop+SETTINGS_TITLE_H+gap+SETTINGS_CONTROL_H/2;
  if(effect.id==='ghost'){
   const half=(ctrlW-2*gap)/2;
   drawSettingsSlider(ctrlX,firstY,half,effect.sliders[0]);
   drawSettingsSlider(ctrlX+half+2*gap,firstY,half,effect.sliders[1]);
   drawSettingsSlider(ctrlX,firstY+SETTINGS_CONTROL_H+gap,
    ctrlW,effect.sliders[2]);
  }else if(effect.id==='softness'){
   drawSettingsSlider(ctrlX,firstY,ctrlW,effect.sliders[0]);
   drawSettingsSlider(ctrlX,firstY+SETTINGS_CONTROL_H+gap,
    ctrlW,effect.sliders[1]);
  }else if(effect.sliders?.length){
   effect.sliders.forEach((setting,i)=>drawSettingsSlider(ctrlX,
    firstY+i*(SETTINGS_CONTROL_H+gap),ctrlW,setting));
  }
  if(effect.pattern){
   // Pattern picker belongs to Scanlines; no new category or separate row.
   const selectY=blockTop+SETTINGS_TITLE_H+gap+
    SETTINGS_CONTROL_H+gap,selectH=SETTINGS_SELECT_H;
   const pickerLum=gray(buttonLight(ctrlX,selectY,ctrlW,selectH));
   panel(ctrlX,selectY,ctrlW,selectH,5,C.button,pickerLum);
   const current=SCANLINE_CHOICES.find(o=>o.id===selectedScanlineChoice());
   const shortNames={horizontal:'HORIZONTAL',aperture:'APERTURE',
    slot:'SLOT MASK',dot:'DOT MASK'};
   text(shortNames[current?.id]||current?.name||'ORIGINAL',
    ctrlX+gap,selectY+selectH/2,10,pickerLum,'left',
    Math.max(10,ctrlW-3*gap-BUTTON_ICON_FONT_SIZE));
   settingsExpandArrow(ctrlX+ctrlW-gap-BUTTON_ICON_FONT_SIZE/2,
    selectY+selectH/2,scanlineMenuOpen,pickerLum);
   region(ctrlX,selectY,ctrlW,selectH,'patternSelect',{modalControl:true});
   if(scanlineMenuOpen)SCANLINE_CHOICES.forEach((option,i)=>{
    const cy=y+row.rowHeight+i*(row.choiceHeight+gap);
    const chosen=option.id===selectedScanlineChoice();
    const choiceLum=gray(buttonLight(contentX+2*gap,cy,
     contentW-4*gap,row.choiceHeight));
    settingSquare(contentX+3*gap,
     cy+(row.choiceHeight-SETTINGS_SQUARE_SIZE)/2,
     SETTINGS_SQUARE_SIZE,chosen,choiceLum);
    text(option.name,contentX+5*gap+SETTINGS_SQUARE_SIZE,
     cy+row.choiceHeight/2,11,choiceLum,
     'left',contentW-8*gap-SETTINGS_SQUARE_SIZE);
    region(contentX+2*gap,cy,contentW-4*gap,row.choiceHeight,
     'scanlineChoice',{field:option.id,modalControl:true});
   });
  }
 }
 g.restore();
 // Keep scroll input and momentum; omit decorative scrollbar/row separators.
}
function drawScores(q){
 // One local personal record, displayed over the existing blurred playfield.
 // Rendered as neutral grayscale for the unchanged green/amber CRT compositor.
 const {W,H}=getViewport(),{x,y,w,h,pad,gap}=q;
 clearRegions();region(0,0,W,H,'block');
 panel(x,y,w,h,5,null,C.border);
 const best=getBest();
 const inset=Math.max(12,pad*2),inner=w-2*inset;
 const titleSize=Math.min(21,Math.max(15,w*.081));
 const titleH=titleSize+10;
 const rowH=Math.max(35,Math.min(51,h*.087));
 const buttonH=q.secondaryH,buttonW=w*UI_SPACE.overlayButtonWidthScale;
 const contentH=titleH+gap*3+3*rowH;
 const top=y+Math.max(inset,(h-contentH-buttonH-gap*3)/2);
 text('HIGH SCORE',x+w/2,top+titleH/2,titleSize,C.bright,'center',inner);
 const rows=[
  ['SCORE',String(best?.score??0).padStart(6,'0')],
  ['LINES',String(best?.lines??0).padStart(2,'0')],
  ['LEVEL',String(best?.level??0).padStart(2,'0')]
 ];
 const rowTop=top+titleH+gap*2;
 const labelSize=Math.max(11,Math.min(14,w*.053));
 const valueSize=Math.max(12,Math.min(16,w*.061));
 rows.forEach(([label,value],i)=>{
  const ry=rowTop+i*rowH;
  const middle=ry+rowH*.39;
  text(label,x+inset,middle,labelSize,C.ink,'left',inner*.43,'terminal');
  text(value,x+w-inset,middle,valueSize,C.bright,'right',inner*.56,'terminal');
  if(i<2){
   const dividerY=ry+rowH-2;
   // Thin dotted terminal separators, not the old ranking-table borders.
   for(let dx=0;dx<inner;dx+=5)rect(x+inset+dx,dividerY,1.5,.8,C.bright);
  }
 });
 const bx=x+(w-buttonW)/2;
 const by=Math.min(y+h-inset-buttonH,rowTop+3*rowH+gap*3);
 key('RETURN',bx,by,buttonW,buttonH,'close',{light:true});
}
function paintModal(q){
 const modal=getModal();
 if(modal==='options')drawOptions(q);
 else if(modal==='scores')drawScores(q);
}

 function resetSettings(){
  optionsScroll=0;optionsMaxScroll=0;scanlineMenuOpen=false;
 }
 function reset(){
  modalView=null;resetSettings();debugCopyState='idle';
 }
 return Object.freeze({
  modalBounds,paintModal,toggleScanlineMenu,chooseScanline,reset,resetSettings,
  get view(){return modalView;},
  get scroll(){return optionsScroll;},
  set scroll(v){optionsScroll=v;},
  get maxScroll(){return optionsMaxScroll;},
  get scanlineMenuOpen(){return scanlineMenuOpen;},
  get debugCopyState(){return debugCopyState;},
  set debugCopyState(value){debugCopyState=value;}
 });
}

/* NOMAD minimal terminal output engine.
 * Understands a small byte stream: printable ASCII/text, CR, LF, BS,
 * TAB, and CSI K / 2K (erase-to-end / erase-entire-line).
 *
 * It owns characters and cursor only; it does NOT know about gameplay,
 * message timestamps, animation timing, fades, or the canvas. The UI keeps
 * the two fixed '>' prompts and treats row 0 as live output, row 1 as history.
 */
function createTerminalEngine({columns=36,capacity=160}={}){
 const max=Math.max(4,Math.min(1024,Math.trunc(Number(capacity)||160)));
 const clampColumns=n=>Math.max(4,Math.min(max,Math.trunc(Number(n)||4)));
 let cols=clampColumns(columns),cursor=2;
 let active=Array(max).fill(' '),history='';
 let mode='text',csi='';
 active[0]='>';active[1]=' ';
 const cellWrite=ch=>{
  if(cursor>=cols-1)return false; // reserve one complete cursor cell
  active[cursor++]=ch;
  return true;
 };
 const reset=()=>{
  active.fill(' ');
  active[0]='>';active[1]=' ';
  cursor=2;
 };
 const clearAfter=()=>{
  for(let i=cursor;i<max;i++)active[i]=' ';
 };
 const clearLine=()=>{
  for(let i=2;i<max;i++)active[i]=' ';
 };
 function executeCSI(command){
  const raw=csi;
  csi='';
  if(command==='K'){
   if(raw==='2')clearLine();
   else if(raw===''||raw==='0')clearAfter();
  }
 }
 function feed(input){
  let changed=false;
  for(const ch of String(input)){
   if(mode==='esc'){
    mode=ch==='['?'csi':'text';
    csi='';
    continue;
   }
   if(mode==='csi'){
    if(/[0-9;]/.test(ch)&&csi.length<12){csi+=ch;continue;}
    if(ch==='K')executeCSI(ch);
    mode='text';csi='';
    continue;
   }
   if(ch==='\x1b'){mode='esc';continue;}
   if(ch==='\r'){cursor=2;continue;}
   if(ch==='\n'){
    history=active.slice(0,Math.min(cursor,cols)).join('').trimEnd();
    reset();changed=true;continue;
   }
   if(ch==='\b'){cursor=Math.max(2,cursor-1);continue;}
   if(ch==='\t'){
    const target=2+Math.ceil((cursor-1)/4)*4;
    while(cursor<target&&cursor<cols-1)changed=cellWrite(' ')||changed;
    continue;
   }
   // Ignore unsupported C0 controls and DEL rather than printing boxes.
   const code=ch.codePointAt(0);
   if(code<32||code===127)continue;
   changed=cellWrite(ch)||changed;
  }
  return changed;
 }
 function setColumns(n){
  cols=clampColumns(n);
  cursor=Math.max(2,Math.min(cursor,cols-1));
 }
 function setHistory(line){
  // Resizing a responsive UI requires recomposing historical dot leaders.
  history=String(line||'').slice(0,cols-1);
 }
 function snapshot(){
  return {cells:active.slice(0,cols),cursor,columns:cols,history};
 }
 return Object.freeze({feed,setColumns,setHistory,snapshot});
}

/* NOMAD two-row line-at-a-time terminal. Fixed character cells, uppercase typography and
 * character-at-a-time output. Right-side statuses are aligned using dot leaders
 * computed BEFORE the line is typed; no text ever jumps on screen.
 * Rendering owns no game rules, DOM, or WebGL state.
 */
const pad=n=>String(n).padStart(2,'0');
function stamped(date,seconds=true){
 const d=date instanceof Date&&Number.isFinite(date.getTime())?date:new Date();
 return '['+pad(d.getHours())+':'+pad(d.getMinutes())+
  (seconds?':'+pad(d.getSeconds()):'')+']';
}
function terminalLineBounds(r){
 return {x:r.dx+5,y:r.dy+r.dh+1,w:Math.max(1,r.dw-10),h:37};
}
// A line is built once, then emitted through the same character grid that
// moves the full-cell cursor. Statuses never pop in at the right-hand edge.
function composeTerminalMessage(entry,columns){
 const width=Math.max(1,Math.floor(columns)-3); // '> ', then one cursor cell
 const parts=value=>{
  const s=String(value||'').trim().toUpperCase();
  const colon=s.indexOf(':');
  if(colon>0)return [s.slice(0,colon).trim(),s.slice(colon+1).trim()];
  const i=s.indexOf(' ');
  return i<0?['SYS',s]:[s.slice(0,i),s.slice(i+1).trim()];
 };
 const shortTag={SYSTEM:'SYS',SESSION:'SES',GAME:'GM',INPUT:'IN',CLEAR:'CLR',LEVEL:'LVL'};
 const candidates=[
  [stamped(entry.at,true),parts(entry.full),false],
  [stamped(entry.at,true),parts(entry.short),false],
  [stamped(entry.at,false),parts(entry.full),false],
  [stamped(entry.at,false),parts(entry.short),false],
  [stamped(entry.at,false),parts(entry.short),true],
  ['',parts(entry.short),true]
 ];
 for(const [stamp,p,abbreviate] of candidates){
  const tag=abbreviate?(shortTag[p[0]]||p[0].slice(0,3)):p[0];
  const left=(stamp?stamp+' ':'')+tag;
  const right=p[1];
  // Minimum '..' and spaces around the leaders; exact width keeps the
  // final status flush-right one cell before the blinking block cursor.
  const remaining=width-left.length-right.length;
  if(remaining>=4){
   return left+' '+'.'.repeat(remaining-2)+' '+right;
  }
 }
 // Very small viewports: retain the status first, with as much label as fits.
 const [tag,status]=parts(entry.short);
 const right=status.slice(-Math.max(1,width-4));
 const room=width-right.length;
 const left=tag.slice(0,Math.max(0,room-3));
 if(room>=4)return left+' '+'.'.repeat(room-left.length-2)+' '+right;
 return right.padStart(width,' ');
}
// A small authentic byte-stream terminal owns the character grid and cursor.
// NOMAD owns the queue, fixed prompts, and two-row snap/fade presentation.
// Old text snaps off, waits 250 ms, appears on the lower history row,
// then waits 250 ms before the next message types at 37 characters/second.
function createTerminalLog({clock=()=>new Date(),
 typeMs=1000/37,holdMs=1750,offMs=250,pretypeMs=250}={}){
 const engine=createTerminalEngine({columns:36});
 let columns=36,phase='new';
 let current='',activeEntry=null,historyEntry=null;
 let nextAt=0,lastInput=0;
 const events=[{full:'SYSTEM: READY',short:'SYS: READY',at:clock()}];
 const clearActive=now=>{
  // CR + ANSI CSI 2K resets the output without touching either prompt.
  engine.feed('\r\x1b[2K');
  lastInput=now;
 };
 const write=(ch,now)=>{engine.feed(ch);lastInput=now;};
 function enqueue(full,short=full,priority=false){
  const entry={full:String(full).toUpperCase(),short:String(short).toUpperCase(),at:clock()};
  if(priority)events.splice(0,events.length,entry);
  else{events.push(entry);if(events.length>6)events.splice(0,events.length-6);}
 }
 function setColumns(n){
  const next=Math.max(4,Math.min(160,Math.floor(Number(n)||4)));
  if(next===columns)return;
  const state=engine.snapshot();
  const alreadyTyped=state.cells.slice(2,state.cursor).join('');
  columns=next;
  engine.setColumns(columns);
  // Recompose the status suffix at the actual viewport's character width.
  if(historyEntry)engine.setHistory('> '+composeTerminalMessage(historyEntry,columns));
  if(activeEntry&&phase!=='snap-off'){
   const rewritten=composeTerminalMessage(activeEntry,columns);
   current=rewritten;
   if(!rewritten.startsWith(alreadyTyped)||state.cursor>=columns){
    clearActive(lastInput);
    if(phase==='hold')phase='type';
    nextAt=0;
   }
  }
 }
 function start(now){
  activeEntry=events.shift()||null;
  if(!activeEntry){phase='hold';nextAt=now+holdMs;return false;}
  clearActive(now);
  current=composeTerminalMessage(activeEntry,columns);
  phase='type';nextAt=now;
  return true;
 }
 function advance(now){
  if(now<nextAt)return false;
  if(phase==='new')return start(now);
  if(phase==='type'){
   const typed=engine.snapshot().cursor-2;
   if(typed<current.length){
    write(current[typed],now);nextAt=now+typeMs;return true;
   }
   phase='hold';nextAt=now+holdMs;
   return false;
  }
  if(phase==='hold'){
   if(events.length===0)return false;
   // Only content snaps off; the two fixed prompt arrows remain visible.
   phase='snap-off';nextAt=now+offMs;lastInput=now;
   return true;
  }
  if(phase==='snap-off'){
   // LF actually advances the terminal stream. NOMAD draws the just-finished
   // line in the faded lower row instead of a conventional upper scrollback.
   historyEntry=activeEntry;
   engine.feed('\n');
   engine.setHistory('> '+composeTerminalMessage(historyEntry,columns));
   activeEntry=events.shift()||null;
   if(!activeEntry){phase='hold';nextAt=now+holdMs;return true;}
   clearActive(now);
   current=composeTerminalMessage(activeEntry,columns);
   phase='pretype';nextAt=now+pretypeMs;
   return true;
  }
  if(phase==='pretype'){
   phase='type';nextAt=now;
   return true;
  }
  return false;
 }
 function cursorVisible(now){
  const elapsed=Math.max(0,now-lastInput);
  return elapsed<500||Math.floor((elapsed-500)/480)%2===0;
 }
 function nextDelay(now){
  const elapsed=Math.max(0,now-lastInput);
  const blink=elapsed<500?500-elapsed:480-((elapsed-500)%480);
  const phaseWait=(phase==='hold'&&!events.length)?Infinity:Math.max(0,nextAt-now);
  return Math.max(16,Math.min(blink,phaseWait));
 }
 function snapshot(){
  return {...engine.snapshot(),phase,
   pending:events.length,activeVisible:phase!=='snap-off'};
 }
 return Object.freeze({enqueue,setColumns,advance,cursorVisible,nextDelay,snapshot});
}
function drawTerminalLog(ctx,log,r,now,ink='#e3e3e3',bg='#080808',
 font='"Roboto Condensed",ui-monospace,Menlo,monospace'){
 const b=terminalLineBounds(r);
 const fontSize=10; // Same size and weight as SURVIVE THE SOVIET CHALLENGE.
 ctx.save();
 ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 ctx.font='700 '+fontSize+'px '+font;
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.letterSpacing='0px';
 if('fontKerning' in ctx)ctx.fontKerning='none';
 // Title-style proportional characters retain a fixed terminal cell grid.
 const cell=Math.max(1,Math.ceil(Math.max(
  ...['M','W','@','0'].map(ch=>ctx.measureText(ch).width)
 ))+1);
 log.setColumns(Math.max(4,Math.floor(b.w/cell)));
 const {cells,cursor,history,activeVisible}=log.snapshot();
 const metrics=ctx.measureText('H');
 const ascent=metrics.actualBoundingBoxAscent||fontSize*.70;
 const descent=metrics.actualBoundingBoxDescent||0;
 const cellH=Math.ceil(ascent+descent)+4;
 // Preserve the two-row terminal; shift its artwork 8px below the original
 // active position, rather than 14px. Gameplay layout is unchanged.
 const pitch=14,top=b.y+16,bottom=top+pitch;
 function glyph(ch,col,y,color=ink){
  ctx.fillStyle=color;
  ctx.fillText(ch,b.x+col*cell+(cell-ctx.measureText(ch).width)/2,
   y+(ascent-descent)/2);
 }
 // The two prompts are fixed. Historical text never moves or rewrites them.
 if(activeVisible){
  for(let i=2;i<cursor;i++){
   const ch=cells[i];
   if(ch!==' ')glyph(ch,i,top);
  }
 }
 for(let i=2;i<history.length&&i<cells.length;i++){
  const ch=history[i];
  if(ch!==' ')glyph(ch,i,bottom);
 }
 // Background-gradient occlusion affects ONLY older text at the bottom.
 const fade=ctx.createLinearGradient(0,b.y+23,0,b.y+b.h);
 fade.addColorStop(0,'rgba(8,8,8,0)');
 fade.addColorStop(.55,'rgba(8,8,8,0.40)');
 fade.addColorStop(1,bg);
 ctx.fillStyle=fade;ctx.fillRect(b.x,b.y+23,b.w,b.h-23);
 // Draw fixed arrows AFTER fading so neither the arrow nor its position dims.
 glyph('>',0,top);
 glyph('>',0,bottom);
 if(log.cursorVisible(now)&&cursor<cells.length){
  const position=activeVisible?cursor:2;
  const x=b.x+position*cell,y=top-cellH/2;
  ctx.fillStyle=ink;ctx.fillRect(x,y,cell,cellH);
  const ch=activeVisible?cells[position]:' ';
  if(ch&&ch!==' ')glyph(ch,position,top,bg);
 }
 ctx.restore();
}

return {createCanvasUI,fitPreviewCells,createHudDrawing,createModalUI,createTerminalEngine,terminalLineBounds,composeTerminalMessage,createTerminalLog,drawTerminalLog};
})();
// Device-independent CSS-pixel visual geometry.
const Layout=(()=>{
'use strict';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const PORTRAIT_MIN_BOARD_GAP=8;
function computeLayout(W,H,safe,ui){
  W=Math.max(1,Number(W)||1);H=Math.max(1,Number(H)||1);
  const edges={
    top:clamp(Number(safe?.top)||0,0,H*.45),
    bottom:clamp(Number(safe?.bottom)||0,0,H*.45),
    left:clamp(Number(safe?.left)||0,0,W*.45),
    right:clamp(Number(safe?.right)||0,0,W*.45)
  };
  const usableW=Math.max(1,W-edges.left-edges.right);
  const usableH=Math.max(1,H-edges.top-edges.bottom);
  const landscape=W>H&&H<=600;
  const width=landscape?usableW:Math.min(usableW,ui.appMax);
  const off=edges.left+(usableW-width)/2;
  const pad=ui.padX,inner=Math.max(0,width-2*pad);
  const short=H<=730,compact=H<=620,gap=ui.stackGap;
  const deckPad=ui.deckPad,deckGap=ui.deckGap;
  // Preserve the established portrait sizes on either side of each range.
  // Grow the header and deck together gradually, so their combined height
  // grows more slowly than the viewport and cannot take height from the board.
  const compactGrowth=clamp((H-604)/32,0,1);
  const regularGrowth=clamp((H-702)/56,0,1);
  const preferredButtonH=42+3*compactGrowth+(ui.padHeight-45)*regularGrowth;
  const preferredExtraH=42+(ui.headIcons-42)*regularGrowth;
  const buttonH=landscape?(compact?42:short?45:ui.padHeight):
    Math.max(44,preferredButtonH);
  const headerButtonH=landscape?37:preferredExtraH;
  const extraH=landscape?headerButtonH:Math.max(44,preferredExtraH);
  const overlaySecondaryH=landscape?(compact?39:short?40:ui.extrasHeight):
    39+compactGrowth+(ui.extrasHeight-40)*regularGrowth;
  let hy=edges.top+4+5*compactGrowth-9*regularGrowth;
  let hh=50+8*compactGrowth+(ui.headHeight-58)*regularGrowth;
  const dhDefault=2*deckPad+deckGap+buttonH+extraH;
  // Ease into the full bottom margin. The terminal needs 37 CSS pixels
  // plus its 1px deck gap, including room below the usable area if present.
  const preferredMargin=Math.min(ui.deckBottom,
    Math.max(ui.unit,usableH*.055,ui.deckBottom+(H-550)*.25));
  const bottomMargin=Math.max(preferredMargin,38-edges.bottom);
  let dh=dhDefault,dy=H-edges.bottom-bottomMargin-dh;
  let sy=hy+hh+gap,sh=Math.max(0,dy-gap-sy);
  let hx=off+pad,hw=inner,sx=off+pad,sw=inner,dx=off+pad,dw=inner;
  if(landscape){
    const legacyStatsOffset=ui.scoreHeight+deckGap;
    let left=clamp(width*.24,100,205);
    let right=clamp(width*.30,166,260);
    const shortage=Math.max(0,124-(width-left-right-36));
    if(shortage){
      left=Math.max(88,left-shortage*.4);
      right=Math.max(150,right-shortage*.6);
    }
    hy=edges.top+8;hh=Math.min(64,Math.max(42,usableH-16));
    dy=edges.top+8+legacyStatsOffset;
    // Reserve an unframed terminal line below the landscape controls.
    dh=Math.max(0,usableH-16-legacyStatsOffset-31);
    sy=edges.top+8;sh=Math.max(0,usableH-16);
    hx=off+8;hw=Math.max(0,left);
    sx=off+left+14;sw=Math.max(0,width-left-right-36);
    dx=off+width-right-8;dw=Math.max(0,right);
  }
  const sideGap=Math.min(ui.sideGap,Math.max(0,sw*.025));
  const sideWidth=Math.min(ui.side,Math.max(0,sw*.36));
  // The stage already excludes one stack gap at its top and bottom.
  const minimumBoardSpacing=2*Math.max(0,PORTRAIT_MIN_BOARD_GAP-gap);
  const boardRegionH=landscape?sh:Math.max(0,sh-minimumBoardSpacing);
  const brickGap=ui.padGap; // Identical to the horizontal control gap.
  let bw=Math.max(0,Math.min(305,sw-sideWidth-sideGap,boardRegionH/2));
  if(!landscape&&bw>4){
    // V135: anchor the OUTER brick frame (not the board's playable cells)
    // to the header and footer's left edge. Reserve the full 75%-cell-wide
    // rail on both sides and keep the 75%-size preview panel fully visible.
    // Only unusually width-constrained portrait viewports need a small
    // additional board reduction to satisfy both edge alignments.
    const framedSpan=boardWidth=>{
      const tile=Math.max(0,(boardWidth-4)/10)*.75;
      const sidebarPanelWidth=Math.min(sideWidth,
        Math.max(Math.min(sideWidth,52),tile*4+10));
      // Two board-to-rail gutters, plus the right rail-to-sidebar gutter.
      return boardWidth+2*tile+3*brickGap+sidebarPanelWidth;
    };
    if(framedSpan(bw)>hw){
      let lo=4,hi=bw;
      for(let i=0;i<32;i++){
        const mid=(lo+hi)/2;
        if(framedSpan(mid)<=hw)lo=mid;
        else hi=mid;
      }
      bw=lo;
    }
  }
  const bh=bw*2;
  const bx=landscape?sx+Math.max(0,(sw-bw-sideGap-sideWidth)/2):
    hx+Math.max(0,(bw-4)/10)*.75+brickGap;
  // Keep the game board's 10:20 ratio while centering it vertically.
  const by=sy+Math.max(0,(sh-bh)/2);
  // When width limits the board, move the header and deck inward equally.
  // Keep the leftover space outside the centered stack.
  const stackInset=landscape?0:Math.max(0,(sh-bh)/2+gap-PORTRAIT_MIN_BOARD_GAP);
  hy+=stackInset;
  dy-=stackInset;
  sy+=stackInset;
  sh-=2*stackInset;
  // V133: in portrait, align the complete sidebar's RIGHT edge with
  // the header and footer; do not right-align its text labels.
  // Landscape retains its existing three-column arrangement.
  const boardCell=Math.max(0,(bw-4)/10);
  const previewCell=boardCell*.75;
  const firstSideX=bx+bw+sideGap;
  // V141 portrait: match the six-pixel gap on BOTH sides of the right rail.
  // All five sidebar panels still terminate at the unchanged header edge.
  // Landscape retains its previously approved three-column geometry.
  const rightRailEnd=bx+bw+brickGap+previewCell;
  const equalGutterX=rightRailEnd+brickGap;
  const sxSide=landscape?firstSideX:
    Math.min(hx+hw,Math.max(firstSideX,equalGutterX));
  const swSide=landscape?Math.max(0,Math.min(sideWidth,sx+sw-sxSide)):
    Math.max(0,hx+hw-sxSide);
  // V132: compact, equal-width panels share one right edge. NEXT/HOLD each
  // have just one visible preview frame, with a label above its border.
  // The game board and outer sidebar bounds remain untouched.
  const previewLabelSpace=16;
  const panelGap=ui.unit;
  const desiredWidth=previewCell*4+10; // max-size I piece + 5px edge inset
  // Portrait boxes expand to the rail gutter, rather than leaving an
  // uneven strip. Preserve the existing compact landscape sizing.
  const panelWidth=landscape?
    Math.min(swSide,Math.max(Math.min(swSide,52),desiredWidth)):swSide;
  const panelX=sxSide+swSide-panelWidth;
  const previewTarget=panelWidth;
  // V138: three separate SCORE / LEVEL / LINES readouts need room for
  // labels above flat, equal-width displays. Keep the center alignment.
  const statsTarget=Math.min(150,Math.max(104,bh*.32));
  const usablePanelHeight=Math.max(0,bh-2*previewLabelSpace-2*panelGap);
  const targetTotal=2*previewTarget+statsTarget;
  const fit=targetTotal>0?Math.min(1,usablePanelHeight/targetTotal):0;
  let previewH=previewTarget*fit,statsH=statsTarget*fit;
  // A very short portrait may have a wide sidebar but limited vertical
  // height. Reserve legible score rows and let previews become shallower.
  if(!landscape){
    const minStatsH=Math.min(96,usablePanelHeight*.58);
    if(statsH<minStatsH){
      statsH=minStatsH;
      previewH=Math.min(previewTarget,Math.max(0,(usablePanelHeight-statsH)/2));
    }
  }
  const nextPanel={x:panelX,y:by+previewLabelSpace,w:panelWidth,h:previewH};
  const statsPanel={x:panelX,y:by+(bh-statsH)/2,w:panelWidth,h:statsH};
  const holdPanel={x:panelX,y:by+bh-previewH,w:panelWidth,h:previewH};
  const compactControls=landscape&&(dw-2*deckPad)<250;
  return {safe:edges,landscape,short,compact,compactControls,width,off,pad,inner,gap,
    hy,hh,hx,hw,sy,sh,sx,sw,boardX:bx,boardY:by,boardW:bw,boardH:bh,
    sideX:sxSide,sideW:swSide,brickGap,previewCell,previewLabelSpace,holdPanel,nextPanel,statsPanel,dx,dy,dw,dh,
    deckPad,deckGap,buttonH,headerButtonH,extraH,overlaySecondaryH,
    footerY:H-edges.bottom-18-stackInset};
}
const api=Object.freeze({computeLayout});

return api;
})();
export const {PHOSPHOR_BOUNDS,normalizePersistenceMs,integratePhosphorResponse,createPhosphorPersistencePass,createCompositor,MAX_BUTTON_FLASHES,BUTTON_BASE_LEVEL,BUTTON_PEAK_LEVEL,BUTTON_FLASH_PEAK_MS,MIN_PRESS_FRAME_MS,BUTTON_AFTERGLOW_MS,BUTTON_FLASH_TOTAL_MS,createButtonFeedback,GPU_BUTTON_CAPACITY,GPU_BUTTON_SOURCE_LEVELS,excitedButtonGray,createGpuButtonLighting,buttonFeedbackLayers,croppedBounds,sidebarBounds,controlsBounds,drawCroppedCanvas,createRenderInvalidation,captureGameVisualState,gameVisualStateChanged,flashPhase}=CRT;
export const {pieceLuminance,PIECE_PATTERNS,drawIFragment,drawIBar,drawTileFace,drawPieceTiles,VECTOR_PIECE_KINDS,spriteIdentity,createVectorTileRenderer,collectIFragments,collectPieceShadowGroups,pieceShadowProfile,createPieceShadowRenderer}=Art;
export const {createCanvasUI,fitPreviewCells,createHudDrawing,createModalUI,createTerminalEngine,terminalLineBounds,composeTerminalMessage,createTerminalLog,drawTerminalLog}=UI;
export {buttonLevel,buttonInkLevel,PIECE_LUMINANCE,Layout};
export const {createPerfMonitor,createTextureUploadProfiler,formatDebugReport}=RenderDiagnostics;
export {instrumentCompositorPasses,makeRegion,makeButtonControl,makeSliderControl,findRegionAt,sliderValueAt};

/* Rendering-resource lifecycle: private implementation, public explicit hooks.
 * Platform decides WHEN to suspend or dispose; renderer owns WHAT is disposed.
 */
const RenderResourceLifecycle=(()=>{
/* The renderer owns its compositor, scene meshes, UI CanvasTextures and audio.
 * Teardown is idempotent and continues when an individual dispose throws.
 * No cleanup is triggered by temporary visibility loss or bfcache entry.
 */
function createGraphicsCleanup({
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


/* NOMAD Tetris V089 — WebGL context lifecycle and bounded diagnostics.
 * Three.js still owns the WebGLRenderer and its internal context recreation.
 * This observer prevents game activity while the context is unavailable and
 * reports recovery outcomes without storage, network calls or visible UI.
 */
function createGraphicsHealth({
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



return Object.freeze({createGraphicsCleanup,createGraphicsHealth});
})();
export const {createGraphicsCleanup,createGraphicsHealth}=RenderResourceLifecycle;

export default Layout;
