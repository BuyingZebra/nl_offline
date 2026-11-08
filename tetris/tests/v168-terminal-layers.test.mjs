/* NOMAD V168 — independent terminal texture and CRT composition.
 * Run with: node --test tetris/tests/v168-terminal-layers.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRenderInvalidation} from '../render-invalidation.js';
import {croppedBounds,controlsBounds,drawCroppedCanvas} from '../cropped-ui-layers.js';
import {terminalLineBounds} from '../terminal-log.js';
import {createPerfMonitor} from '../perf-monitor.js';
import {formatDebugReport} from '../debug-report.js';
import '../layout.js'; // layout.js preserves its existing browser/CommonJS global API
const {computeLayout}=globalThis.FieldAtlasTetrisLayout;

const UI={unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
 padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
 headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,deckPad:6,
 scoreHeight:45,deckGap:6,padGap:6,padHeight:53,extrasHeight:44,
 extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92};
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

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
  assert.ok(c.y+c.h<=r.dy+r.dh+2.00001);
  assert.deepEqual(c,croppedBounds([{x:r.dx,y:r.dy,w:r.dw,h:r.dh}],w,h,2),
   'the controls crop is exactly the original button deck plus pixel snapping');
  assert.ok(t.w<=r.dw+2.00001);
  assert.ok(t.y>=r.dy+r.dh+.99999,'terminal cannot cover controls bottom edge');
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
 const renderer=source('three-v027.js');
 const cropped=source('cropped-ui-layers.js');
 assert.match(renderer,/terminalCanvas\.getContext\('2d',\{alpha:false\}\)/);
 assert.match(renderer,/const terminalPlane=makeUILayer\(terminalTexture,\.8,\.013\)/);
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
 assert.match(renderer,/terminalTexture,modalTexture,boardPopupTexture/);
 assert.match(renderer,/terminalCanvas,modalCanvas,boardPopupCanvas/);
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
 const renderer=source('three-v027.js');
 assert.match(renderer,/layers\.mark\('base','board','sidebar','controls','terminal'\);\s*invalidate\('font-ready'\)/);
 assert.match(renderer,/layers\.mark\('base','board','sidebar','controls','terminal'\);\s*invalidate\('context-restored'\)/);
 assert.match(renderer,/layers\.mark\('base','board','sidebar','controls','terminal'\);\s*invalidate\('resize'\)/);
 assert.match(renderer,/for\(const source of \[texture,boardTexture,sidebarTexture,controlsTexture,\s*terminalTexture,modalTexture,boardPopupTexture\]\)/);
});
