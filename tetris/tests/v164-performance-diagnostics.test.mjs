/* NOMAD V164: diagnostics-only release verification.
 * Run: node --test tetris/tests/v164-performance-diagnostics.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerfMonitor} from '../perf-monitor.js';
import {createTextureUploadProfiler} from '../texture-upload-profiler.js';
import {formatDebugReport} from '../debug-report.js';

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
 assert.match(report,/DIRTY B\/D\/S\/C\/P\/M/);
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
