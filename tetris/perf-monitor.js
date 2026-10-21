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
 const fresh=()=>({ticks:0,draws:0,frameMs:0,renderMs:0,maxFrameMs:0,
  rafSamples:0,rafDeltaTotal:0,maxRafDelta:0,slowRafTicks:0,
  baseUploadRequests:0,popupUploadRequests:0,modalUploadRequests:0,
  logicMs:0,logicCalls:0,basePaintMs:0,basePaintCount:0,
  modalPaintMs:0,modalPaintCount:0,syncMs:0,syncCount:0,
  redrawReasons:{},frameStates:{},gravityTickAdvances:0,visualStateChanges:0});
 let counters=fresh();
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
   popupUploadRequests:counters.popupUploadRequests,
   modalUploadRequests:counters.modalUploadRequests,
   avgLogicMs:+(counters.logicMs/Math.max(1,counters.logicCalls)).toFixed(3),
   avgBasePaintMs:+(counters.basePaintMs/Math.max(1,counters.basePaintCount)).toFixed(3),
   avgModalPaintMs:+(counters.modalPaintMs/Math.max(1,counters.modalPaintCount)).toFixed(3),
   avgSyncMs:+(counters.syncMs/Math.max(1,counters.syncCount)).toFixed(3),
   basePaints:counters.basePaintCount,modalPaints:counters.modalPaintCount,
   redrawReasons:{...counters.redrawReasons},frameStates:{...counters.frameStates},
   gravityTickAdvances:counters.gravityTickAdvances,
   visualStateChanges:counters.visualStateChanges,
   viewport:viewport?{...viewport}:null,gpu:gpu?{...gpu}:null};
 }
 function currentSnapshot(){return enabled?buildSnapshot():null;}
 // Stage measurements are CPU-side only. Measuring each stage separately avoids
 // interpreting time inside compositor.render() as game logic or canvas drawing.
 function recordDuration(kind,elapsed){
  if(!enabled||!Number.isFinite(elapsed)||elapsed<0)return;
  if(kind==='logic'){counters.logicCalls++;counters.logicMs+=elapsed;}
  else if(kind==='base'){counters.basePaintCount++;counters.basePaintMs+=elapsed;}
  else if(kind==='modal'){counters.modalPaintCount++;counters.modalPaintMs+=elapsed;}
  else if(kind==='sync'){counters.syncCount++;counters.syncMs+=elapsed;}
 }
 function recordRedrawReasons(reasons){
  if(!enabled)return;
  const names=Array.isArray(reasons)&&reasons.length?new Set(reasons):new Set(['unknown']);
  for(const name of names){
   const key=['startup','input','gravity','flash','scroll','resize','unknown'].includes(name)?name:'unknown';
   counters.redrawReasons[key]=(counters.redrawReasons[key]||0)+1;
  }
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
 }
 function startFrame(){return enabled?now():0;}
 function endFrame(start){
  if(!enabled)return;
  const elapsed=now()-start;
  counters.ticks++;
  counters.frameMs+=elapsed;
  counters.maxFrameMs=Math.max(counters.maxFrameMs,elapsed);
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
  else if(kind==='popup')counters.popupUploadRequests++;
  else if(kind==='modal')counters.modalUploadRequests++;
 }
 return Object.freeze({enabled,startFrame,endFrame,startRender,endRender,
  textureChanged,recordRaf,resetPacing,setViewport,setGPUStats,
  recordDuration,recordRedrawReasons,recordGameChanges,recordState,
  snapshot:()=>last,currentSnapshot});
}
