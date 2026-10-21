/* Tetris System V053 — opt-in CPU timing and texture-upload diagnostics.
 * Disabled by default. '?perf=1' logs five-second samples to the console.
 * Timing covers CPU render submissions, NOT elapsed GPU shader execution.
 */
export function createPerfMonitor({enabled=false,now=()=>performance.now(),
 log=(summary)=>console.info('[TETRIS PERF]',summary),intervalMs=5000}={}){
 let started=enabled?now():0,last=null;
 const fresh=()=>({ticks:0,draws:0,frameMs:0,renderMs:0,maxFrameMs:0,
  baseUploadRequests:0,popupUploadRequests:0,modalUploadRequests:0});
 let counters=fresh();
 function startFrame(){return enabled?now():0;}
 function endFrame(start){
  if(!enabled)return;
  const elapsed=now()-start;
  counters.ticks++;
  counters.frameMs+=elapsed;
  counters.maxFrameMs=Math.max(counters.maxFrameMs,elapsed);
  const period=now()-started;
  if(period>=intervalMs){
   const value={seconds:+(period/1000).toFixed(2),
    frameTicks:counters.ticks,draws:counters.draws,
    avgFrameCpuMs:+(counters.frameMs/Math.max(1,counters.ticks)).toFixed(3),
    maxFrameCpuMs:+counters.maxFrameMs.toFixed(3),
    avgRenderSubmitMs:+(counters.renderMs/Math.max(1,counters.draws)).toFixed(3),
    baseUploadRequests:counters.baseUploadRequests,
    popupUploadRequests:counters.popupUploadRequests,
    modalUploadRequests:counters.modalUploadRequests};
   last=value;log(value);counters=fresh();started=now();
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
 return Object.freeze({enabled,startFrame,endFrame,startRender,endRender,textureChanged,
  snapshot:()=>last});
}
