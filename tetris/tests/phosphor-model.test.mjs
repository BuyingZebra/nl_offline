import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PHOSPHOR_PROFILES,phosphorProfile,nextPhosphorProfile,phosphorEnvelope}
 from '../phosphor-model.js';

test('P39 is preferred, selections are complete, and weights conserve steady emission',()=>{
 assert.deepEqual(PHOSPHOR_PROFILES.map(p=>p.id),['p39','p31','p1','p4']);
 for(const p of PHOSPHOR_PROFILES){
  assert.ok(Math.abs(p.prompt+p.fast+p.slow-1)<1e-9,p.id);
  assert.ok(p.fastTau>0&&p.slowTau>p.fastTau&&p.riseTau>0,p.id);
  assert.ok(p.tailMs>0&&p.tailMs<12000,p.id);
 }
 assert.equal(phosphorProfile('nonsense').id,'p39');
});
test('persistences have bounded decaying tails, and P39 lasts longer than P31',()=>{
 const ages=[0,.05,.1,.2,.5,1,2,4,7];
 for(const profile of PHOSPHOR_PROFILES){
  const samples=ages.map(age=>phosphorEnvelope(profile,age,3));
  assert.ok(samples.every(x=>Number.isFinite(x)&&x>=0),profile.id);
  assert.ok(samples.every((x,i)=>i===0||x<=samples[i-1]),profile.id);
 }
 assert.ok(phosphorEnvelope('p39',1,3)>phosphorEnvelope('p31',1,3)*100);
 assert.ok(phosphorEnvelope('p39',3,3)>0.001);
 assert.ok(phosphorEnvelope('p31',3,3)<0.001);
});
test('profile selection cycles without changing the baseline effects',()=>{
 let id='p39';
 for(const want of ['p31','p1','p4','p39']){
  id=nextPhosphorProfile(id);assert.equal(id,want);
 }
});
test('new history pass is isolated and has no additional bloom shader or color tint',()=>{
 const source=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 assert.match(source,/FullScreenQuad/);
 assert.match(source,/Pass/);
 assert.match(source,/tPrevious/);
 assert.match(source,/uFastDecay/);
 assert.match(source,/uSlowDecay/);
 assert.match(source,/uReset/);
 assert.match(source,/sqrt\(clamp/);
 assert.match(source,/renderTarget|WebGLRenderTarget/);
 assert.doesNotMatch(source,/UnrealBloomPass/);
});
