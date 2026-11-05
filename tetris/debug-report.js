/* Tetris System — diagnostics exported only by explicit user action.
 * Pure formatter: no network, storage, automatic sharing or mutable state.
 */
export function formatDebugReport({version,createdAt,platform,viewport,game,display,gpu,graphics,lifecycle,offline,samples=[],current}={}){
 const value=(v,unit='')=>v===null||v===undefined||v===''?'n/a':String(v)+unit;
 const rows=[
  'TETRIS SYSTEM / DEBUG REPORT',
  'Build: V'+value(version),
  'Captured: '+value(createdAt),
  'Browser: '+value(platform),
  'Viewport: '+(viewport?[viewport.width+'x'+viewport.height,'render DPR '+viewport.dpr,'device DPR '+value(viewport.deviceDpr)].join(' / '):'n/a'),
  'State: '+value(game?.status)+' / level '+value(game?.level)+' / score '+value(game?.score)+' / lines '+value(game?.lines),
  'Display: '+value(display?.theme)+' phosphor / '+value(display?.orientation)+' / '+value(display?.phosphor?'on':'off')+' tint',
  '',
  'RECENT FRAME SAMPLES (2-second windows, newest last)',
  'CPU frame = JS time; GPU submit = CPU call time, not GPU shader duration.',
  'RAF interval = pacing between scheduled frames, not physical display refresh rate.',
  'PASS CPU = time inside each compositor pass; may include driver waits, NOT GPU shader timing.',
  'PRE-UPLOAD = CPU time for renderer.initTexture on changed canvases; not GPU execution time.',
  'Uploads B/D/S/C/P/M = full-screen base / board / sidebar / controls / popup / modal requests.'
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
   ' | uploads B/D/S/C/P/M '+value(s.baseUploadRequests)+'/'+value(s.boardUploadRequests)+'/'+value(s.sidebarUploadRequests)+'/'+value(s.controlsUploadRequests)+'/'+value(s.popupUploadRequests)+'/'+value(s.modalUploadRequests));
  if(s.basePaints!==undefined||s.avgLogicMs!==undefined){
   const reasons=Object.entries(s.redrawReasons||{}).map(([k,n])=>k+':'+n).join(', ')||'none';
   rows.push('  STAGES: logic '+value(s.avgLogicMs,'ms/RAF')+
    ' | Canvas base '+value(s.avgBasePaintMs,'ms')+' ('+value(s.basePaints)+' paints)'+
    ' | Canvas board '+value(s.avgBoardPaintMs,'ms')+' ('+value(s.boardPaints)+' paints)'+
    ' | Canvas sidebar '+value(s.avgSidebarPaintMs,'ms')+' ('+value(s.sidebarPaints)+' paints)'+
    ' | Canvas controls '+value(s.avgControlsPaintMs,'ms')+' ('+value(s.controlsPaints)+' paints)'+
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
     name+' '+value(v.avgCpuMs,'ms')+'×'+v.calls);
    rows.push('  PRE-UPLOAD: '+(parts.length?parts.join(' | '):'none'));
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
