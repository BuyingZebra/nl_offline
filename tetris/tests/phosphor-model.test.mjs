import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PHOSPHOR_BOUNDS,normalizePersistenceMs,integratePhosphorResponse,
 PHOSPHOR_OPTICS,gaussianKernel1D}
 from '../phosphor-model.js';
import {makeSliderControl,sliderValueAt} from '../ui-controls.js';
import {DISPLAY_EFFECTS} from '../display-settings-catalog.js';

test('phosphor decay is continuous and the sole display-light slider',()=>{
 const effect=DISPLAY_EFFECTS.find(e=>e.id==='persistence');
 assert.ok(effect);
 assert.equal(effect.title,'PHOSPHOR RESPONSE');
 assert.equal(effect.sliders.length,1);
 const slider=effect.sliders[0];
 assert.equal(slider[1],'persistenceMs');
 assert.deepEqual(slider.slice(2),[10,2000,10,'ms']);
 const ui=makeSliderControl(90,35,180,slider,190);
 assert.equal(sliderValueAt(ui.hitbox,ui.trackX),10);
 assert.equal(sliderValueAt(ui.hitbox,ui.trackX+ui.trackW),2000);
 assert.equal(DISPLAY_EFFECTS.some(e=>e.id==='scanRefreshHz'),false);
 assert.equal(PHOSPHOR_BOUNDS.riseMs,12);
});
test('persistence range clamps and quantizes to 10 ms increments',()=>{
 assert.equal(normalizePersistenceMs(0),10);
 assert.equal(normalizePersistenceMs(193),190);
 assert.equal(normalizePersistenceMs(350),350);
 assert.equal(normalizePersistenceMs(90000),2000);
 assert.equal(normalizePersistenceMs(NaN),190);
});
test('fast excitation and exponential decay respond to drive on every pixel',()=>{
 const tau=.19,t=.19;
 const decay=integratePhosphorResponse(1,0,t,190);
 assert.ok(Math.abs(decay-Math.exp(-t/tau))<1e-9);
 assert.ok(integratePhosphorResponse(0,1,.034,190)>.93);
 assert.ok(integratePhosphorResponse(1,.4,.034,190)>.4);
 assert.ok(integratePhosphorResponse(.4,.4,.034,190)===.4);
});
test('no game pause or menu action resets GPU persistence history',()=>{
 const source=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 const menu=source.slice(source.indexOf('onChange:(previous,next)=>{'),
  source.indexOf('// All game commands'));
 assert.ok(!menu.includes('resetPersistence'), 'menu changes must not clear CRT glow');
 const callbacks=source.slice(source.indexOf('handleAction:act=>{'),
  source.indexOf('setSetting:actions.setSetting'));
 assert.ok(!callbacks.includes('resetPersistence'), 'pause/play action must not clear CRT glow');
 const status=source.slice(source.indexOf('if(game.status!==prior.status){'),
  source.indexOf("layers.reason('gravity')"));
 assert.ok(!status.includes('resetPersistence'), 'game status changes must preserve glow');
});
test('postcomposition luminance response has no scanning logic',()=>{
 const pass=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 const pipeline=fs.readFileSync(new URL('../compositor.js',import.meta.url),'utf8');
 assert.match(pass,/tSource/);
 assert.match(pass,/tPrevious/);
 assert.match(pass,/uDecayTau/);
 assert.match(pass,/uRiseTau/);
 assert.match(pass,/exp\(-uDelta\/max/);
 assert.match(pass,/sqrt\(clamp\(emitted/);
 assert.match(pass,/WebGLRenderTarget/);
 assert.match(pass,/float afterglow=/);
 assert.doesNotMatch(pass,/uPhase|uCycles|uHz|uLines|CRT_REFRESH|ageCycles/);
 assert.doesNotMatch(pass,/uTint/);
 const layout=pipeline.indexOf('composer.addPass(new RenderPass');
 const history=pipeline.indexOf('composer.addPass(persistencePass)');
 const glow=pipeline.indexOf('composer.addPass(glow)');
 assert.ok(layout>=0&&layout<history&&history<glow,
  'phosphor is a whole-display effect between composed scene and bloom/tint');
 assert.match(pipeline,/persistencePass\.configure\(fx\.persistenceMs\)/);
});

test('normalized Gaussian PSF diffuses an isolated bright point symmetrically',()=>{
 const k=gaussianKernel1D();
 assert.equal(k.length,5);
 const total=k.reduce((a,b)=>a+b,0);
 assert.ok(Math.abs(total-1)<1e-12);
 assert.ok(k[2]>k[1]&&k[1]>k[0]);
 assert.ok(Math.abs(k[0]-k[4])<1e-12);
 assert.ok(Math.abs(k[1]-k[3])<1e-12);
 const fraction=PHOSPHOR_OPTICS.spreadFraction;
 assert.ok(fraction>0&&fraction<.25);
 // A bright impulse deposits (1-f) at its original location plus a
 // normalized 2D falloff. Its total integrated light remains one.
 let sum=0;
 for(let y=0;y<5;y++)for(let x=0;x<5;x++){
  const core=x===2&&y===2?1-fraction:0;
  sum+=core+fraction*k[y]*k[x];
 }
 assert.ok(Math.abs(sum-1)<1e-12,`PSF energy=${sum}`);
 assert.ok(k[2]*k[2]>k[2]*k[1]);
 assert.ok(k[2]*k[1]>k[0]*k[0]);
});
test('spatial halo is a separable post-emission PSF with same persistence',()=>{
 const pass=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 for(const expected of ['spreadFragment','tSpread','blurHorizontal','blurVertical',
  'PHOSPHOR_OPTICS.spreadFraction','mix(core,scattered,uSpreadFraction)',
  'optX.tInput.value=write.texture','optY.tInput.value=blurX.texture',
  'uDecayTau','uRiseTau','uReset','exp(-uDelta/max'])
   assert.ok(pass.includes(expected),expected);
 assert.ok(pass.includes('Math.ceil(width/4)'));
 assert.ok(pass.indexOf('quad.material=update')<
   pass.indexOf('quad.material=blurHorizontal'));
 assert.ok(pass.indexOf('quad.material=blurVertical')<
   pass.indexOf('quad.material=output'));
 assert.ok(!/uPhase|uCycles|uHz|uLines|CRT_REFRESH|ageCycles/.test(pass));
 assert.ok(!pass.includes('uTint'));
});
