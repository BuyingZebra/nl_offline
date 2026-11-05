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
test('diagnostics are collected quietly with a bounded sample history',()=>{
 const code=fs.readFileSync(path.join(__dirname,'three-v027.js'),'utf8');
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
