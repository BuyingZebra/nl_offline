/* Tetris System — diagnostics exported only by explicit user action.
 * Pure formatter: no network, storage, automatic sharing or mutable state.
 */
export function formatDebugReport({version,createdAt,platform,viewport,game,display,gpu,samples=[],current}={}){
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
 rows.push('Current settings: '+value(display?.settings));
 return rows.join('\n');
}
