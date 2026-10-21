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
const createPerfMonitor=new Function(source+
 '\nreturn createPerfMonitor;')();
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
test('disabled monitoring does not record frame or resource data',()=>{
 const perf=createPerfMonitor({enabled:false});
 perf.setViewport(390,844,3);
 perf.setGPUStats({textures:4});
 perf.recordRaf(10);
 perf.recordRaf(30);
 assert.equal(perf.snapshot(),null);
 assert.equal(perf.currentSnapshot(),null);
});
test('in-progress performance reports can be captured without a DOM overlay',()=>{
 let clock=0;
 const perf=createPerfMonitor({enabled:true,now:()=>clock,intervalMs:2000,log:()=>{}});
 perf.recordRaf(0);perf.recordRaf(16);
 const start=perf.startFrame();clock=17;perf.endFrame(start);
 const snap=perf.currentSnapshot();
 assert.equal(snap.frameTicks,1);
 assert.equal(snap.rafSamples,1);
 assert.equal(snap.avgRafMs,16);
 assert.equal(perf.snapshot(),null);
});
test('diagnostics collect silently for an on-demand copy without changing shaders',()=>{
 assert.ok(main.includes('const recentPerf=[];'));
 assert.ok(main.includes('const debugClipboard=createDebugClipboard({navigator,document})'));
 assert.ok(!main.includes('createPerfHud({enabled:perfEnabled,document,container:display})'));
 assert.ok(main.includes('perf.recordRaf(now)'));
 assert.ok(main.includes('perf.resetPacing()'));
 assert.ok(main.includes('perf.setGPUStats('));
 assert.ok(main.includes('perf.setViewport(W,H,DPR)'));
 assert.ok(comp.includes('function passStats()'));
 assert.ok(comp.includes('composer.passes'));
 assert.ok(comp.includes('const popupBlur=boardBlurParams()'));
 assert.ok(comp.includes('const popupPasses=[boardBlurHorizontal,boardPopupPass]'));
});
test('stable link and current build remain exposed to users',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 assert.ok(html.includes('<title>NOMAD — Tetris System</title>'));
 assert.ok(main.includes("const THREE_BUILD_VERSION='063'"));
 assert.ok(main.includes("from './perf-monitor.js?v062'"));
});
