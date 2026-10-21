/* V059: unchanged composite image, measurable submission costs by pass.
 * node --test tetris/performance-v059.test.cjs
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const profiler=new Function(read('compositor-pass-profiler.js')
 .replace(/export function /g,'function ')+
 '\nreturn instrumentCompositorPasses;')();
const createPerfMonitor=new Function(read('perf-monitor.js')
 .replace(/export function /g,'function ')+
 '\nreturn createPerfMonitor;')();
const formatDebugReport=new Function(read('debug-report.js')
 .replace(/export function /g,'function ')+
 '\nreturn formatDebugReport;')();

test('profiling preserves pass return values, receiver, arguments, render order and side effects',()=>{
 let now=0;const seen=[],measurements=[];
 const a={render(x){seen.push('scene '+x);now+=3;return x+1;}};
 const b={render(x){seen.push('bloom '+x);now+=4;return x+2;}};
 const originalA=a.render,originalB=b.render;
 const instance=profiler([a,b],['Scene + uploads','Bloom'],(name,ms)=>measurements.push([name,ms]),()=>now);
 assert.equal(a.render(1),2);assert.equal(b.render(2),4);
 assert.deepEqual(seen,['scene 1','bloom 2']);
 assert.deepEqual(measurements,[['Scene + uploads',3],['Bloom',4]]);
 instance.dispose();assert.equal(a.render,originalA);assert.equal(b.render,originalB);
});
test('pass profiler cannot cause rendering failure if reporting throws',()=>{
 let now=0;
 const pass={render(){now+=2;return 'ok';}};
 const instance=profiler([pass],['Output'],()=>{throw Error('blocked report');},()=>now);
 assert.equal(pass.render(),'ok');
 instance.dispose();
});
test('pass profiler propagates actual rendering exceptions',()=>{
 let now=0;
 const pass={render(){now+=1;throw Error('shader failed');}};
 const instance=profiler([pass],['Output'],()=>{},()=>now);
 assert.throws(()=>pass.render(),/shader failed/);
 instance.dispose();
});
test('disabled passes are not measured when compositor skips calling render',()=>{
 let now=0;const measurements=[];
 const active={enabled:true,render(){now+=1;}};
 const disabled={enabled:false,render(){now+=20;}};
 const instance=profiler([active,disabled],['Active','Disabled'],(n)=>measurements.push(n),()=>now);
 for(const pass of [active,disabled])if(pass.enabled)pass.render();
 assert.deepEqual(measurements,['Active']);
 instance.dispose();
});
test('monitor records pass averages, totals and maximum without collapsing samples',()=>{
 let clock=0,sample=null;
 const m=createPerfMonitor({enabled:true,now:()=>clock,intervalMs:5,log:s=>sample=s});
 m.recordPass('Scene + uploads',3.5);m.recordPass('Scene + uploads',4.5);
 m.recordPass('Bloom',13);m.recordPass('Bloom',9);
 m.recordWebglCalls(16);m.recordWebglCalls(20);
 const started=m.startFrame();clock=10;m.endFrame(started);
 assert.equal(sample.passTimes['Scene + uploads'].calls,2);
 assert.equal(sample.passTimes['Scene + uploads'].avgCpuMs,4);
 assert.equal(sample.passTimes['Bloom'].maxCpuMs,13);
 assert.equal(sample.passTimes['Bloom'].totalCpuMs,22);
 assert.equal(sample.avgWebglCalls,18);
});
test('report lists pass CPU costs separately and emphasizes that values are not GPU time',()=>{
 const report=formatDebugReport({version:'059',samples:[{
  seconds:2,frameTicks:99,draws:11,basePaints:11,avgBasePaintMs:.5,
  passTimes:{'Scene + uploads':{calls:11,avgCpuMs:3,totalCpuMs:33},
   Bloom:{calls:11,avgCpuMs:10,totalCpuMs:110},
   Output:{calls:11,avgCpuMs:2,totalCpuMs:22}},
  avgWebglCalls:17,frameStates:{playing:99}
 }]});
 assert.ok(report.includes('PASS CPU = time inside each compositor pass;'));
 assert.ok(report.includes('WEBGL: 17 draw calls/render'));
 assert.ok(report.indexOf('Bloom 10ms×11')<report.indexOf('Scene + uploads 3ms×11'));
 assert.ok(report.includes('NOT GPU shader timing'));
});
test('V059 retains all ten original passes and captures their CPU times without extra render',()=>{
 const source=read('compositor.js'),main=read('three-v027.js');
 assert.ok(source.includes("instrumentCompositorPasses(composer.passes"));
 for(const label of ['Scene + uploads','Board blur H','Board popup','Ghost',
  'Bloom','Phosphor','Edge softness','Vignette','CRT mask','Output'])
  assert.ok(source.includes("'"+label+"'"),label);
 assert.ok(main.includes('renderer.info.autoReset=false;'));
 assert.ok(main.includes('renderer.info.reset();'));
 assert.ok(main.includes('perf.recordWebglCalls(renderer.info.render.calls);'));
 assert.ok(main.includes('onPassTiming:(name,elapsed)=>perf.recordPass(name,elapsed)'));
 assert.ok(main.includes('const THREE_BUILD_VERSION=\'062\''));
 assert.ok(read('three-v027.html').includes('Tetris System V062'));
});
