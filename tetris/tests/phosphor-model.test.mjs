import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PHOSPHOR_PROFILES,phosphorProfile,nextPhosphorProfile,phosphorEnvelope,
 CRT_REFRESH_RATES,normalizeCRTRefresh,nextCRTRefresh,crtRasterLines,
 advanceCRTPhase,crtScanPosition,beamHitsPixel} from '../phosphor-model.js';

test('custom blend is first and all decay profiles are neutral, valid models',()=>{
 assert.deepEqual(PHOSPHOR_PROFILES.map(p=>p.id),['balanced','p39','p31','p1','p4']);
 assert.equal(phosphorProfile('unknown').id,'balanced');
 for(const p of PHOSPHOR_PROFILES){
  assert.ok(Math.abs(p.fastWeight+p.slowWeight-1)<1e-9,p.id);
  assert.ok(p.fastTau>0&&p.slowTau>p.fastTau,p.id);
  assert.ok(p.tailMs>0&&p.tailMs<10000,p.id);
  assert.equal('tint' in p,false,'hue must not belong to decay profiles');
 }
 assert.equal(phosphorProfile('balanced').slowTau,.19);
});
test('historic 10% timing benchmarks and monotone fades',()=>{
 const ages=[0,.000038,.001,.05,.15,.5,1,2,3,7];
 for(const p of PHOSPHOR_PROFILES){
  if(p.referenceT10!==null){
   const at10=phosphorEnvelope(p,p.referenceT10);
   assert.ok(at10>.08&&at10<.12,p.id+': '+at10);
  }
  const values=ages.map(t=>phosphorEnvelope(p,t));
  assert.ok(values.every(x=>Number.isFinite(x)&&x>=0),p.id);
  assert.ok(values.every((x,i)=>i===0||x<=values[i-1]),p.id);
 }
 assert.ok(phosphorEnvelope('p39',3)>.001);
 assert.ok(phosphorEnvelope('p31',3)<.001);
});
test('decay profiles cycle without changing their emission hue',()=>{
 let id='balanced';
 for(const next of ['p39','p31','p1','p4','balanced']){
  id=nextPhosphorProfile(id);assert.equal(id,next);
 }
});
test('raster refresh is constrained and independent of host redraw',()=>{
 assert.deepEqual(CRT_REFRESH_RATES,[50,60,75]);
 assert.equal(normalizeCRTRefresh(99),60);
 assert.equal(nextCRTRefresh(50),60);
 assert.equal(nextCRTRefresh(60),75);
 assert.equal(nextCRTRefresh(75),50);
 assert.ok(Math.abs(advanceCRTPhase(.9,.005,60)-.2)<1e-9);
 assert.ok(Math.abs(advanceCRTPhase(.1,1/60,60)-.1)<1e-9);
});
test('beam travels left-to-right then top-to-bottom; wraps correctly',()=>{
 const left=crtScanPosition(.1,.05,10);
 const right=crtScanPosition(.9,.05,10);
 const next=crtScanPosition(.1,.15,10);
 assert.ok(left<right&&right<next);
 assert.equal(beamHitsPixel(0,.2,left),true);
 assert.equal(beamHitsPixel(0,.2,crtScanPosition(.5,.9,10)),false);
 assert.equal(beamHitsPixel(.9,.3,.95),true);
 assert.equal(beamHitsPixel(.9,.3,.05),true);
 assert.equal(beamHitsPixel(.9,.3,.45),false);
 assert.equal(beamHitsPixel(0,1,.99),true);
 assert.ok(crtRasterLines(850)<=360);
 assert.ok(crtRasterLines(850)*2<=850);
});
test('GPU state contains scan phase, excitation, decay and crisp reconstruction',()=>{
 const source=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 for(const name of ['uPhase','uCycles','uHz','uLines','uFastTau',
  'uSlowTau','uFastDecay','uSlowDecay','tPrevious','uReset',
  'WebGLRenderTarget','FullScreenQuad','ageCycles','eventLight'])
  assert.ok(source.includes(name),name);
 assert.match(source,/sqrt\(clamp/);
 assert.match(source,/Math\.ceil\(width\/2\)/);
 assert.match(source,/float lingering=/);
 assert.doesNotMatch(source,/UnrealBloomPass/);
 assert.doesNotMatch(source,/uTint/);
});
