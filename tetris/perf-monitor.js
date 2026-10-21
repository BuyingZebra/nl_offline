/* Tetris V054: opt-in, low-overhead diagnostics. Enable with ?perf=1.
 * CPU render submission is not GPU execution time. RAF is not display FPS.
 * No network requests, persistent data, or diagnostic DOM when disabled.
 */
export function createPerfMonitor({enabled=false,now=()=>performance.now(),
 log=summary=>console.info('[TETRIS PERF]',summary),
 onSample=()=>{},intervalMs=5000}={}){
 let started=enabled?now():0,last=null,lastRaf=null;
 let viewport=null,gpu=null;
 const fresh=()=>({ticks:0,draws:0,frameMs:0,renderMs:0,maxFrameMs:0,
  rafSamples:0,rafDeltaTotal:0,maxRafDelta:0,slowRafTicks:0,
  baseUploadRequests:0,popupUploadRequests:0,modalUploadRequests:0});
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
 function startFrame(){return enabled?now():0;}
 function endFrame(start){
  if(!enabled)return;
  const elapsed=now()-start;
  counters.ticks++;
  counters.frameMs+=elapsed;
  counters.maxFrameMs=Math.max(counters.maxFrameMs,elapsed);
  const period=now()-started;
  if(period>=intervalMs){
   const rounded=value=>+value.toFixed(2);
   const value={seconds:rounded(period/1000),
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
    viewport:viewport?{...viewport}:null,gpu:gpu?{...gpu}:null};
   last=value;
   try{log(value);}catch(err){/* Diagnostics must never break gameplay. */}
   try{onSample(value);}catch(err){/* Ignore debug overlay failure. */}
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
  snapshot:()=>last});
}

// This diagnostic HUD lives outside the Three.js compositor. It has no layout
// footprint, consumes no pointer events, and is created only when requested.
export function createPerfHud({enabled=false,document,container}={}){
 if(!enabled)return Object.freeze({update:()=>{},dispose:()=>{}});
 const el=document.createElement('div');
 el.setAttribute('aria-label','Tetris performance diagnostics');
 el.style.cssText=[
  'position:absolute','left:8px','top:calc(env(safe-area-inset-top, 0px) + 8px)',
  'z-index:4','pointer-events:none','white-space:pre',
  'font:10px/1.5 ui-monospace,monospace','color:#d5d5d5',
  'background:rgba(0,0,0,.92)','border:1px solid #777',
  'padding:6px','border-radius:4px','max-width:calc(100% - 16px)'
 ].join(';');
 el.textContent='PERF V054  ·  collecting samples…';
 container.appendChild(el);
 function update(s){
  const image=s.viewport?(`${s.viewport.width}×${s.viewport.height} @${s.viewport.dpr}x`):'unknown';
  const pacing=s.avgRafMs==null?'—':s.avgRafMs+' ms';
  const gpu=s.gpu?(`${s.gpu.activePasses ?? '?'} / ${s.gpu.totalPasses ?? '?'} passes · ${s.gpu.textures ?? '?'} textures`):'pending';
  el.textContent=[
   'PERF V054  ·  '+image,
   'RAF interval '+pacing+'  ·  slow '+s.slowRafTicks,
   'CPU frame '+s.avgFrameCpuMs+' ms  ·  max '+s.maxFrameCpuMs+' ms',
   'GPU submit '+s.avgRenderSubmitMs+' ms  ·  draws '+s.draws,
   'Uploads B/P/M '+s.baseUploadRequests+'/'+s.popupUploadRequests+'/'+s.modalUploadRequests,
   'Pipeline '+gpu
  ].join('\n');
 }
 function dispose(){el.remove();}
 return Object.freeze({update,dispose});
}
