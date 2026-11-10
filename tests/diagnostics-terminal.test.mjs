import {describe,test} from 'node:test';
import {formatDebugReport as format,createPerfMonitor,createTextureUploadProfiler,formatDebugReport,estimateCanvasSourceBytes} from '../tetris/render.js';
import {createDebugClipboard as createClipboard} from '../tetris/platform.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTerminalEngine,composeTerminalMessage,createTerminalLog,drawTerminalLog,terminalLineBounds} from '../tetris/render.js';
import {createRenderInvalidation,croppedBounds,controlsBounds,drawCroppedCanvas} from '../tetris/render.js';
import Layout from '../tetris/render.js';

const appDir=fileURLToPath(new URL('../tetris',import.meta.url));

describe('Debug report and clipboard',()=>{
 test('report includes device, game state, effect settings, and recent performance',()=>{
  const report=format({version:'055',createdAt:'2026-10-21T20:00:00Z',
   platform:'Mobile Safari',viewport:{width:393,height:852,dpr:3},
   game:{status:'paused',level:3,score:2500,lines:12},
   display:{theme:'green',orientation:'portrait',phosphor:true,
    settings:'{"bloom":true}'},
   gpu:{textures:12,geometries:3,programs:7,activePasses:8,totalPasses:10},
   samples:[{seconds:2,frameTicks:120,draws:4,avgRafMs:16.7,maxRafMs:20,
    slowRafTicks:0,avgFrameCpuMs:1.3,maxFrameCpuMs:7.2,
    avgRenderSubmitMs:.4,baseUploadRequests:4,popupUploadRequests:1,
    modalUploadRequests:0}]});
  assert.ok(report.includes('Build: V055'));
  assert.ok(report.includes('393x852 / render DPR 3 / device DPR n/a'));
  assert.ok(report.includes('paused / level 3 / score 2500'));
  assert.ok(report.includes('Mobile Safari'));
  assert.ok(report.includes('Textures: 12'));
  assert.ok(report.includes('Active passes: 8 / total passes: 10'));
  assert.ok(report.includes('Sample 1:'));
  assert.ok(report.includes('not GPU shader duration'));
  assert.ok(report.includes('{"bloom":true}'));
 });
 test('partial frame sample exists immediately, even before first reporting interval',()=>{
  let clock=0;const monitor=createPerfMonitor({enabled:true,now:()=>clock,intervalMs:2000,
   log:()=>{}});
  const t=monitor.startFrame();clock=17;monitor.endFrame(t);
  const report=format({version:'055',current:monitor.currentSnapshot(),samples:[]});
  assert.ok(report.includes('Sample 1:'));
  assert.ok(report.includes('frames 1'));
 });
 test('report limits history to last eight complete samples plus current window',()=>{
  const samples=Array.from({length:20},(_,i)=>({seconds:2,frameTicks:i+1}));
  const report=format({version:'055',samples,current:{seconds:.5,frameTicks:3}});
  assert.ok(!report.includes('frames 12'));
  assert.ok(report.includes('frames 13'));
  assert.ok(report.includes('frames 20'));
  assert.ok(report.includes('Sample 9:'));
 });
 test('formatting diagnostics never copies automatically',()=>{
  let copied=0;
  const navigator={clipboard:{writeText:()=>{copied++;return Promise.resolve();}}};
  const report=format({version:'055'});
  assert.ok(report.includes('TETRIS SYSTEM / DEBUG REPORT'));
  assert.equal(copied,0);
 });
 test('clipboard write is invoked directly with original report text',async()=>{
  let called=0,observed='';
  const clipboard=createClipboard({navigator:{clipboard:{writeText(value){
   called++;observed=value;return Promise.resolve();
  }}},document:{}});
  const result=clipboard.copyText('test data');
  assert.equal(called,1,'writeText invoked synchronously in activation event');
  assert.equal(await result,true);
  assert.equal(observed,'test data');
 });
 test('legacy clipboard selection fallback copies and cleans up',async()=>{
  let removed=false,restored=false,selected=false;
  const doc={activeElement:{focus(){restored=true;}},
   body:{appendChild(){}},execCommand:command=>command==='copy',
   createElement:()=>({style:{},setAttribute(){},focus(){},
    select(){selected=true;},setSelectionRange(){},remove(){removed=true;}})};
  const clipboard=createClipboard({navigator:{},document:doc});
  assert.equal(await clipboard.copyText('hello'),true);
  assert.equal(removed,true);assert.equal(selected,true);assert.equal(restored,true);
 });
 test('rejected async clipboard permissions fall back without throwing',async()=>{
  const doc={activeElement:null,body:{appendChild(){}},
   execCommand:()=>true,
   createElement:()=>({style:{},setAttribute(){},focus(){},select(){},remove(){}})};
  const clipboard=createClipboard({navigator:{clipboard:{writeText:()=>Promise.reject(Error('denied'))}},document:doc});
  assert.equal(await clipboard.copyText('report'),true);
 });
 test('failed clipboard writes return false for visual failure feedback',async()=>{
  const clipboard=createClipboard({navigator:{clipboard:{writeText:()=>Promise.reject(Error('denied'))}},document:{}});
  assert.equal(await clipboard.copyText('report'),false);
 });
 test('diagnostics are collected quietly with a bounded sample history',()=>{
  const code=fs.readFileSync(path.join(appDir,'platform.js'),'utf8');
  assert.ok(code.includes('const recentPerf=[];'));
  assert.ok(code.includes('if(recentPerf.length>8)recentPerf.shift()'));
  assert.ok(code.includes('enabled:true,intervalMs:2000,log:()=>{}'));
  assert.ok(!code.includes('console.log(report)'));
 });

 test('Copy Debug includes bounded WebGL lifecycle and recovery history',()=>{
  const report=format({
   version:'089',
   gpu:{textures:17,geometries:6,programs:12,activePasses:8,totalPasses:11},
   graphics:{
    status:'ready',losses:1,restores:1,renderFailures:0,lastError:null,
    lossDurationMs:null,history:[
     {at:'2026-11-05T10:00:00.000Z',type:'context-lost'},
     {at:'2026-11-05T10:00:01.000Z',type:'context-restored'},
     {at:'2026-11-05T10:00:02.000Z',type:'frame-recovered'}
    ]
   },
   samples:[
    {gpu:{textures:15,geometries:6,programs:12}},
    {gpu:{textures:18,geometries:6,programs:12}},
    {gpu:{textures:17,geometries:6,programs:12}}
   ]
  });
  assert.ok(report.includes('WEBGL LIFECYCLE'));
  assert.ok(report.includes('Context: ready / losses 1 / restore events 1 / frame errors 0'));
  assert.ok(report.includes('context-lost'));
  assert.ok(report.includes('frame-recovered'));
  assert.ok(report.includes('Textures: first 15 / latest 17 / peak 18 / change +2'));
  assert.ok(report.includes('not measured GPU memory usage or proof of a leak'));
 });
 test('debug report remains safe with missing history and failure details',()=>{
  const report=format({
   graphics:{status:'lost',losses:1,restores:0,renderFailures:1,
    lossDurationMs:1235,lastError:'test failure\ncontinued',history:[]}
  });
  assert.ok(report.includes('No resource trend samples yet.'));
  assert.ok(report.includes('Context unavailable for 1235ms'));
  assert.ok(report.includes('Last render error: test failure continued'));
  assert.ok(report.includes('Recent graphics events: none'));
 });

 test('Copy Debug reports bfcache resumes without implying GPU resource disposal',()=>{
  const report=format({
   lifecycle:{
    status:'active',suspends:3,resumes:3,disposals:0,
    lastReason:'bfcache',lastError:null,events:[
     {type:'suspend',reason:'visibility'},
     {type:'resume',reason:'visibility'},
     {type:'suspend',reason:'bfcache'},
     {type:'resume',reason:'bfcache'}
    ]
   }
  });
  assert.ok(report.includes('APPLICATION LIFECYCLE'));
  assert.ok(report.includes('Page: active / suspensions 3 / resumes 3 / disposals 0'));
  assert.ok(report.includes('suspend(bfcache)'));
  assert.ok(report.includes('resume(bfcache)'));
  assert.ok(report.includes('preserve WebGL resources'));
 });
 test('lifecycle report tolerates missing activity and sanitizes errors',()=>{
  const report=format({lifecycle:{status:'suspended',suspends:1,resumes:0,
   disposals:0,lastReason:'visibility',lastError:'failure\nnext line',events:[]}});
  assert.ok(report.includes('Last lifecycle error: failure next line'));
  assert.ok(report.includes('Recent page events: none'));
 });

 test('offline debug report distinguishes controlled online and offline clients',()=>{
  const connected=format({offline:{network:'online',supported:true,controlled:true}});
  assert.ok(connected.includes('OFFLINE PACKAGE'));
  assert.ok(connected.includes('Network: online / service worker: supported / controlling page: yes'));
  const fallback=format({offline:{network:'offline',supported:true,controlled:false}});
  assert.ok(fallback.includes('Network: offline / service worker: supported / controlling page: no'));
  assert.ok(fallback.includes('browser cache may be cleared or evicted'));
 });
 test('offline debug section is omitted for older captures',()=>{
  const report=format({version:'091'});
  assert.equal(report.includes('OFFLINE PACKAGE'),false);
 });
});

describe('Frame and upload timing',()=>{
 test('known terminal and button redraw causes remain distinct from unknown',()=>{
  let time=0;
  const p=createPerfMonitor({enabled:true,now:()=>time,intervalMs:10000});
  const start=p.startFrame();
  time+=.5;
  p.recordRedrawReasons(['terminal-log','terminal-event',
   'button-luminance','phosphor-history','resize','context-restored',
   'button-press','button-release','brand-new-typo','terminal-log']);
  p.recordState('paused');
  time+=3;p.endFrame(start);
  const snap=p.currentSnapshot();
  assert.equal(snap.redrawReasons['terminal-log'],1,'duplicate reasons counted once per render');
  for(const reason of ['terminal-event','button-luminance','phosphor-history',
   'resize','context-restored','button-press','button-release'])
   assert.equal(snap.redrawReasons[reason],1);
  assert.equal(snap.redrawReasons.unknown,1,'unrecognized events are still bounded');
  assert.equal(snap.worstFrame.state,'paused');
  assert.deepEqual(snap.worstFrame.reasons.sort(),
   Object.keys(snap.redrawReasons).sort());
 });

 test('source sizes and peak frame attributes follow the measured render',()=>{
  let now=0,exported=null;
  const perf=createPerfMonitor({enabled:true,now:()=>now,intervalMs:2000,
   log:()=>{},onSample:sample=>{exported=sample;}});
  let start=perf.startFrame();now+=.5;
  perf.recordRedrawReasons(['terminal-log']);
  perf.recordDuration('logic',.25);
  perf.recordDuration('controls',1.125);
  perf.recordDuration('sync',.05);
  perf.textureChanged('controls');
  perf.recordUpload('controls',4.8,{width:780,height:200});
  perf.recordState('paused');
  now+=6;perf.endFrame(start);
  let snapshot=perf.currentSnapshot();
  assert.equal(snapshot.controlsUploadRequests,1);
  assert.equal(snapshot.uploadTimes.controls.calls,1);
  assert.equal(snapshot.uploadTimes.controls.sourcePixels,780*200);
  assert.equal(snapshot.uploadTimes.controls.estimatedSourceMB,
   +(780*200*4/1048576).toFixed(2));
  assert.equal(snapshot.worstFrame.preuploadCpuMs,4.8);
  assert.deepEqual(snapshot.worstFrame.uploadLayers,{controls:1});
  assert.equal(snapshot.worstFrame.stageCpuMs.controls,1.125);
  assert.deepEqual(snapshot.worstFrame.reasons,['terminal-log']);
  assert.equal(snapshot.worstFrame.state,'paused');
  now+=2000;
  start=perf.startFrame();
  perf.recordRedrawReasons(['input']);
  perf.recordState('paused');
  now+=2;perf.endFrame(start);
  assert.ok(exported,'completed sample emitted');
  assert.deepEqual(exported.worstFrame.reasons,['terminal-log'],
   'slowest frame attribution survives later quicker frames');
  assert.equal(exported.uploadTimes.controls.estimatedSourceMB,
   snapshot.uploadTimes.controls.estimatedSourceMB);
  assert.equal(perf.currentSnapshot().controlsUploadRequests,0,
   'counters reset after sample');
 });

 test('changed texture uploads include source bounds without uploading unchanged revisions',()=>{
  let time=1,preuploads=0;
  const events=[];
  const texture={version:1,image:{width:790,height:123}};
  const profiler=createTextureUploadProfiler({
   renderer:{initTexture(){preuploads++;}},
   now:()=>time,
   onTiming:(name,elapsed,source)=>events.push({name,elapsed,source})
  });
  assert.equal(profiler.upload(texture,'controls'),true);
  assert.equal(profiler.upload(texture,'controls'),false);
  assert.equal(preuploads,1);
  assert.deepEqual(events[0].source,{width:790,height:123});
  time+=2;texture.version=2;
  assert.equal(profiler.upload(texture,'controls'),true);
  assert.equal(preuploads,2);
  assert.equal(events.length,2);
 });

 test('debug report distinguishes dirty requests, real uploads and the peak frame',()=>{
  const report=formatDebugReport({
   version:'164',createdAt:'2026-11-08T00:00:00Z',
   samples:[{
    seconds:2,frameTicks:10,draws:8,avgRafMs:33,maxRafMs:35,
    controlsUploadRequests:8,
    redrawReasons:{'terminal-log':8},
    frameStates:{paused:10},basePaints:0,controlsPaints:8,
    uploadTimes:{controls:{calls:8,avgCpuMs:4.8,estimatedSourceMB:5.5}},
    worstFrame:{cpuMs:9.1,state:'paused',
     reasons:['terminal-log'],preuploadCpuMs:4.8,
     uploadLayers:{controls:1},stageCpuMs:{controls:1.2}},
    passTimes:{}
   }]
  });
  assert.match(report,/DIRTY B\/D\/S\/C\/T\/P\/M/);
  assert.match(report,/PRE-UPLOAD: controls 4.8ms×8 \/ ~5.5MB src/);
  assert.match(report,/PEAK FRAME: 9.1ms \/ state paused \/ causes terminal-log/);
  assert.match(report,/layers controls:1 \/ stages controls:1.2ms/);
  assert.doesNotMatch(report,/REDRAW CAUSES: unknown:8/);
 });

 test('instrumentation disabled returns no sample and does not alter uploads',()=>{
  const perf=createPerfMonitor({enabled:false});
  perf.recordRedrawReasons(['terminal-log']);
  perf.recordUpload('board',2,{width:400,height:400});
  const start=perf.startFrame();perf.endFrame(start);
  assert.equal(perf.currentSnapshot(),null);
 });
});

describe('Terminal text state',()=>{
 test('prompt and fixed cells accept characters without rewriting the prompt',()=>{
  const term=createTerminalEngine({columns:20});
  assert.equal(term.snapshot().cursor,2);
  term.feed('HELLO');
  assert.equal(term.snapshot().cells.slice(0,7).join(''),'> HELLO');
  assert.equal(term.snapshot().cursor,7);
 });
 test('CR rewinds output; BS overwrites; ANSI CSI K erases rightward',()=>{
  const term=createTerminalEngine({columns:20});
  term.feed('HELLO');
  term.feed('\rY');
  assert.equal(term.snapshot().cells.slice(0,7).join(''),'> YELLO');
  term.feed('\bZ\x1b[K');
  assert.equal(term.snapshot().cells.slice(0,7).join(''),'> Z    ');
 });
 test('CSI sequences can arrive across multiple chunks',()=>{
  const term=createTerminalEngine({columns:20});
  term.feed('HELLO');
  term.feed('\x1b[');
  term.feed('2');
  term.feed('K');
  assert.equal(term.snapshot().cells.join('').trim(),'>');
  assert.equal(term.snapshot().cursor,7,'erase line does not move terminal cursor');
  term.feed('\rNEXT');
  assert.equal(term.snapshot().cells.slice(0,6).join(''),'> NEXT');
 });
 test('LF commits one history line and clears only the active output row',()=>{
  const term=createTerminalEngine({columns:20});
  term.feed('OLD\nNEW');
  const out=term.snapshot();
  assert.equal(out.history,'> OLD');
  assert.equal(out.cells.slice(0,5).join(''),'> NEW');
  assert.equal(out.cursor,5);
 });
 test('responsive cell limit reserves the final block-cursor cell',()=>{
  const term=createTerminalEngine({columns:7});
  term.feed('123456789');
  assert.equal(term.snapshot().cursor,6);
  assert.equal(term.snapshot().cells.slice(0,6).join(''),'> 1234');
  term.setColumns(12);
  term.setHistory('> HISTORY LONG');
  assert.equal(term.snapshot().history,'> HISTORY L');
 });
 test('unsupported C0 controls do not render as printable characters',()=>{
  const term=createTerminalEngine({columns:20});
  term.feed('\x00\x01A\x7fB');
  assert.equal(term.snapshot().cells.slice(0,4).join(''),'> AB');
 });
});

describe('Terminal log painting',()=>{
 const at=new Date(2026,10,8,10,43,0);

 test('dot leaders remain right-aligned on small and large screens',()=>{
  const event={at,full:'GAME: SESSION STARTED',short:'GM: START'};
  for(const width of [17,20,24,28,32,38]){
   const line=composeTerminalMessage(event,width);
   assert.equal(line.length,width-3);
   assert.match(line,/\.{2,}/);
   assert.match(line,/START(?:ED)?$/);
  }
 });
 test('37 characters per second controls terminal typing cadence',()=>{
  const log=createTerminalLog({clock:()=>at});
  log.setColumns(30);
  log.advance(0);
  assert.equal(log.snapshot().cursor,2);
  log.advance(10);
  assert.equal(log.snapshot().cursor,3);
  assert.equal(log.advance(37),false);
  assert.equal(log.snapshot().cursor,3);
  assert.equal(log.advance(38),true);
  assert.equal(log.snapshot().cursor,4);
 });
 test('snap-off 250ms, snap-down 250ms, then new top-row typing',()=>{
  const log=createTerminalLog({clock:()=>at,typeMs:10,holdMs:0});
  log.setColumns(30);log.advance(0);
  for(let t=10;t<=290;t+=10)log.advance(t);
  assert.match(log.snapshot().cells.join(''),/READY/);
  log.enqueue('GAME: PAUSED','GM: PAUSED');
  assert.equal(log.advance(300),true);
  assert.equal(log.snapshot().phase,'snap-off');
  assert.equal(log.snapshot().activeVisible,false);
  assert.equal(log.snapshot().history,'');
  assert.equal(log.advance(549),false);
  assert.equal(log.advance(550),true);
  assert.equal(log.snapshot().phase,'pretype');
  assert.match(log.snapshot().history,/READY$/);
  assert.equal(log.snapshot().cursor,2);
  assert.equal(log.advance(799),false);
  assert.equal(log.snapshot().cursor,2);
  assert.equal(log.advance(800),true);
  for(let t=810;t<=1150;t+=10)log.advance(t);
  assert.match(log.snapshot().cells.join(''),/PAUSED/);
  assert.match(log.snapshot().history,/READY/);
 });
 test('reflow preserves both rows after screen size change',()=>{
  const log=createTerminalLog({clock:()=>at,typeMs:10,holdMs:0});
  log.advance(0);log.setColumns(23);
  for(let t=10;t<=250;t+=10)log.advance(t);
  assert.match(log.snapshot().cells.join('').trimEnd(),/READY$/);
  log.enqueue('GAME: PAUSED','GM: PAUSED');
  for(let t=260;t<=850;t+=10)log.advance(t);
  log.setColumns(34);
  assert.match(log.snapshot().history,/READY$/);
  assert.equal(log.snapshot().columns,34);
 });
 test('static prompts, top cursor and bottom-only gradient in the existing crop',()=>{
  const log=createTerminalLog({clock:()=>at});
  const drawn=[],gradients=[];
  const ctx={
   save(){},restore(){},beginPath(){},rect(){},clip(){},
   measureText(ch){return {width:ch==='M'||ch==='W'?10:ch===' '?4:8,
    actualBoundingBoxAscent:12,actualBoundingBoxDescent:0}},
   fillText(ch,x,y){drawn.push({type:'glyph',ch,x,y});},
   fillRect(x,y,w,h){drawn.push({type:'rect',x,y,w,h});},
   createLinearGradient(){const grad={stops:[],addColorStop(at,color){this.stops.push([at,color]);}};
    gradients.push(grad);return grad;}
  };
  const r={dx:11,dw:371,dy:660,dh:110,footerY:800};
  drawTerminalLog(ctx,log,r,0);
  assert.match(ctx.font,/700 10px "Roboto Condensed"/);
  const prompts=drawn.filter(x=>x.type==='glyph'&&x.ch==='>');
  assert.equal(prompts.length,2);
  assert.equal(prompts[0].x,prompts[1].x);
  assert.ok(prompts[0].y<prompts[1].y);
  const cursor=drawn.find(x=>x.type==='rect'&&x.w===11);
  assert.ok(cursor);
  assert.equal(cursor.h,16);
  assert.equal(cursor.y+cursor.h/2,terminalLineBounds(r).y+16);
  assert.equal(terminalLineBounds(r).h,37,'only the terminal drawing area grows');
  assert.equal(gradients.length,1);
  assert.equal(gradients[0].stops[0][1],'rgba(8,8,8,0)');
  assert.equal(gradients[0].stops.at(-1)[1],'#080808');
  assert.ok(terminalLineBounds(r).y>=r.dy+r.dh);
 });
});

describe('Terminal repaint regions',()=>{
 // layout.js preserves its existing browser/CommonJS global API
 const {computeLayout}=Layout;

 const UI={unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
  padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
  headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,deckPad:6,
  scoreHeight:45,deckGap:6,padGap:6,padHeight:53,extrasHeight:44,
  extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92};
 const source=path=>fs.readFileSync(new URL('../tetris/'+path,import.meta.url),'utf8');

 test('controls crop excludes the terminal without changing its original cell rectangle',()=>{
  for(const [w,h,insets] of [
   [393,852,{top:59,bottom:34}],
   [320,568,{top:18,bottom:0}],
   [852,393,{top:0,bottom:20}]
  ]){
   const r=computeLayout(w,h,insets,UI);
   const c=controlsBounds(r,w,h,2);
   const terminal=terminalLineBounds(r);
   const t=croppedBounds([terminal],w,h,2,0);
   assert.equal(terminal.x,r.dx+5);
   assert.equal(terminal.y,r.dy+r.dh+1);
   assert.equal(terminal.w,Math.max(1,r.dw-10));
   assert.equal(terminal.h,37);
   assert.ok(c.y+c.h<=r.dy+r.dh+2.50001,'2px crop pad plus DPR2 snapping');
   assert.deepEqual(c,croppedBounds([{x:r.dx,y:r.dy,w:r.dw,h:r.dh}],w,h,2),
    'the controls crop is exactly the original button deck plus pixel snapping');
   assert.ok(t.w<=r.dw+2.00001);
   assert.ok(t.y>=r.dy+r.dh+.49999,'terminal gap allows at most a DPR2 pixel of snapping');
   assert.ok(t.h<=39.00001);
   assert.ok(t.y>=0&&t.y+t.h<=h+0.001);
  }
 });

 test('cropped terminal texture is painted in original CSS pixel positions at DPR2',()=>{
  const W=393,H=852,dpr=2;
  const r=computeLayout(W,H,{top:59,bottom:34},UI);
  const bounds=croppedBounds([terminalLineBounds(r)],W,H,dpr,0);
  const canvas={width:1,height:1},calls=[];
  const context={setTransform(...a){calls.push(['transform',...a])}};
  const plane={scale:{set(...a){calls.push(['scale',...a])}},
   position:{z:.013,set(...a){calls.push(['position',...a])}}};
  const texture={needsUpdate:false};
  const result=drawCroppedCanvas({canvas,context,plane,texture,bounds,
   dpr,width:W,height:H,draw:region=>calls.push(['draw',region])});
  assert.equal(result.width,Math.round(bounds.w*dpr));
  assert.equal(result.height,Math.round(bounds.h*dpr));
  assert.equal(result.pixels,canvas.width*canvas.height);
  assert.deepEqual(calls.find(x=>x[0]==='transform'),
   ['transform',2,0,0,2,-bounds.x*2,-bounds.y*2]);
  assert.equal(texture.needsUpdate,true);
  assert.equal(plane.position.z,.013,'terminal preserves layering depth');
 });

 test('terminal-only type and cursor events do not request controls, base or modal',()=>{
  const dirty=createRenderInvalidation([]);
  // Consume startup marker.
  dirty.beginRender();
  for(let i=0;i<40;i++){
   dirty.mark('terminal');dirty.reason('terminal-log');
   assert.equal(dirty.needs('terminal'),true);
   for(const k of ['base','board','sidebar','controls','modal'])
    assert.equal(dirty.needs(k),false,'terminal must not repaint '+k);
   assert.deepEqual(dirty.beginRender(),['terminal-log']);
   assert.equal(dirty.consume('terminal'),true);
   assert.equal(dirty.needsRender(),false);
  }
 });

 test('standalone terminal plane uses the original text painter and CRT compositor',()=>{
  const renderer=source('platform.js');
  const merged=source('render.js');
  const cropped=merged.slice(0,merged.indexOf('// Textures, sprite art'));
  assert.match(source('render.js'),/terminalCanvas\.getContext\('2d',\{alpha:false\}\)/);
  assert.match(source('render.js'),/const terminalPlane=makeUILayer\(terminalTexture,\.8,\.013\)/);
  assert.match(renderer,/croppedBounds\(\[terminalLineBounds\(r\)\],W,H,DPR,0\)/);
  assert.match(renderer,/drawTerminalLog\(g,terminalLog,r,performance\.now\(\),C\.ink,C\.bg,FONT\)/);
  assert.match(renderer,/if\(terminalPlane\.visible\)textureUploads\.upload\(terminalTexture,'terminal'\)/);
  assert.match(renderer,/layers\.mark\('terminal'\);layers\.reason\('terminal-log'\)/);
  assert.match(renderer,/if\(layers\.consume\('terminal'\)&&!screenManager\.isOptions\)/);
  assert.match(renderer,/terminalPlane\.visible=!standaloneSettings/);
  assert.match(renderer,/if\(previous==='options'&&next!=='options'\)layers\.mark\('base','controls','terminal'\)/);
  assert.doesNotMatch(cropped,/\{x:r\.dx\+5,y:r\.dy\+r\.dh\+1/);
  const controls=renderer.slice(renderer.indexOf('function paintControlsLayer(){'),
   renderer.indexOf('function paintTerminalLayer(){'));
  assert.doesNotMatch(controls,/drawTerminalLog/);
  assert.match(controls,/drawControls/);
  assert.match(source('render.js'),/terminalTexture,modalTexture,boardPopupTexture/);
  assert.match(source('render.js'),/terminalCanvas,modalCanvas,boardPopupCanvas/);
 });

 test('terminal source instrumentation is independent and appears in debug report',()=>{
  let time=0;
  const perf=createPerfMonitor({enabled:true,now:()=>time,intervalMs:10000});
  const start=perf.startFrame();
  time+=.25;
  perf.recordDuration('terminal',.35);
  perf.textureChanged('terminal');
  perf.recordUpload('terminal',.8,{width:660,height:78});
  perf.recordState('playing');
  time+=.5;perf.endFrame(start);
  const snap=perf.currentSnapshot();
  assert.equal(snap.controlsPaints,0);
  assert.equal(snap.controlsUploadRequests,0);
  assert.equal(snap.terminalPaints,1);
  assert.equal(snap.terminalUploadRequests,1);
  assert.equal(snap.avgTerminalPaintMs,.35);
  assert.equal(snap.uploadTimes.terminal.calls,1);
  assert.equal(snap.uploadTimes.terminal.sourcePixels,660*78);
  const report=formatDebugReport({version:'168',samples:[snap]});
  assert.match(report,/DIRTY B\/D\/S\/C\/T\/P\/M/);
  assert.match(report,/Canvas terminal 0.35ms \(1 paints\)/);
  assert.match(report,/PRE-UPLOAD: terminal 0.8ms×1/);
 });

 test('web font loading, GPU recovery and resize refresh the terminal crop',()=>{
  const renderer=source('platform.js');
  assert.match(renderer,/layers\.mark\('base','board','sidebar','controls','terminal'\);\s*invalidate\('font-ready'\)/);
  assert.match(renderer,/layers\.mark\('base','board','sidebar','controls','terminal'\);\s*invalidate\('context-restored'\)/);
  assert.match(renderer,/layers\.mark\('base','board','sidebar','controls','terminal'\);\s*invalidate\('resize'\)/);
  assert.match(renderer,/for\(const source of visualScene\.textures\)source\.needsUpdate=true/);
   assert.match(source('render.js'),/const textures=Object\.freeze\(\[texture,boardTexture,sidebarTexture,controlsTexture/);
 });
});

describe('Performance observability',()=>{
 test('CPU percentile captures stutters hidden by average',()=>{
  let clock=0;
  const monitor=createPerfMonitor({enabled:true,now:()=>clock,intervalMs:100000,log:()=>{}});
  for(let i=0;i<100;i++){const start=monitor.startFrame();clock+=i===99?80:1;monitor.endFrame(start);}
  const result=monitor.currentSnapshot();
  assert.equal(result.frameTicks,100);
  assert.equal(result.p50FrameCpuMs,1);
  assert.equal(result.p95FrameCpuMs,1);
  assert.equal(result.p99FrameCpuMs,1);
  assert.equal(result.maxFrameCpuMs,80);
 });
 test('frame sample history is bounded and resets each interval',()=>{
  let clock=0,emitted;
  const monitor=createPerfMonitor({enabled:true,now:()=>clock,intervalMs:2000,
   log:()=>{},onSample:value=>emitted=value});
  for(let i=0;i<700;i++){const start=monitor.startFrame();clock++;monitor.endFrame(start);}
  assert.equal(monitor.currentSnapshot().frameCpuPercentileSamples,512);
  clock=2100;
  const start=monitor.startFrame();clock+=2;monitor.endFrame(start);
  assert.equal(emitted.frameCpuPercentileSamples,512);
  assert.equal(monitor.currentSnapshot().frameCpuPercentileSamples,0);
  assert.equal(monitor.currentSnapshot().p95FrameCpuMs,null);
 });
 test('canvas census counts unique backing pixel dimensions',()=>{
  const a={width:800,height:400},b={width:200,height:100};
  const estimate=estimateCanvasSourceBytes([a,b,a,null,{width:NaN,height:5}]);
  assert.equal(estimate.count,2);
  assert.equal(estimate.pixels,340000);
  assert.equal(estimate.rgba8Bytes,1360000);
  assert.equal(estimate.surfaces[0].name,'base');
  assert.ok(Object.isFrozen(estimate.surfaces));
 });
 test('Copy Debug differentiates pixel estimate from measured VRAM',()=>{
  const report=format({canvasMemory:estimateCanvasSourceBytes([{width:400,height:900}]),
   samples:[{seconds:2,frameTicks:12,draws:2,p50FrameCpuMs:1,p95FrameCpuMs:5,p99FrameCpuMs:8}]});
  assert.match(report,/CPU p50\/p95\/p99 1ms\/5ms\/8ms/);
  assert.match(report,/CANVAS SOURCE PIXELS/);
  assert.match(report,/not observed RAM or GPU VRAM/);
  assert.match(report,/excludes WebGL render targets/);
 });
});
