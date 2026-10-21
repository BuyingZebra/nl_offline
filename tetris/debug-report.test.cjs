/* Run: node --test tetris/debug-report.test.cjs
 * V055 explicit clipboard sharing and private, in-memory frame history.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function load(filename,symbol){
 const source=fs.readFileSync(path.join(__dirname,filename),'utf8')
  .replace(/export function /g,'function ');
 return new Function(source+'\nreturn '+symbol+';')();
}
const format=load('debug-report.js','formatDebugReport');
const createClipboard=load('debug-clipboard.js','createDebugClipboard');
const createPerfMonitor=load('perf-monitor.js','createPerfMonitor');

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
test('debug button sits left of X and copies on user activation',()=>{
 const code=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'three-v027.html'),'utf8');
 assert.ok(code.includes('const debugX=closeX-q.buttonH-UI_SPACE.headIconGap;'));
 assert.ok(code.includes("key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug')"));
 assert.ok(code.includes("if(act==='copyDebug'){copyDebugReport();return;}"));
 assert.ok(code.includes('debugClipboard.copyText(report)'));
 assert.ok(code.includes("debugCopyState=success?'copied':'failed'"));
 assert.ok(code.includes('function drawDebugBug(cx,cy){'));
 assert.ok(!code.includes('createPerfHud({enabled:perfEnabled'));
 assert.ok(code.includes("const THREE_BUILD_VERSION='058'"));
 assert.ok(html.includes('Tetris System V058'));
});
test('diagnostics are collected quietly with a bounded sample history',()=>{
 const code=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
 assert.ok(code.includes('const recentPerf=[];'));
 assert.ok(code.includes('if(recentPerf.length>8)recentPerf.shift()'));
 assert.ok(code.includes('enabled:true,intervalMs:2000,log:()=>{}'));
 assert.ok(!code.includes('console.log(report)'));
});
