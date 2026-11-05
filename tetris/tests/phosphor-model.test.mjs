import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PHOSPHOR_PROFILES,phosphorProfile,nextPhosphorProfile,phosphorEnvelope}
 from '../phosphor-model.js';

test('P39 is preferred, and all profiles have normalized dual-decay envelopes',()=>{
 assert.deepEqual(PHOSPHOR_PROFILES.map(p=>p.id),['p39','p31','p1','p4']);
 for(const p of PHOSPHOR_PROFILES){
  assert.ok(Math.abs(p.fastWeight+p.slowWeight-1)<1e-9,p.id);
  assert.ok(p.fastTau>0&&p.slowTau>p.fastTau&&p.riseTau>0,p.id);
  assert.ok(p.tailMs>0&&p.tailMs<12000,p.id);
  assert.equal(p.tint.length,3);
 }
 assert.equal(phosphorProfile('unknown').id,'p39');
});
test('model decay crosses 10% near documented reference times (approximation)',()=>{
 // Historic terminal CRT comparison and HP AN-115 measurements.
 // These are model fitting checkpoints, not independent experimental validation.
 for(const p of PHOSPHOR_PROFILES){
  const at10=phosphorEnvelope(p,p.referenceT10);
  assert.ok(at10>.08&&at10<.12,p.id+': '+at10);
  assert.ok(Math.abs(phosphorEnvelope(p,0)-1)<1e-9);
 }
});
test('all curves decay monotonically; P39 retains a seconds-long faint tail',()=>{
 const ages=[0,.000038,.001,.05,.15,.5,1,2,3,4,7];
 for(const p of PHOSPHOR_PROFILES){
  const values=ages.map(age=>phosphorEnvelope(p,age));
  assert.ok(values.every(x=>Number.isFinite(x)&&x>=0),p.id);
  assert.ok(values.every((x,i)=>i===0||x<=values[i-1]),p.id);
 }
 assert.ok(phosphorEnvelope('p39',1)>phosphorEnvelope('p31',1)*100);
 assert.ok(phosphorEnvelope('p39',3)>.001);
 assert.ok(phosphorEnvelope('p31',3)<.001);
});
test('cycle through every phosphor and return to P39',()=>{
 let id='p39';
 for(const expected of ['p31','p1','p4','p39']){
  id=nextPhosphorProfile(id);assert.equal(id,expected);
 }
});
test('history stays GPU-only and preserves sharp source separately from filtered residual',()=>{
 const source=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 assert.match(source,/FullScreenQuad/);
 assert.match(source,/tPrevious/);
 assert.match(source,/uFastDecay/);
 assert.match(source,/uSlowDecay/);
 assert.match(source,/uReset/);
 assert.match(source,/sqrt\(clamp/);
 assert.match(source,/WebGLRenderTarget/);
 assert.match(source,/Math\.ceil\(width\/2\)/);
 assert.match(source,/max\(0\.0,history\.x-src\)/);
 assert.doesNotMatch(source,/UnrealBloomPass/);
});
