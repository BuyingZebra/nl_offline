import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 CRT_BOUNDS,normalizeCRTRefresh,normalizePersistenceMs,crtRasterLines,
 crtScanPosition,advanceCRTPhase,rasterVisits,integratePhosphor
} from '../phosphor-model.js';
import {makeSliderControl,sliderValueAt} from '../ui-controls.js';
import {DISPLAY_EFFECTS} from '../display-settings-catalog.js';

test('refresh and decay are continuous bounded parameters, not phosphor presets',()=>{
 assert.equal(normalizeCRTRefresh(30),30);
 assert.equal(normalizeCRTRefresh(72.8),73);
 assert.equal(normalizeCRTRefresh(200),120);
 assert.equal(normalizeCRTRefresh(-4),30);
 assert.equal(normalizeCRTRefresh(NaN),60);
 assert.equal(normalizePersistenceMs(10),10);
 assert.equal(normalizePersistenceMs(190),190);
 assert.equal(normalizePersistenceMs(587),590);
 assert.equal(normalizePersistenceMs(9000),2000);
 assert.equal(normalizePersistenceMs(NaN),190);
 assert.equal(CRT_BOUNDS.defaultHz,60);
 assert.equal(CRT_BOUNDS.defaultPersistenceMs,190);
});
test('both CRT controls are true pointer sliders with visible units and endpoints',()=>{
 const crt=DISPLAY_EFFECTS.find(x=>x.id==='persistence');
 assert.ok(crt);
 assert.equal(crt.sliders.length,2);
 assert.deepEqual(crt.sliders.map(s=>s[1]),['scanRefreshHz','persistenceMs']);
 for(const setting of crt.sliders){
  const ctrl=makeSliderControl(80,40,180,setting,
   setting[1]==='scanRefreshHz'?60:190);
  assert.equal(sliderValueAt(ctrl.hitbox,ctrl.trackX),setting[2]);
  assert.equal(sliderValueAt(ctrl.hitbox,ctrl.trackX+ctrl.trackW),setting[3]);
  assert.equal(ctrl.unit,setting[5]);
 }
 assert.ok(!('profile' in crt));
 assert.ok(!('refresh' in crt));
});
test('virtual beam scans left-right and top-bottom, independent of host fps',()=>{
 assert.ok(crtScanPosition(.2,.1,300)<crtScanPosition(.8,.1,300));
 assert.ok(crtScanPosition(.8,.1,300)<crtScanPosition(.2,.2,300));
 assert.ok(crtRasterLines(1000)<=360);
 assert.ok(Math.abs(advanceCRTPhase(.9,.005,60)-.2)<1e-9);
 const first=rasterVisits(.9,.005,60,.95);
 const wrap=rasterVisits(.9,.005,60,.05);
 const missed=rasterVisits(.9,.005,60,.45);
 assert.equal(first.count,1);
 assert.equal(wrap.count,1);
 assert.equal(missed.count,0);
});
test('steady frame-average excitation equals drive across refresh and persistence',()=>{
 for(const hz of [30,60,90,120]){
  for(const ms of [10,80,190,600,2000]){
   let state=0,phase=0,avg=0;
   const dt=1/60;
   for(let i=0;i<700;i++){
    const r=integratePhosphor({prior:state,drive:.6,seconds:dt,
     refreshHz:hz,persistenceMs:ms,phase,position:.37});
    state=r.end;avg=r.average;
    phase=advanceCRTPhase(phase,dt,hz);
   }
   // At frame rate not synchronized to the simulated scan some single
   // intervals differ; average across a later set of output frames.
   let sum=0;
   for(let i=0;i<120;i++){
    const r=integratePhosphor({prior:state,drive:.6,seconds:dt,
     refreshHz:hz,persistenceMs:ms,phase,position:.37});
    state=r.end;sum+=r.average;
    phase=advanceCRTPhase(phase,dt,hz);
   }
   assert.ok(Math.abs(sum/120-.6)<.035,`hz=${hz},tau=${ms},mean=${sum/120}`);
  }
 }
});
test('emission after drive stops decays monotonically instead of disappearing',()=>{
 for(const ms of [20,190,1500]){
  const tau=ms/1000;
  const dt=.02;
  const a=integratePhosphor({prior:.8,drive:0,seconds:dt,
   refreshHz:60,persistenceMs:ms});
  assert.ok(Math.abs(a.end-.8*Math.exp(-dt/tau))<1e-8);
  assert.ok(a.average>.0&&a.average<=.8);
 }
});
test('GPU shader integrates beam impulses into frame-average luminance',()=>{
 const s=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 for(const part of ['uPhase','uCycles','uHz','uLines','uTau','visits',
  'float integrated=','float average=','prior*atten+excitation*aged*ratio',
  'sqrt(clamp','STORE_SCALE','WebGLRenderTarget','FullScreenQuad'])
  assert.ok(s.includes(part),part);
 assert.ok(!s.includes('profileHues'));
 assert.ok(!s.includes('uTint'));
 assert.ok(!s.includes('max(prior*'));
});
