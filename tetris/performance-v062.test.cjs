/* V062: cached background, independently updating opaque sidebar and controls.
 * Run: node --test tetris/*.test.cjs
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const main=read('three-v027.js');
const ui=new Function(read('cropped-ui-layers.js').replace(/export function /g,'function ')+
 '\nreturn {croppedBounds,sidebarBounds,controlsBounds,drawCroppedCanvas};')();
const createMonitor=new Function(read('perf-monitor.js').replace(/export function /g,'function ')+
 '\nreturn createPerfMonitor;')();
const report=new Function(read('debug-report.js').replace(/export function /g,'function ')+
 '\nreturn formatDebugReport;')();

test('sidebar and control bounds are independent, clipped and device-pixel aligned',()=>{
 const l={dx:9,dy:618,dw:375,dh:172,
  holdPanel:{x:270,y:145,w:93,h:85},
  nextPanel:{x:270,y:236,w:93,h:250},
  statsPanel:{x:270,y:492,w:93,h:122}};
 const a=ui.sidebarBounds(l,393,852,2),b=ui.controlsBounds(l,393,852,2);
 assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=393&&a.y+a.h<=852);
 assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=393&&b.y+b.h<=852);
 assert.ok(a.y+a.h<=b.y || a.x+a.w<=b.x || b.x+b.w<=a.x);
 assert.equal(a.x*2,Math.round(a.x*2));
 assert.equal(b.y*2,Math.round(b.y*2));
 assert.ok(a.w*a.h<393*852*.5);
 assert.ok(b.w*b.h<393*852*.5);
});
test('cropped renderer keeps original CSS geometry and needsUpdate exactly once',()=>{
 const canvas={width:0,height:0};const calls=[];
 const context={setTransform(...args){calls.push(args);}};
 const plane={scale:{set(...args){calls.push(['scale',...args]);}},
  position:{z:.011,set(...args){calls.push(['position',...args]);}}};
 const texture={needsUpdate:false};
 const bounds={x:268,y:143,w:97.5,h:473};
 const result=ui.drawCroppedCanvas({canvas,context,plane,texture,bounds,
  dpr:2,width:393,height:852,draw:()=>calls.push('draw')});
 assert.equal(canvas.width,195);
 assert.equal(canvas.height,946);
 assert.equal(result.pixels,195*946);
 assert.deepEqual(calls[0],[2,0,0,2,-536,-286]);
 assert.ok(calls.includes('draw'));
 assert.ok(Math.abs(plane.position.z-.011)<1e-9);
 assert.equal(texture.needsUpdate,true);
});
test('original sidebar and controls painting is reused in full base and cropped layers',()=>{
 assert.ok(read('hud-drawing.js').includes('function drawSidebar(r){'));
 assert.ok(read('hud-drawing.js').includes('function drawControls(r){'));
 assert.ok(main.includes(' drawSidebar(r);\n drawControls(r);'));
 assert.ok(main.includes('function paintSidebarLayer(){'));
 assert.ok(main.includes('function paintControlsLayer(){'));
 assert.ok(main.includes("perf.textureChanged(kind)"));
 assert.ok(main.includes('const priorContext=g,priorRegions=regions;'));
 assert.ok(main.includes('g=context;regions=[];'));
 assert.ok(main.includes('g=priorContext;regions=priorRegions;'));
});
test('touch feedback invalidates cropped controls but keeps header clicks on background',()=>{
 const input=read('input-controller.js');
 assert.ok(input.includes('setBaseDirty(r.act);'));
 assert.ok(input.includes('setBaseDirty(touch.action);'));
 assert.ok(input.includes("setBaseDirty('board');"));
 assert.ok(main.includes("if(act==='theme'||act==='options')layers.mark('base');"));
 assert.ok(main.includes("else if(act==='board')layers.mark('board');"));
 assert.ok(main.includes("else if(act)layers.mark('controls');"));
});
test('piece gravity never flags fullscreen base unless popup state changes',()=>{
 const start=main.indexOf('if(visualChanged){');
 const end=main.indexOf('perf.recordGameChanges',start);
 const frame=main.slice(start,end);
 assert.ok(frame.includes("layers.mark('board');"));
 assert.ok(frame.includes("layers.mark('controls');"));
 assert.ok(frame.includes("layers.mark('sidebar');"));
 assert.ok(frame.includes("if(game.status!==prior.status)layers.mark('base');"));
 assert.ok(!frame.includes("game.current!==prior.piece)layers.mark('base')"));
});
test('pause and ready screens keep popup hitboxes and visible layers',()=>{
 assert.ok(main.includes("if(game.status!==lastPaintedBoardPopupStatus)layers.mark('base');"));
 assert.ok(main.includes('paintBoardPopup(r);'));
 assert.ok(main.includes('baseRegions=regions;'));
 assert.ok(main.includes('sidebarPlane.visible=!standaloneSettings;controlsPlane.visible=!standaloneSettings;'));
 assert.ok(main.includes('surface.visible=true;boardPlane.visible=true;sidebarPlane.visible=true;controlsPlane.visible=true;'));
 assert.ok(main.includes('scrimPlane.renderOrder=1;'));
 assert.ok(main.includes('modalPlane.renderOrder=2;'));
 assert.ok(main.includes('sidebarPlane=makeUILayer(sidebarTexture,.6,.011)'));
 assert.ok(main.includes('controlsPlane=makeUILayer(controlsTexture,.7,.012)'));
});
test('monitor reports all four source texture uploads and canvas stage averages',()=>{
 let t=0,sample=null;
 const monitor=createMonitor({enabled:true,now:()=>t,intervalMs:10,log:x=>sample=x});
 for(const [name,time] of [['base',20],['board',6],['sidebar',4],['controls',8]]){
  monitor.textureChanged(name);
  monitor.recordUpload(name,time);
  monitor.recordDuration(name,1);
 }
 const started=monitor.startFrame();t=11;monitor.endFrame(started);
 assert.equal(sample.baseUploadRequests,1);
 assert.equal(sample.boardUploadRequests,1);
 assert.equal(sample.sidebarUploadRequests,1);
 assert.equal(sample.controlsUploadRequests,1);
 assert.equal(sample.sidebarPaints,1);
 assert.equal(sample.controlsPaints,1);
 assert.equal(sample.uploadTimes.controls.avgCpuMs,8);
});
test('debug report has explicit per-layer upload and paint measurements',()=>{
 const output=report({version:'062',samples:[{seconds:2,frameTicks:100,draws:5,
  basePaints:0,boardPaints:5,sidebarPaints:1,controlsPaints:4,
  avgSidebarPaintMs:.2,avgControlsPaintMs:.3,
  baseUploadRequests:0,boardUploadRequests:5,sidebarUploadRequests:1,
  controlsUploadRequests:4,popupUploadRequests:0,modalUploadRequests:0,
  uploadTimes:{board:{calls:5,avgCpuMs:6},controls:{calls:4,avgCpuMs:4}}}]});
 assert.ok(output.includes('uploads B/D/S/C/P/M 0/5/1/4/0/0'));
 assert.ok(output.includes('Canvas sidebar 0.2ms (1 paints)'));
 assert.ok(output.includes('Canvas controls 0.3ms (4 paints)'));
 assert.ok(output.includes('PRE-UPLOAD: board 6ms×5 | controls 4ms×4'));
});
test('V062 retains DPR, original compositor, popup, debug action and stable URL',()=>{
 assert.ok(main.includes('const MAX_RENDER_DPR=2;'));
 assert.ok(main.includes("const THREE_BUILD_VERSION='064'"));
 assert.ok(main.includes("from './cropped-ui-layers.js?v062'"));
 assert.ok(main.includes("from './input-controller.js?v062'"));
 assert.ok(fs.readFileSync(path.join(__dirname,'modal-ui.js'),'utf8').includes("key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug')"));
 assert.ok(main.includes("textureUploads.upload(controlsTexture,'controls')"));
 assert.ok(main.includes("textureUploads.upload(sidebarTexture,'sidebar')"));
 assert.ok(read('compositor.js').includes('composer.addPass(new OutputPass())'));
 assert.ok(read('three-v027.html').includes('Tetris System V064'));
});
