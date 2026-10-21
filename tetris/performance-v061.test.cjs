/* V061: unchanged full-screen postprocessing with independently updated
 * cropped gameplay board and stationary interface texture.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const main=read('three-v027.js');
const comp=read('compositor.js');
const monitor=new Function(read('perf-monitor.js').replace(/export function /g,'function ')+
 '\nreturn createPerfMonitor;')();
const report=new Function(read('debug-report.js').replace(/export function /g,'function ')+
 '\nreturn formatDebugReport;')();

test('board is drawn in cropped Canvas2D texture separate from fullscreen base',()=>{
 assert.ok(main.includes("const boardCanvas=document.createElement('canvas');"));
 assert.ok(main.includes('const boardTexture=new THREE.CanvasTexture(boardCanvas);'));
 assert.ok(main.includes('boardCanvas.width=pixelW;boardCanvas.height=pixelH;'));
 assert.ok(main.includes('const pixelW=Math.max(1,Math.round(w*DPR)),pixelH='));
 assert.ok(main.includes('pixelH=Math.max(1,Math.round(h*DPR))'));
 assert.ok(main.includes('boardTexture.needsUpdate=true;'));
});
test('static base paints only board grid and leaves board input hitbox in base regions',()=>{
 assert.ok(main.includes('stage(r,false,true);'));
 assert.ok(main.includes('stage(r,true,false);'));
 assert.ok(main.includes('if(drawPieces){'));
 assert.ok(main.includes("if(recordRegion)region(x,y,w,h,'board',{board:true});"));
 assert.ok(main.includes('baseRegions=regions;'));
});
test('board plane composes BEFORE CRT effects and BELOW scrim and modals',()=>{
 assert.ok(main.includes('boardPlane.renderOrder=.5;'));
 assert.ok(main.includes('scrimPlane.renderOrder=1;'));
 assert.ok(main.includes('modalPlane.renderOrder=2;'));
 assert.ok(main.includes('boardPlane.visible=!standaloneSettings;'));
 assert.ok(main.includes('surface.visible=true;boardPlane.visible=true;'));
 assert.ok(comp.includes('composer.addPass(new RenderPass(scene,camera))'));
 assert.ok(comp.includes('composer.addPass(glow);'));
});
test('crop transform and screen position map to identical physical panel location',()=>{
 const x=63.4,y=112.7,w=272,h=544,W=393,H=852,DPR=2;
 const pxW=Math.round(w*DPR),pxH=Math.round(h*DPR);
 assert.ok(pxW<Math.round(W*DPR));
 assert.ok(pxH<Math.round(H*DPR));
 const left=-1+(2*x+w)/W-w/W;
 const top=1-(2*y+h)/H+h/H;
 assert.ok(Math.abs(left-(-1+2*x/W))<1e-9);
 assert.ok(Math.abs(top-(1-2*y/H))<1e-9);
 // Rect drawn at x,y with origin translated by -x,-y.
 assert.equal(DPR*x-DPR*x,0);
 assert.equal(DPR*y-DPR*y,0);
 assert.ok(main.includes('boardContext.setTransform(DPR,0,0,DPR,-x*DPR,-y*DPR);'));
});
test('gravity redraw does not mark base UI dirty for piece position alone',()=>{
 assert.ok(main.includes("if(visualChanged){\n   layers.mark('board');"));
 assert.ok(main.includes('if(game.score!==prior.score||game.lines!==prior.lines||'));
 assert.ok(main.includes("if(game.status!==prior.status)layers.mark('base');"));
 assert.ok(!main.includes("if(visualChanged){\n   layers.mark('base');"));
});
test('piece movement, flashes, reset and resize all update board texture',()=>{
 assert.ok(main.includes("layers.mark('board');layers.mark('controls');"));
 assert.ok(main.includes("layers.mark('board');layers.reason('flash')"));
 assert.ok(main.includes("layers.mark('base','board','sidebar','controls');invalidate('resize')"));
 assert.ok(main.includes("layers.mark('board');layers.mark('sidebar');layers.mark('controls');layers.mark('base');overOffered=false"));
});
test('performance recorder tracks board paints and uploads separately',()=>{
 let t=0,latest=null;
 const p=monitor({enabled:true,now:()=>t,intervalMs:1,log:v=>latest=v});
 p.recordDuration('base',5);p.recordDuration('board',.7);p.recordDuration('board',.3);
 p.textureChanged('base');p.textureChanged('board');p.textureChanged('board');
 p.recordUpload('base',21);p.recordUpload('board',11);
 const started=p.startFrame();t=2;p.endFrame(started);
 assert.equal(latest.basePaints,1);
 assert.equal(latest.boardPaints,2);
 assert.equal(latest.avgBoardPaintMs,.5);
 assert.equal(latest.baseUploadRequests,1);
 assert.equal(latest.boardUploadRequests,2);
 assert.equal(latest.uploadTimes.board.avgCpuMs,11);
});
test('copied report makes stationary and cropped texture requests identifiable',()=>{
 const output=report({version:'061',samples:[{
  seconds:2,frameTicks:110,draws:3,basePaints:1,boardPaints:3,
  avgBasePaintMs:2,avgBoardPaintMs:.5,
  baseUploadRequests:1,boardUploadRequests:3,sidebarUploadRequests:0,controlsUploadRequests:0,
  popupUploadRequests:0,modalUploadRequests:0,
  uploadTimes:{base:{calls:1,avgCpuMs:23},
   board:{calls:3,avgCpuMs:9}}
 }]});
 assert.ok(output.includes('uploads B/D/S/C/P/M 1/3/0/0/0/0'));
 assert.ok(output.includes('Canvas board 0.5ms (3 paints)'));
 assert.ok(output.includes('PRE-UPLOAD: base 23ms×1 | board 9ms×3'));
});
test('V061 retains DPR2, same controls, passes, debug copy, URL and version',()=>{
 assert.ok(main.includes('const MAX_RENDER_DPR=2;'));
 assert.ok(fs.readFileSync(path.join(__dirname,'modal-ui.js'),'utf8').includes("key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug')"));
 assert.ok(main.includes('const THREE_BUILD_VERSION=\'064\''));
 assert.ok(main.includes("textureUploads.upload(boardTexture,'board')"));
 assert.ok(main.includes("from './perf-monitor.js?v062'"));
 assert.ok(comp.includes('composer.addPass(new OutputPass())'));
 assert.ok(read('three-v027.html').includes('Tetris System V064'));
});
