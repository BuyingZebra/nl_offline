/* Run: node --test tetris/performance.test.cjs
 * V053 regression coverage for low-overhead diagnostics and render policy.
 * The actual mobile GPU still requires on-device measurement.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const perfSource=fs.readFileSync(path.join(__dirname,'perf-monitor.js'),'utf8')
 .replace(/export function /g,'function ');
const makeMonitor=new Function(perfSource+'\nreturn createPerfMonitor;')();
const main=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');

test('profiling is disabled by default and never logs',()=>{
 let clock=0,logs=0;
 const perf=makeMonitor({now:()=>clock,log:()=>logs++,intervalMs:5});
 assert.equal(perf.enabled,false);
 perf.textureChanged('base');
 perf.endRender(perf.startRender());
 perf.endFrame(perf.startFrame());
 clock+=9000;
 assert.equal(logs,0);
 assert.equal(perf.snapshot(),null);
});
test('opt-in monitoring records CPU time and requested texture uploads',()=>{
 let clock=100,received=[];
 const perf=makeMonitor({enabled:true,now:()=>clock,log:s=>received.push(s),intervalMs:50});
 const tick=perf.startFrame();
 clock+=3;
 perf.textureChanged('base');
 perf.textureChanged('modal');
 perf.textureChanged('popup');
 const render=perf.startRender();
 clock+=4;
 perf.endRender(render);
 clock+=53;
 perf.endFrame(tick);
 assert.equal(received.length,1);
 assert.equal(received[0].frameTicks,1);
 assert.equal(received[0].draws,1);
 assert.equal(received[0].baseUploadRequests,1);
 assert.equal(received[0].modalUploadRequests,1);
 assert.equal(received[0].popupUploadRequests,1);
 assert.equal(received[0].avgRenderSubmitMs,4);
 assert.equal(received[0].maxFrameCpuMs,60);
 assert.equal(perf.snapshot(),received[0]);
});
test('performance samples reset rather than accumulating indefinitely',()=>{
 let clock=0,received=[];
 const perf=makeMonitor({enabled:true,now:()=>clock,log:s=>received.push(s),intervalMs:10});
 let tick=perf.startFrame();perf.textureChanged('base');clock+=12;perf.endFrame(tick);
 tick=perf.startFrame();clock+=12;perf.endFrame(tick);
 assert.equal(received.length,2);
 assert.equal(received[0].baseUploadRequests,1);
 assert.equal(received[1].baseUploadRequests,0);
 assert.equal(received[1].frameTicks,1);
});
test('same-size resize exits before expensive canvas and GPU reallocation',()=>{
 const fn=main.slice(main.indexOf('function resize('),main.indexOf('new ResizeObserver('));
 const early=fn.indexOf('if(w===W&&h===H&&d===DPR)');
 const allocate=fn.indexOf('input.width=Math.round(W*DPR)');
 assert.ok(early>=0&&allocate>early);
 assert.ok(fn.includes('if(forceLayout===true)'));
 assert.ok(!fn.includes('&&d===DPR&&!dirty'));
 assert.ok(main.includes('new ResizeObserver(()=>resize()).observe(display)'));
});
test('gameplay does not clear or request a GPU upload for invisible board popup',()=>{
 const fn=main.slice(main.indexOf('function paintBaseGame(){'),main.indexOf('function paintGame(){'));
 assert.ok(fn.includes("if(game.status!=='playing'){"));
 assert.ok(/if\(game\.status!=='playing'\)\{\s*boardPopupContext\.setTransform/.test(fn));
 assert.ok(/if\(game\.status!=='playing'\)\{\s*boardPopupTexture\.needsUpdate=true;/.test(fn));
 assert.ok(fn.includes("perf.textureChanged('popup')"));
 assert.ok(fn.includes("perf.textureChanged('base')"));
});
test('region snapshots remain immutable while modal hitboxes are constructed',()=>{
 assert.ok(main.includes('baseRegions=regions;'));
 assert.ok(main.includes('if(!modal)regions=baseRegions;'));
 assert.ok(main.includes('regions=[];const r=layout();'));
 assert.ok(main.includes("if(modal)paintModalOverlay();"));
 assert.ok(!main.includes('regions=baseRegions.slice()'));
});
test('render diagnostics are opt-in, with unchanged shaders and live version',()=>{
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 assert.ok(main.includes('const recentPerf=[];'));
 assert.ok(main.includes('copyDebugReport()'));
 assert.ok(main.includes('const renderStarted=perf.startRender();'));
 assert.ok(main.includes('perf.endRender(renderStarted);'));
 assert.ok(/const THREE_BUILD_VERSION='[0-9]+'/.test(main));
 assert.ok(/Tetris System V[0-9]+/.test(html));
 assert.ok(main.includes("from './compositor.js?v056'"));
});
