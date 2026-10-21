/* V060 — isolate CanvasTexture transfer timing from the first scene pass.
 * Run with node --test tetris/*.test.cjs
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const uploader=new Function(read('texture-upload-profiler.js')
 .replace(/export function /g,'function ')+'\nreturn createTextureUploadProfiler;')();
const monitor=new Function(read('perf-monitor.js')
 .replace(/export function /g,'function ')+'\nreturn createPerfMonitor;')();
const report=new Function(read('debug-report.js')
 .replace(/export function /g,'function ')+'\nreturn formatDebugReport;')();

test('uploads only changed texture revisions and reports synchronous CPU time',()=>{
 let clock=0;const calls=[],timings=[];
 const r={initTexture(t){calls.push(t);clock+=5;}};
 const p=uploader({renderer:r,now:()=>clock,onTiming:(name,ms)=>timings.push([name,ms])});
 const base={version:1},modal={version:1};
 assert.equal(p.upload(base,'base'),true);
 assert.equal(p.upload(base,'base'),false);
 assert.equal(p.upload(modal,'modal'),true);
 base.version=2;
 assert.equal(p.upload(base,'base'),true);
 assert.equal(calls.length,3);
 assert.deepEqual(timings,[['base',5],['modal',5],['base',5]]);
});
test('does not try to upload textures which are absent or unsupported',()=>{
 const p=uploader({renderer:{}});
 assert.equal(p.upload(null,'base'),false);
 assert.equal(p.upload({version:1},'base'),false);
});
test('failed upload is retried after failure instead of marking texture current',()=>{
 let calls=0;
 const t={version:1};
 const p=uploader({renderer:{initTexture(){
  calls++;if(calls===1)throw Error('lost context');
 }}});
 assert.throws(()=>p.upload(t,'base'),/lost context/);
 assert.equal(p.upload(t,'base'),true);
 assert.equal(calls,2);
});
test('diagnostic callbacks never interrupt working renderer',()=>{
 const t={version:1};let calls=0;
 const p=uploader({renderer:{initTexture(){calls++;}},
  onTiming(){throw Error('report failed');}});
 assert.equal(p.upload(t,'base'),true);
 assert.equal(calls,1);
});
test('profiler stores separate upload timing averages and resets per interval',()=>{
 let t=0;const samples=[];
 const p=monitor({enabled:true,now:()=>t,intervalMs:5,log:v=>samples.push(v)});
 p.recordUpload('base',5);p.recordUpload('base',9);p.recordUpload('modal',2);
 let started=p.startFrame();t=6;p.endFrame(started);
 assert.equal(samples[0].uploadTimes.base.calls,2);
 assert.equal(samples[0].uploadTimes.base.avgCpuMs,7);
 assert.equal(samples[0].uploadTimes.modal.totalCpuMs,2);
 started=p.startFrame();t=12;p.endFrame(started);
 assert.deepEqual(samples[1].uploadTimes,{});
});
test('debug report shows texture upload time separately from scene pass CPU',()=>{
 const result=report({version:'060',samples:[{seconds:2,frameTicks:100,basePaints:2,
  uploadTimes:{base:{calls:2,avgCpuMs:12,maxCpuMs:15,totalCpuMs:24}},
  passTimes:{'Scene + uploads':{calls:2,avgCpuMs:4,totalCpuMs:8}},
  avgWebglCalls:18}]});
 assert.ok(result.includes('PRE-UPLOAD: base 12ms×2'));
 assert.ok(result.includes('Scene + uploads 4ms×2'));
 assert.ok(result.includes('not GPU execution time'));
});
test('render source preuploads only visible textures and preserves full composer pass order',()=>{
 const js=read('three-v027.js');
 assert.ok(js.includes("if(surface.visible)textureUploads.upload(texture,'base')"));
 assert.ok(js.includes("if(modalPlane.visible)textureUploads.upload(modalTexture,'modal')"));
 assert.ok(js.includes("textureUploads.upload(boardPopupTexture,'popup')"));
 assert.ok(js.indexOf("textureUploads.upload(texture,'base')")<js.indexOf("compositor.render();"));
 assert.ok(js.includes('renderer.info.reset();'));
 const c=read('compositor.js');
 assert.ok(c.includes('composer.addPass(new OutputPass())'));
 assert.ok(c.includes('onPassTiming'));
});
test('build and stable URL are advanced to V060',()=>{
 const code=read('three-v027.js'),html=read('three-v027.html');
 assert.ok(code.includes("const THREE_BUILD_VERSION='064'"));
 assert.ok(html.includes('Tetris System V064'));
 assert.ok(code.includes("from './texture-upload-profiler.js?v060'"));
 assert.ok(code.includes("from './perf-monitor.js?v062'"));
 assert.ok(code.includes("from './debug-report.js?v062'"));
});
