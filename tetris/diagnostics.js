/* NOMAD v209 — pure application diagnostics; no rendering or gameplay ownership. */
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
 // Fixed 512-slot ring: bounded memory, no per-frame arrays or sorting.
 const frameCpuSamples=new Float32Array(512);
 let frameCpuUsed=0,frameCpuNext=0;
 function frameCpuPercentiles(){
  if(!frameCpuUsed)return {p50:null,p95:null,p99:null,samples:0};
  const sorted=Array.from(frameCpuSamples.subarray(0,frameCpuUsed)).sort((a,b)=>a-b);
  const at=q=>+sorted[Math.max(0,Math.ceil(sorted.length*q)-1)].toFixed(3);
  return {p50:at(.5),p95:at(.95),p99:at(.99),samples:sorted.length};
 }
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
  const percentile=frameCpuPercentiles();
  return {seconds:rounded(Math.max(0,period)/1000),
   frameTicks:counters.ticks,draws:counters.draws,
   avgFrameCpuMs:+(counters.frameMs/Math.max(1,counters.ticks)).toFixed(3),
   maxFrameCpuMs:+counters.maxFrameMs.toFixed(3),
   p50FrameCpuMs:percentile.p50,p95FrameCpuMs:percentile.p95,
   p99FrameCpuMs:percentile.p99,frameCpuPercentileSamples:percentile.samples,
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
  if(Number.isFinite(elapsed)&&elapsed>=0){
   frameCpuSamples[frameCpuNext]=elapsed;
   frameCpuNext=(frameCpuNext+1)%frameCpuSamples.length;
   if(frameCpuUsed<frameCpuSamples.length)frameCpuUsed++;
  }
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
   counters=fresh();frameCpuUsed=0;frameCpuNext=0;started=now();
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
function formatDebugReport({version,createdAt,platform,viewport,game,display,buttonRenderer,gpu,shadowStats,canvasMemory,graphics,lifecycle,offline,samples=[],current}={}){
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
  'CPU p50/p95/p99 = percentiles of up to 512 recent JavaScript RAF durations.',
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
   ' | CPU p50/p95/p99 '+value(s.p50FrameCpuMs,'ms')+'/'+value(s.p95FrameCpuMs,'ms')+'/'+value(s.p99FrameCpuMs,'ms')+
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
 if(shadowStats){
  rows.push('', 'DIRECTIONAL SHADOW CACHE (CPU; generated on cache misses)');
  rows.push('Mode: '+value(shadowStats.mode)+' / stamps '+value(shadowStats.cacheSize)+
   ' / raster estimates '+value(shadowStats.cacheKiB,' KiB'));
  rows.push('Cache builds: '+value(shadowStats.builds)+
   ' / total '+value(shadowStats.totalBuildMs,'ms')+
   ' / slowest '+value(shadowStats.maxBuildMs,'ms'));
  rows.push('No additional CanvasTextures or GPU passes for the shadow effect.');
 }
 if(canvasMemory){
  rows.push('', 'CANVAS SOURCE PIXELS (RGBA8 equivalent, not observed RAM or GPU VRAM)');
  rows.push('Surfaces: '+value(canvasMemory.count)+
   ' / source pixels '+value(canvasMemory.pixels)+
   ' / estimated RGBA8 '+value(canvasMemory.rgba8MiB,'MiB'));
  for(const surface of (canvasMemory.surfaces||[]).slice(0,7))
   rows.push('  '+value(surface.name)+': '+value(surface.width)+'x'+value(surface.height)+
    ' / '+value(surface.rgba8MiB,'MiB'));
  rows.push('Pixel-size model only; excludes WebGL render targets, compositor history, driver storage and browser overhead.');
 }
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


export {createPerfMonitor,instrumentCompositorPasses,createTextureUploadProfiler,formatDebugReport};
