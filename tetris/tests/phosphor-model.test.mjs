import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PHOSPHOR_BOUNDS,normalizePersistenceMs,integratePhosphorResponse,
 PHOSPHOR_OPTICS,radialPSFWeights}
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
 assert.deepEqual(slider.slice(2),[10,120,10,'ms']);
 const ui=makeSliderControl(90,35,180,slider,190);
 assert.equal(sliderValueAt(ui.hitbox,ui.trackX),10);
 assert.equal(sliderValueAt(ui.hitbox,ui.trackX+ui.trackW),120);
 assert.equal(DISPLAY_EFFECTS.some(e=>e.id==='scanRefreshHz'),false);
 assert.equal(PHOSPHOR_BOUNDS.riseMs,12);
});
test('persistence range clamps and quantizes to 10 ms increments',()=>{
 assert.equal(normalizePersistenceMs(0),10);
 assert.equal(normalizePersistenceMs(193),120);
 assert.equal(normalizePersistenceMs(80),80);
 assert.equal(normalizePersistenceMs(90000),120);
 assert.equal(normalizePersistenceMs(NaN),120);
});
test('fast excitation and exponential decay respond to drive on every pixel',()=>{
 const tau=.12,t=.12;
 const decay=integratePhosphorResponse(1,0,t,120);
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

test('100% of the emitted light passes through normalized peaked spatial PSF',()=>{
 const w=radialPSFWeights();
 const sum=w.center+4*(w.axis+w.diagonal+w.outer);
 assert.ok(Math.abs(sum-1)<1e-12,`kernel sum=${sum}`);
 assert.ok(w.center>w.axis&&w.axis>w.diagonal&&w.diagonal>w.outer);
 assert.ok(PHOSPHOR_OPTICS.pixelPitch>0);
 // Shader coefficients must be exactly the model-defined kernel.
 const shader=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 for(const [name,value] of Object.entries({
  W_CENTER:w.center,W_AXIS:w.axis,W_DIAGONAL:w.diagonal,W_OUTER:w.outer
 })){
  const found=shader.match(new RegExp('const float '+name+'=([0-9.]+);'));
  assert.ok(found,name+' missing in shader');
  assert.ok(Math.abs(Number(found[1])-value)<1e-9,name+' deviates from model');
 }
 // For a spatial impulse of unit brightness, the sum over the 13
 // mapped destinations is one: no arbitrary fraction bypasses the PSF.
 const impulse=[w.center,...Array(4).fill(w.axis),
  ...Array(4).fill(w.diagonal),...Array(4).fill(w.outer)];
 assert.ok(Math.abs(impulse.reduce((a,b)=>a+b,0)-1)<1e-12);
 // A dim source creates exactly the same falloff SHAPE but less amplitude.
 // Thus its distant light falls below a fixed visibility threshold sooner.
 const farBright=w.outer*1;
 const farDim=w.outer*.1;
 const threshold=(farBright+farDim)*.5;
 assert.ok(farBright>threshold);
 assert.ok(farDim<threshold);
});
test('100% normalized spatial filtering follows temporal phosphor reconstruction',()=>{
 const pass=fs.readFileSync(new URL('../phosphor-persistence.js',import.meta.url),'utf8');
 for(const expected of ['opticalFragment','tEmission','quad.material=optical',
  'quad.material=native','W_CENTER','W_AXIS','W_DIAGONAL','W_OUTER',
  'uPixelStep','PHOSPHOR_OPTICS.pixelPitch',
  'uDecayTau','uRiseTau','uReset','exp(-uDelta/max'])
  assert.ok(pass.includes(expected),expected);
 assert.ok(pass.indexOf('quad.material=update')<
  pass.indexOf('quad.material=native'));
 assert.ok(pass.indexOf('quad.material=native')<
  pass.indexOf('quad.material=optical'));
 assert.ok(pass.includes('emission=make(width,height)'), 'native resolution PSF source');
 assert.ok(!pass.includes('uSpreadFraction'));
 assert.ok(!pass.includes('mix(core,scattered'));
 assert.ok(!/uPhase|uCycles|uHz|uLines|CRT_REFRESH|ageCycles/.test(pass));
 assert.ok(!pass.includes('uTint'));
});
