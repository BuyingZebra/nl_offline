/* Run: node --test tetris/performance-v054.test.cjs
 * Debug instrumentation is opt-in and never changes the compositor image.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'perf-monitor.js'),'utf8')
 .replace(/export function /g,'function ');
const {createPerfMonitor,createPerfHud}=new Function(source+
 '\nreturn {createPerfMonitor,createPerfHud};')();
const main=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
const comp=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');

test('RAF pacing measures consecutive active frames, not CPU work',()=>{
 let t=0,values=[];
 const perf=createPerfMonitor({enabled:true,now:()=>t,intervalMs:100,
  log:s=>values.push(s)});
 perf.recordRaf(0);
 perf.recordRaf(16);
 perf.recordRaf(32);
 perf.recordRaf(72);
 perf.recordRaf(88);
 const f=perf.startFrame();t=105;perf.endFrame(f);
 assert.equal(values.length,1);
 assert.equal(values[0].rafSamples,4);
 assert.equal(values[0].avgRafMs,22);
 assert.equal(values[0].maxRafMs,40);
 assert.equal(values[0].slowRafTicks,1);
});
test('idle and background gaps are excluded from RAF diagnostics',()=>{
 let t=0,values=[];
 const perf=createPerfMonitor({enabled:true,now:()=>t,intervalMs:100,
  log:s=>values.push(s)});
 perf.recordRaf(100);
 perf.recordRaf(4000);
 perf.recordRaf(4016);
 perf.resetPacing();
 perf.recordRaf(9000);
 perf.recordRaf(9016);
 const f=perf.startFrame();t=110;perf.endFrame(f);
 assert.equal(values[0].rafSamples,2);
 assert.equal(values[0].maxRafMs,16);
 assert.equal(values[0].slowRafTicks,0);
});
test('resource stats are snapshots and diagnostic exceptions cannot break gameplay',()=>{
 let t=0,sample=null;
 const perf=createPerfMonitor({enabled:true,now:()=>t,intervalMs:1,
  log:()=>{throw Error('console blocked');},
  onSample:v=>{sample=v;throw Error('HUD detached');}});
 const gpu={textures:8,geometries:3,activePasses:7,totalPasses:10};
 perf.setGPUStats(gpu);
 perf.setViewport(393,852,3);
 gpu.textures=1000;
 const f=perf.startFrame();t=5;
 perf.endFrame(f);
 assert.equal(sample.gpu.textures,8);
 assert.equal(sample.gpu.activePasses,7);
 assert.equal(sample.viewport.width,393);
 assert.equal(sample.viewport.height,852);
 assert.equal(sample.viewport.dpr,3);
});
test('disabled monitoring never stores GPU/viewport data or creates HUD',()=>{
 let createCount=0;
 const fakeDocument={createElement(){createCount++;return {};}};
 const hud=createPerfHud({enabled:false,document:fakeDocument,container:{}});
 const perf=createPerfMonitor({enabled:false});
 perf.setViewport(390,844,3);
 perf.setGPUStats({textures:4});
 perf.recordRaf(10);
 perf.recordRaf(30);
 hud.update({});hud.dispose();
 assert.equal(createCount,0);
 assert.equal(perf.snapshot(),null);
});
test('debug HUD is non-interactive and removes itself cleanly',()=>{
 const nodes=[],container={appendChild(node){nodes.push(node);}};
 const doc={createElement(){return {
  style:{cssText:''},textContent:'',setAttribute(){},
  remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1);}
 };}};
 const hud=createPerfHud({enabled:true,document:doc,container});
 assert.equal(nodes.length,1);
 assert.ok(nodes[0].style.cssText.includes('pointer-events:none'));
 hud.update({viewport:{width:393,height:852,dpr:3},avgRafMs:16.67,
  slowRafTicks:0,avgFrameCpuMs:2.3,maxFrameCpuMs:9.1,
  avgRenderSubmitMs:1.2,draws:20,baseUploadRequests:2,
  popupUploadRequests:1,modalUploadRequests:0,
  gpu:{activePasses:7,totalPasses:10,textures:12}});
 assert.ok(nodes[0].textContent.includes('PERF V054'));
 assert.ok(nodes[0].textContent.includes('393×852 @3x'));
 assert.ok(nodes[0].textContent.includes('7 / 10 passes'));
 hud.dispose();assert.equal(nodes.length,0);
});
test('diagnostics are attached only in perf mode and never change shader order',()=>{
 assert.ok(main.includes("get('perf')==='1'"));
 assert.ok(main.includes('createPerfHud({enabled:perfEnabled,document,container:display})'));
 assert.ok(main.includes('perf.recordRaf(now)'));
 assert.ok(main.includes('perf.resetPacing()'));
 assert.ok(main.includes('perf.setGPUStats('));
 assert.ok(main.includes('perf.setViewport(W,H,DPR)'));
 assert.ok(comp.includes('function passStats()'));
 assert.ok(comp.includes('composer.passes'));
 assert.ok(comp.includes('const popupBlur=boardBlurParams()'));
 assert.ok(comp.includes('const popupPasses=[boardBlurHorizontal,boardPopupPass]'));
});
test('stable link and V054 remain exposed to users',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 assert.ok(html.includes('Tetris System V054'));
 assert.ok(main.includes("const THREE_BUILD_VERSION='054'"));
 assert.ok(main.includes("from './perf-monitor.js?v054'"));
});
