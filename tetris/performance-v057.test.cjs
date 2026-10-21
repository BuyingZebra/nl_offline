/* Tetris V057: attribution, actual dirty-canvas paints and stage timings.
 * Run: node --test tetris/*.test.cjs
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
const perfSource=read('perf-monitor.js').replace(/export function /g,'function ');
const createPerfMonitor=new Function(perfSource+'\nreturn createPerfMonitor;')();
const reportSource=read('debug-report.js').replace(/export function /g,'function ');
const formatDebugReport=new Function(reportSource+'\nreturn formatDebugReport;')();
const main=read('three-v027.js');
const comp=read('compositor.js');

test('measures logic and Canvas stages independently of compositor submission',()=>{
 let t=0,sample=null;
 const p=createPerfMonitor({enabled:true,now:()=>t,intervalMs:10,log:s=>sample=s});
 p.recordDuration('logic',.2);p.recordDuration('logic',.4);
 p.recordDuration('base',1.2);p.recordDuration('base',.8);
 p.recordDuration('modal',3);p.recordDuration('sync',.1);
 p.recordState('playing');p.recordState('paused');
 const start=p.startFrame();t=12;p.endFrame(start);
 assert.equal(sample.avgLogicMs,.3);
 assert.equal(sample.avgBasePaintMs,1);
 assert.equal(sample.basePaints,2);
 assert.equal(sample.modalPaints,1);
 assert.equal(sample.avgModalPaintMs,3);
 assert.equal(sample.avgSyncMs,.1);
 assert.equal(sample.frameStates.playing,1);
 assert.equal(sample.frameStates.paused,1);
});
test('multiple redraw causes are attributed without duplicating the same cause',()=>{
 let t=0,sample=null;
 const p=createPerfMonitor({enabled:true,now:()=>t,intervalMs:1,log:s=>sample=s});
 p.recordRedrawReasons(['input','gravity','input']);
 p.recordRedrawReasons(['gravity']);
 p.recordRedrawReasons([]);
 p.recordRedrawReasons(['surprise']);
 t=2;p.endFrame(p.startFrame());
 assert.equal(sample.redrawReasons.input,1);
 assert.equal(sample.redrawReasons.gravity,2);
 assert.equal(sample.redrawReasons.unknown,2);
});
test('sampling resets CPU stage and redraw counts after every interval',()=>{
 let t=0,values=[];
 const p=createPerfMonitor({enabled:true,now:()=>t,intervalMs:10,log:s=>values.push(s)});
 p.recordDuration('base',10);p.recordRedrawReasons(['input']);
 let start=p.startFrame();t=15;p.endFrame(start);
 start=p.startFrame();t=30;p.endFrame(start);
 assert.equal(values.length,2);
 assert.equal(values[0].basePaints,1);
 assert.equal(values[1].basePaints,0);
 assert.equal(values[1].redrawReasons.input,undefined);
});
test('debug report prints stage timing and gameplay state for each sample',()=>{
 const result=formatDebugReport({version:'057',samples:[{
  seconds:2,frameTicks:100,draws:3,avgLogicMs:.01,
  avgBasePaintMs:1.25,basePaints:3,avgModalPaintMs:0,
  modalPaints:0,avgSyncMs:.08,
  redrawReasons:{gravity:2,input:1},frameStates:{playing:100}
 }]});
 assert.ok(result.includes('STAGES: logic 0.01ms/RAF'));
 assert.ok(result.includes('Canvas base 1.25ms (3 paints)'));
 assert.ok(result.includes('FX setup 0.08ms'));
 assert.ok(result.includes('RAF STATES: playing:100'));
 assert.ok(result.includes('REDRAW CAUSES: gravity:2, input:1'));
});
test('main renderer measures only work actually performed',()=>{
 assert.ok(main.includes("perf.recordDuration('logic'"));
 assert.ok(main.includes("perf.recordDuration('base'"));
 assert.ok(main.includes("perf.recordDuration('modal'"));
 assert.ok(main.includes("perf.recordDuration('sync'"));
 assert.ok(main.includes('perf.recordRedrawReasons([...pendingRedrawReasons])'));
 assert.ok(main.includes('perf.recordState(game.status)'));
 assert.ok(main.includes('if(dirty){'));
 assert.ok(main.includes('if(baseDirty){'));
});
test('compositor never asks Canvas2D to repaint directly',()=>{
 assert.ok(!comp.includes('paintBaseGame('));
 assert.ok(!comp.includes('baseDirty='));
 assert.ok(!comp.includes('invalidate('));
 assert.ok(comp.includes('render:()=>composer.render()'));
});
test('ordinary unattended game ticks do not move the piece every frame',()=>{
 const obj={};
 new Function('window',read('core.js'))(obj);
 const game=new obj.FieldAtlasBlocks.Game(()=>.45);
 game.start();let advanced=0;
 for(let i=0;i<120;i++)if(game.tick(1000/60))advanced++;
 assert.equal(game.status,'playing');
 assert.ok(advanced<=4,'gravity should not require 60 Canvas redraws per second');
 assert.ok(advanced>0,'the piece should still fall');
});
test('V057 retains same screen and existing debug-copy workflow',()=>{
 assert.ok(main.includes("const THREE_BUILD_VERSION='063'"));
 assert.ok(main.includes('const MAX_RENDER_DPR=2;'));
 assert.ok(main.includes("key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug')"));
 assert.ok(main.includes('debugClipboard.copyText(report)'));
 assert.ok(read('three-v027.html').includes('Tetris System V063'));
});
