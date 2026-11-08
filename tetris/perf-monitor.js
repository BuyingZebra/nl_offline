/* Tetris System — low-overhead in-memory performance recorder.
 * V055 enables recording quietly for explicit user-initiated debug copies.
 * CPU render submission is not GPU execution time; RAF is not display FPS.
 * No network requests or persistent data are made by this module.
 */
export function createPerfMonitor({enabled=false,now=()=>performance.now(),
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
