import {describe,test} from 'node:test';
import {instrumentCompositorPasses} from '../tetris/diagnostics.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PHOSPHOR_BOUNDS,normalizePersistenceMs,integratePhosphorResponse,createButtonFeedback,MAX_BUTTON_FLASHES,BUTTON_FLASH_PEAK_MS,BUTTON_AFTERGLOW_MS,BUTTON_FLASH_TOTAL_MS,BUTTON_BASE_LEVEL,BUTTON_PEAK_LEVEL,buttonLevel,buttonInkLevel,buttonFeedbackLayers,createRenderInvalidation,createGpuButtonLighting,excitedButtonGray,GPU_BUTTON_CAPACITY,controlsBounds} from '../tetris/crt.js';
import {makeSliderControl,sliderValueAt} from '../tetris/input.js';
import {DISPLAY_EFFECTS,createActionController,createScreenManager,SCREENS} from '../tetris/game.js';
import {createCanvasUI,createHudDrawing} from '../tetris/ui.js';
import Layout from '../tetris/layout.js';

const appDir=fileURLToPath(new URL('../tetris',import.meta.url));

describe('CRT composition',()=>{
 const source=fs.readFileSync(path.join(appDir,'crt.js'),'utf8');
 const compositor=source.slice(source.indexOf('const MENU_BLUR_PERCENT='),source.indexOf('export const MAX_BUTTON_FLASHES='));

 function setup(){
  const instances=[],textures=[];
  class Vec2{constructor(x,y){this.x=x;this.y=y;}set(x,y){this.x=x;this.y=y;return this;}}
  class Vec3{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}copy(o){this.x=o.x;this.y=o.y;this.z=o.z;return this;}}
  class Vec4{constructor(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;}set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}}
  class Color{constructor(value){this.value=value;}}
  class Texture{constructor(canvas){this.canvas=canvas;this.disposed=false;textures.push(this);}dispose(){this.disposed=true;}}
  class EffectComposer{
   constructor(){this.passes=[];this.renderCount=0;this.disposed=false;instances.push(this);}
   addPass(p){this.passes.push(p);}
   render(){this.renderCount++;}
   setPixelRatio(dpr){this.dpr=dpr;}
   setSize(w,h){this.size=[w,h];}
   dispose(){this.disposed=true;}
  }
  class RenderPass{constructor(){this.label='RENDER';}dispose(){this.disposeCount=(this.disposeCount||0)+1;}}
  class UnrealBloomPass{constructor(){this.label='BLOOM';this.highPassUniforms={smoothWidth:{value:0}};}dispose(){this.disposeCount=(this.disposeCount||0)+1;}}
  class ShaderPass{
   constructor(shader){
    this.uniforms=shader.uniforms;
    const u=this.uniforms;
    this.label='uComposite' in u ? (u.uComposite.value?'BOARD POPUP':'BOARD BLUR'):
     'uX' in u?'GHOST':'uTint' in u?'PHOSPHOR':
     'uRadius' in u?'SOFTNESS':'uStart' in u?'VIGNETTE':
     'uPattern' in u?'CRT':'uOffset' in u?'ROLL':'UNKNOWN';
   }
   dispose(){this.disposeCount=(this.disposeCount||0)+1;}
  }
  class OutputPass{constructor(){this.label='OUTPUT';}dispose(){this.disposeCount=(this.disposeCount||0)+1;}}
  function createPhosphorPersistencePass(){return {
   label:'HISTORY',enabled:false,needsSwap:true,resetCount:0,
   configure(ms){this.ms=ms;},reset(){this.resetCount++;},
   setSize(w,h){this.size=[w,h];},
   dispose(){this.disposeCount=(this.disposeCount||0)+1;}
  };}
  const THREE={
   Vector2:Vec2,Vector3:Vec3,Vector4:Vec4,Color,CanvasTexture:Texture,
   RepeatWrapping:'repeat',NearestFilter:'nearest'
  };
  const document={createElement:()=>({
   width:0,height:0,
   getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})
  })};
  const clamp=source.match(/^const clamp=.*;$/m)[0];
  const standalone=clamp+'\n'+compositor.replace('export function createCompositor','function createCompositor');
  const factory=new Function('THREE','EffectComposer','RenderPass','UnrealBloomPass','ShaderPass','OutputPass','document','instrumentCompositorPasses',
   'createPhosphorPersistencePass',
   standalone+'\nreturn createCompositor;')
   (THREE,EffectComposer,RenderPass,UnrealBloomPass,ShaderPass,OutputPass,document,instrumentCompositorPasses,
    createPhosphorPersistencePass);
  const externalPopup={external:true};
  const pipeline=factory({renderer:{},scene:{},camera:{},boardPopupTexture:externalPopup});
  return {pipeline,composer:instances[0],externalPopup,instances,textures};
 }
 const states={
  phosphor:true,bloom:true,bloomStrength:.3,ghost:true,ghostX:2,ghostY:0,ghostStrength:22,
  softness:true,softnessStrength:.64,softnessRadius:3,vignette:true,vignetteAmount:.39,
  scanlines:true,scanlineOpacity:20,scanlinePreset:'original',
  persistence:true,persistenceMs:120
 };
 const update=(pipeline,override={})=>pipeline.syncFX({
  fx:{...states,...override},theme:'green',width:393,height:852,dpr:3,
  boardStatus:'playing',popupStatus:'ready',modalOpen:false,
  layoutInfo:{boardX:11,boardY:120,boardW:234.5,boardH:469}
 });
 test('pass order remains exactly the approved version',()=>{
  const {composer}=setup();
  assert.deepEqual(composer.passes.map(p=>p.label),[
   'RENDER','BOARD BLUR','BOARD POPUP','HISTORY','GHOST','BLOOM',
   'PHOSPHOR','SOFTNESS','VIGNETTE','CRT','ROLL','OUTPUT'
  ]);
 });
 test('display effect settings target their own passes',()=>{
  const {pipeline,composer}=setup();
  update(pipeline);
  const p=composer.passes;
  assert.equal(p[3].enabled,true,'history active');
  assert.equal(p[3].ms,120);
  assert.equal(p[4].enabled,true);
  assert.equal(p[4].uniforms.uStrength.value,.22);
  assert.equal(p[5].enabled,true);
  assert.equal(p[5].strength,.3);
  assert.equal(p[6].uniforms.uEnabled.value,1);
  assert.equal(p[7].enabled,true);
  assert.equal(p[8].enabled,true);
  assert.equal(p[9].enabled,true,'scanline mask must work with persistence');
  assert.equal(p[9].uniforms.uScreenHeight.value,2556);
  const green=p[6].uniforms.uTint.value;
  assert.equal(green.x,.2);
  assert.equal(green.z,.2);
  update(pipeline,{persistence:true,persistenceMs:80});
  assert.equal(p[3].ms,80);
  assert.equal(p[6].uniforms.uTint.value.x,.2,'hue must be independent of persistence');
  update(pipeline,{ghost:false,bloom:false,phosphor:false,softness:false,vignette:false,scanlines:false,persistence:false});
  for(const i of [3,4,5,7,8,9])assert.equal(p[i].enabled,false);
  assert.equal(p[6].uniforms.uEnabled.value,0);
  const before=p[3].resetCount;
  update(pipeline,{persistence:true,persistenceMs:110});
  assert.equal(p[3].ms,110);
  assert.ok(p[3].resetCount>before);
 });
 test('whole-screen decay and tint stay independent; optional legacy mask is separate',()=>{
  const {pipeline,composer}=setup();
  update(pipeline,{persistence:true,persistenceMs:120});
  const p=composer.passes;
  assert.equal(p[9].enabled,true);
  update(pipeline,{persistence:true,persistenceMs:90});
  assert.equal(p[3].ms,90);
  assert.equal(p[6].uniforms.uTint.value.x,.2);
  update(pipeline,{persistence:true,persistenceMs:100});
  assert.equal(p[9].enabled,true);
  assert.equal(p[3].ms,100);
  update(pipeline,{persistence:false});
  assert.equal(p[9].enabled,true,'legacy static scanline mask is restored');
  assert.equal(p[6].uniforms.uTint.value.x,.2,'legacy hue preserved');
  pipeline.dispose();
 });
 test('scanlines and bloom are separately controllable with phosphor persistence',()=>{
  const {pipeline,composer}=setup();
  const p=composer.passes;
  update(pipeline,{persistence:true,scanlines:true,scanlineOpacity:49,bloom:false});
  assert.equal(p[3].enabled,true,'phosphor history remains enabled');
  assert.equal(p[5].enabled,false,'Bloom alone governs external glow');
  assert.equal(p[9].enabled,true,'static scanlines survive persistence');
  assert.equal(p[9].uniforms.uOpacity.value,.49);
  update(pipeline,{scanlines:false,bloom:true,persistence:true});
  assert.equal(p[9].enabled,false);
  assert.equal(p[5].enabled,true);
  update(pipeline,{scanlines:true,bloom:false,persistence:false});
  assert.equal(p[9].enabled,true,'scanlines do not depend on persistence');
  assert.equal(p[3].enabled,false);
  pipeline.dispose();
 });
 test('original NOMAD green and amber are unchanged by persistence or decay',()=>{
  const {pipeline,composer}=setup();
  const tint=composer.passes[6];
  const expected={green:[.2,1,.2],amber:[185/255,79/255,9/255]};
  const rgba=()=>[tint.uniforms.uTint.value.x,tint.uniforms.uTint.value.y,tint.uniforms.uTint.value.z];
  for(const theme of ['green','amber']){
   for(const enabled of [true,false]){
    for(const ms of [10,70,120]){
     pipeline.syncFX({fx:{...states,persistence:enabled,persistenceMs:ms},
      theme,width:393,height:852,dpr:3,boardStatus:'playing',
      popupStatus:'ready',modalOpen:false,
      layoutInfo:{boardX:11,boardY:120,boardW:234.5,boardH:469}});
     assert.deepEqual(rgba(),expected[theme],
      `${theme} tint changed with phosphor history ${enabled}/${ms}`);
    }
   }
  }
  pipeline.dispose();
 });
 test('board blur appears only for active READY/PAUSED/OVER popup',()=>{
  const {pipeline,composer}=setup();
  const state={fx:states,theme:'green',width:393,height:852,dpr:3,
   boardStatus:'ready',popupStatus:'ready',modalOpen:false,
   layoutInfo:{boardX:11,boardY:120,boardW:234.5,boardH:469}};
  pipeline.syncFX(state);
  assert.equal(composer.passes[1].enabled,true);
  assert.equal(composer.passes[2].enabled,true);
  assert.ok(composer.passes[2].uniforms.uRect.value.z>composer.passes[2].uniforms.uRect.value.x);
  state.modalOpen=true;
  pipeline.syncFX(state);
  assert.equal(composer.passes[1].enabled,false);
  assert.equal(composer.passes[2].enabled,false);
  // The board is blurred and faded behind Top Five, despite an open modal.
  state.scoresOverlay=true;
  pipeline.syncFX(state);
  assert.equal(composer.passes[1].enabled,true);
  assert.equal(composer.passes[2].enabled,true);
  // Never blur active play, even when scoresOverlay is passed unexpectedly.
  state.boardStatus='playing';
  pipeline.syncFX(state);
  assert.equal(composer.passes[1].enabled,false);
  assert.equal(composer.passes[2].enabled,false);
 });
 test('CRT patterns have stable original order and fallback',()=>{
  const {pipeline}=setup();
  assert.deepEqual(pipeline.SCANLINE_PRESETS.map(p=>p.id),
   ['original','horizontal','aperture','slot','dot']);
  assert.equal(pipeline.activeScanlinePreset('invalid').id,'original');
  assert.equal(pipeline.activeScanlinePreset('dot').id,'dot');
 });
 test('resize updates GPU sampling sizes and disposal releases owned textures',()=>{
  const {pipeline,composer,externalPopup,textures}=setup();
  pipeline.resize(844,390,3);
  assert.deepEqual(composer.size,[844,390]);
  assert.equal(composer.dpr,3);
  for(const i of [1,2,4,7]){
   assert.equal(composer.passes[i].uniforms.uSize.value.x,844);
   assert.equal(composer.passes[i].uniforms.uSize.value.y,390);
  }
  pipeline.render();
  assert.equal(composer.renderCount,1);
  assert.equal(pipeline.dispose(),true);
  assert.equal(composer.disposed,true);
  assert.equal(externalPopup.disposed,undefined);
  assert.ok(composer.passes.length>=10);
  for(const pass of composer.passes)
   assert.equal(pass.disposeCount,1,pass.label+' must dispose owned resources');
  assert.ok(textures.length>=5);
  assert.ok(textures.every(texture=>texture.disposed),'CRT pattern textures must all be released');
  assert.equal(pipeline.dispose(),false,'cleanup is idempotent');
  for(const pass of composer.passes)assert.equal(pass.disposeCount,1);
 });
 test('a failing compositor pass cannot prevent other effects or composer cleanup',()=>{
  const {pipeline,composer,textures}=setup();
  const failing=composer.passes[2];
  failing.dispose=()=>{throw Error('failed shader cleanup')};
  assert.throws(()=>pipeline.dispose(),/failed shader cleanup/);
  assert.equal(composer.disposed,true);
  assert.equal(composer.passes.at(-1).disposeCount,1);
  assert.ok(textures.every(texture=>texture.disposed));
  assert.equal(pipeline.dispose(),false);
 });

 test('button presses are source owned; no compositor brightening overlay exists',()=>{
  const {pipeline,composer}=setup();
  assert.ok(composer.passes.every(p=>p.label!=='BUTTON RESPONSE'));
  assert.equal(typeof pipeline.syncButtonFeedback,'undefined');
  assert.equal(composer.passes[3].label,'HISTORY');
  assert.doesNotMatch(compositor,/BUTTON_FEEDBACK|buttonPulsePass|uRects\[/);
  pipeline.dispose();
 });
});

describe('Phosphor persistence',()=>{
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
  const source=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
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
 const pipeline=fs.readFileSync(new URL('../tetris/crt.js',import.meta.url),'utf8');
 const pass=pipeline.slice(pipeline.indexOf('const vertex='),pipeline.indexOf('const MENU_BLUR_PERCENT='));

 test('postcomposition luminance response has no scanning logic',()=>{
  assert.match(pass,/tSource/);
  assert.match(pass,/tPrevious/);
  assert.match(pass,/uDecayTau/);
  assert.match(pass,/uRiseTau/);
  assert.match(pass,/exp\(-uDelta\/max/);
  assert.match(pass,/sqrt\(clamp\(emitted/);
  assert.match(pass,/WebGLRenderTarget/);
  assert.match(pass,/float emitted=drive\+\(previous-drive\)\*exp/);
  assert.doesNotMatch(pass,/uPhase|uCycles|uHz|uLines|CRT_REFRESH|ageCycles/);
  assert.doesNotMatch(pass,/uTint/);
  const layout=pipeline.indexOf('composer.addPass(new RenderPass');
  const history=pipeline.indexOf('composer.addPass(persistencePass)');
  const glow=pipeline.indexOf('composer.addPass(glow)');
  assert.ok(layout>=0&&layout<history&&history<glow,
   'phosphor is a whole-display effect between composed scene and bloom/tint');
  assert.match(pipeline,/persistencePass\.configure\(fx\.persistenceMs\)/);
 });

 test('temporal phosphor does not spread or add light between neighbouring pixels',()=>{
  // No spatial filter, synthetic broadening, channel interpolation,
  // optical render targets or user-independent glow from persistence.
  for(const removed of ['W_CENTER','W_AXIS','W_OUTER','W_DIAGONAL',
   'opticalFragment','reconstructedFragment','tEmission','uPixelStep',
   'PHOSPHOR_OPTICS','uSpreadFraction','tSpread','quad.material=optical'])
   assert.ok(!pass.includes(removed),`unwanted spatial effect: ${removed}`);
  assert.match(pass,/new THREE.WebGLRenderTarget\(width,height,options\)/);
  assert.match(pass,/minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter/);
  assert.match(pass,/float emitted=drive\+\(previous-drive\)\*exp/);
  assert.match(pass,/float encoded=texture2D\(tHistory,vUv\)\.r/);
  assert.match(pass,/float emitted=encoded\*encoded/);
  assert.match(pass,/quad.material=update/);
  assert.match(pass,/quad.material=output/);
  assert.ok(pass.indexOf('quad.material=update')<pass.indexOf('quad.material=output'));
 });
 test('independent pixel persistence leaves all neighbouring dark pixels dark',()=>{
  const bright=integratePhosphorResponse(1,0,.03,120);
  const neighbors=Array(8).fill(0).map(()=>integratePhosphorResponse(0,0,.03,120));
  assert.ok(bright>0&&bright<1);
  assert.ok(neighbors.every(x=>x===0));
 });
});

describe('Button luminance',()=>{
 const solid={x:20,y:40,w:83,h:44,kind:'button',light:true};
 const outline={x:150,y:40,w:83,h:44,kind:'button',light:false};
 test('held buttons stay at full luminance until release, then fade',()=>{
  const f=createButtonFeedback();
  assert.equal(f.press(solid,1000),true);
  assert.deepEqual(f.sample(1000),[{x:20,y:40,w:83,h:44,power:1}]);
  assert.equal(f.sample(9000)[0].power,1);
  assert.equal(f.release(solid,9000),true);
  assert.equal(f.sample(9000)[0].power,1);
  assert.ok(f.sample(9205)[0].power>0&&f.sample(9205)[0].power<1);
  assert.deepEqual(f.sample(9000+BUTTON_AFTERGLOW_MS),[]);
  assert.equal(f.count,0);
 });
 test('filled, outlined and icon controls all share the same source peak',()=>{
  const f=createButtonFeedback();
  f.press(solid,0);
  f.press(outline,0);
  f.press({x:0,y:0,w:15,h:15,kind:'toggle'},0);
  assert.deepEqual(f.sample(20).map(hit=>buttonLevel(hit.power)),[255,255,255]);
 });
 test('keyboard taps remain bounded without keyup',()=>{
  const f=createButtonFeedback();
  f.press(solid,1000,false);
  assert.equal(f.sample(1000+BUTTON_FLASH_PEAK_MS)[0].power,1);
  assert.ok(f.sample(1000+BUTTON_FLASH_PEAK_MS+100)[0].power<1);
  assert.deepEqual(f.sample(1000+BUTTON_FLASH_TOTAL_MS),[]);
 });
 test('repeated presses restart same hit without affecting independent controls',()=>{
  const f=createButtonFeedback();
  f.press(solid,0);f.press(outline,10);
  f.release(solid,20);
  f.press(solid,150);
  assert.equal(f.count,2);
  assert.deepEqual(f.sample(150).map(h=>h.power),[1,1]);
  assert.equal(f.release(outline,200),true);
  assert.equal(f.release(solid,300),true);
  assert.deepEqual(f.sample(800),[]);
 });
 test('feedback remains bounded, validates geometry, and clears on navigation',()=>{
  const f=createButtonFeedback();
  assert.equal(f.press(null,0),false);
  assert.equal(f.press({x:NaN,y:0,w:10,h:20},0),false);
  assert.equal(f.press({x:0,y:0,w:10,h:0},0),false);
  assert.equal(f.release(solid,Infinity),false);
  for(let i=0;i<100;i++)f.press({x:i*12,y:0,w:10,h:10},i);
  assert.equal(f.count,MAX_BUTTON_FLASHES);
  assert.equal(f.clear(),true);
  assert.deepEqual(f.sample(100),[]);
  assert.equal(f.clear(),false);
 });
 test('all active button geometry is 206 at rest and reaches 255 on press',()=>{
  assert.equal(BUTTON_BASE_LEVEL,206);
  assert.equal(BUTTON_PEAK_LEVEL,255);
  assert.equal(buttonLevel(0),206);
  assert.equal(buttonLevel(.5),231);
  assert.equal(buttonLevel(1),255);
  assert.equal(buttonLevel(-5),206);
  assert.equal(buttonLevel(9),255);
  assert.equal(buttonInkLevel(0),6);
  assert.equal(buttonInkLevel(1),30);
  assert.ok(buttonInkLevel(1)<buttonLevel(1),'solid dark text stays legible');
  assert.ok(BUTTON_FLASH_TOTAL_MS<700);
 });
 test('physical phosphor mode stops excitation on release instead of double-fading',()=>{
  const f=createButtonFeedback();
  const hit={x:12,y:22,w:40,h:40,kind:'button',light:true};
  f.press(hit,0,true);
  assert.equal(f.sample(100,true)[0].power,1);
  f.release(hit,200);
  assert.deepEqual(f.sample(200,true),[]);
  assert.equal(f.count,0);
  // A keyboard pulse has a minimum peak hold, then yields to GPU history.
  f.press(hit,1000,false);
  assert.equal(f.sample(1070,true)[0].power,1);
  assert.deepEqual(f.sample(1100,true),[]);
  // Unmodified V096 baseline still has its quadratic fade.
  f.press(hit,2000,true);f.release(hit,2010);
  assert.ok(f.sample(2100,false)[0].power>0);
 });

 test('fast touch is latched for one frame but never given the cosmetic fade in physical mode',()=>{
  const f=createButtonFeedback();
  const hit={x:12,y:22,w:40,h:40,kind:'button',light:true};
  f.press(hit,1000,true);f.release(hit,1000);
  assert.equal(f.sample(1016,true)[0].power,1);
  assert.deepEqual(f.sample(1035,true),[]);
 });
});

describe('Canvas button drawing',()=>{
 function drawKey(light=false,power=0,arrow=false){
  const calls=[],regions=[];
  const g={
   fillStyle:'',strokeStyle:'',
   beginPath(){},roundRect(){},
   fill(){calls.push({type:'fill',color:this.fillStyle});},
   stroke(){calls.push({type:'stroke',color:this.strokeStyle});},
   measureText(label){return {width:String(label).length*8,
    actualBoundingBoxAscent:10,actualBoundingBoxDescent:3};},
   fillText(value){calls.push({type:'glyph',color:this.fillStyle,value});}
  };
  const ui=createCanvasUI({
   getContext:()=>g,getRegions:()=>regions,getButtonPower:()=>power,
   C:{panel:'#1d1d1d',button:'#080808',ink:'#e3e3e3',border:'#777777'},
   FONT:'sans-serif',ICON_FONT:'sans-serif',TERMINAL_FONT:'monospace',
   LETTER_SPACING_EM:0.13,
   MAIN_ACTION_LABELS:new Set(['DROP']),
   BUTTON_ICON_LABELS:new Set(['▶']),
   MAIN_ACTION_FONT_SIZE:16,BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
  });
  ui.key('DROP',20,40,90,45,'hard',{light,arrow});
  return {calls,ui,regions};
 }
 test('unfilled buttons excite outlines, labels and optional icons without filling',()=>{
  for(const [power,lit] of [[0,206],[1,255]]){
   const {calls,regions}=drawKey(false,power,true);
   assert.deepEqual(calls.map(c=>c.type),['fill','stroke','glyph','glyph']);
   assert.equal(calls[0].color,'#080808','no filled pressed rectangle');
   for(const call of calls.slice(1))assert.equal(call.color,
    'rgb('+lit+','+lit+','+lit+')',call.type);
   assert.equal(regions[0].kind,'button');
  }
 });
 test('filled buttons excite face and stroke but preserve contrasting moving glyphs',()=>{
  for(const [power,lit,ink] of [[0,206,6],[1,255,30]]){
   const {calls}=drawKey(true,power,true);
   assert.equal(calls[0].color,'rgb('+lit+','+lit+','+lit+')');
   assert.equal(calls[1].color,calls[0].color);
   for(const call of calls.slice(2))
    assert.equal(call.color,'rgb('+ink+','+ink+','+ink+')');
  }
 });
 test('other screen buttons use the same source brightness helper',()=>{
  const {ui}=drawKey();
  assert.equal(ui.buttonLight(20,40,90,45),206);
  const {ui:hot}=drawKey(false,1);
  assert.equal(hot.buttonLight(20,40,90,45),255);
  const modal=fs.readFileSync(new URL('../tetris/ui.js',import.meta.url),'utf8');
  for(const control of ['debugLum','toggleLum','pickerLum','choiceLum'])
   assert.ok(modal.includes(control),'modal control missing brightness: '+control);
  const game=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  assert.match(game,/getButtonPower:r=>\(g===controlsContext&&controlsGpuEnabled\)\?0:buttonSparks\.find/);
  assert.doesNotMatch(game,/syncButtonFeedback/);
 });

 test('PAUSE keeps its pressed luminance through immediate gameplay status changes',()=>{
  const game=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  const actions=game.slice(game.indexOf('handleAction:act=>'),
   game.indexOf('setSetting:actions.setSetting'));
  // Both pointer controls and keyboard controls must preserve PAUSE even
  // though action dispatch changes game status within the pointerdown turn.
  assert.equal((actions.match(/if\(game\.status!==previous&&act!=='pause'\)buttonFeedback\.clear\(\)/g)||[]).length,2);
  assert.ok(game.includes('buttonSparks=buttonFeedback.sample(now,phosphorOn)'));
  assert.match(game,/else if\(act&&!controlsGpuEnabled\)layers\.mark\('controls'\)/);
 });
});

describe('Menus and visual controls',()=>{
 test('V165 solid buttons use flat original luminance, not a gradient',()=>{
  const gradients=[],fills=[],borders=[],regions=[];
  const g={
   beginPath(){},roundRect(){},
   fill(){fills.push(this.fillStyle);},
   stroke(){borders.push(this.strokeStyle);},
   createLinearGradient(...coords){
    const v={coords,stops:[],addColorStop(at,color){this.stops.push([at,color]);}};
    gradients.push(v);return v;
   },
   measureText(s){return {width:String(s).length*8,
    actualBoundingBoxAscent:8,actualBoundingBoxDescent:2}},
   fillText(){}
  };
  const ui=createCanvasUI({
   getContext:()=>g,getRegions:()=>regions,
   C:{panel:'#1d1d1d',border:'#777777',button:'#080808',ink:'#e3e3e3'},
   FONT:'monospace',LETTER_SPACING_EM:.13,MAIN_ACTION_LABELS:new Set(['DROP']),
   BUTTON_ICON_LABELS:new Set(),MAIN_ACTION_FONT_SIZE:16,
   BUTTON_FONT_SIZE:14,BUTTON_ICON_FONT_SIZE:18
  });
  ui.key('DROP',4,6,100,50,'soft',{light:true});
  ui.key('PAUSE',110,6,80,50,'pause');
  assert.equal(gradients.length,0,'flat solid faces make no gradients');
  assert.equal(fills[0],'rgb(206,206,206)','solid face uses full baseline luminance');
  assert.equal(borders[0],'rgb(206,206,206)');
  assert.equal(fills[1],'#080808','unfilled controls stay unchanged');
  assert.deepEqual(regions.map(r=>[r.x,r.y,r.w,r.h]),
   [[4,6,100,50],[110,6,80,50]]);
 });
 test('Restart is immediate and preserves old score before reset',()=>{
  let resetCount=0,startCount=0,closeCount=0,records=0;
  const game={
   score:188,lines:6,level:2,status:'paused',
   reset(){resetCount++;this.status='ready';this.score=0;this.lines=0;},
   start(){startCount++;this.status='playing';}
  };
  const controller=createActionController({
   game,storage:{},settings:{},
   scores:{read:()=>({score:0}),update:()=>{records++;return {score:188};}},
   screens:{close(){closeCount++;},requestRestart(){throw Error('Dialog must not open');}},
   getLineClearActive:()=>false,clearLineClear(){},markLayers(){},invalidate(){},
   tone(){},onCopyDebug(){},onResetSettingsUI(){}
  });
  controller.dispatch('restart');
  assert.equal(resetCount,1);
  assert.equal(startCount,1);
  assert.equal(closeCount,1);
  assert.equal(records,1);
  assert.equal(game.status,'playing');
  const screens=createScreenManager({
   getGameStatus:()=>game.status,pauseGame(){},onChange(){}
  });
  assert.equal(screens.requestRestart,undefined);
  assert.equal(SCREENS.RESTART,undefined);
 });
 test('blur has its own sharp overlaid inset shadow; no old dialog remains',()=>{
  const renderer=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  const modal=fs.readFileSync(new URL('../tetris/ui.js',import.meta.url),'utf8');
  const hud=fs.readFileSync(new URL('../tetris/ui.js',import.meta.url),'utf8');
  assert.match(renderer,/function drawSharpBoardInsetShadow\(r\)/);
  assert.match(renderer,/if\(!screenManager\.isScores\)drawSharpBoardInsetShadow\(r\)/);
  assert.match(renderer,/g=boardPopupContext;/);
  assert.match(renderer,/key\('RESTART'.*'restart'\)/);
  assert.doesNotMatch(renderer,/key\('NEW GAME'/);
  assert.doesNotMatch(modal,/START NEW GAME\?|YES, RESTART|drawRestart/);
  assert.match(hud,/panel\(x\+rim,y\+rim,w-rim\*2,h-rim\*2,0,null,C\.bright\)/);
  assert.match(renderer,/rect\(titleX-5,r\.hy\+r\.hh\*\.27,1,r\.hh\*\.46,C\.bright\)/);
 });
});

describe('Button repaint regions',()=>{
 const bounds={dx:30,dy:630,dw:333,dh:140};
 const box=(x,y,w=58,h=34)=>({x,y,w,h});
 const deck=box(45,649),header=box(315,81,30,30),
  popup=box(88,300,155,40);

 test('deck-only press changes only cropped controls, not the full-screen base',()=>{
  assert.deepEqual(buttonFeedbackLayers([], [deck],bounds),['controls']);
  assert.deepEqual(buttonFeedbackLayers([deck],[deck],bounds),['controls']);
  assert.deepEqual(buttonFeedbackLayers([deck],[],bounds),['controls'],
   'last illuminated frame gets repainted after release');
 });

 test('header and board-status popup buttons still repaint the base',()=>{
  assert.deepEqual(buttonFeedbackLayers([], [header],bounds),['base']);
  assert.deepEqual(buttonFeedbackLayers([], [popup],bounds),['base']);
  assert.deepEqual(buttonFeedbackLayers([], [deck,header],bounds),['base','controls']);
  assert.deepEqual(buttonFeedbackLayers([deck], [header],bounds),['base','controls']);
 });

 test('unknown or out-of-bounds button rectangles conservatively redraw base',()=>{
  assert.deepEqual(buttonFeedbackLayers([], [box(360,645,14,40)],bounds),['base']);
  assert.deepEqual(buttonFeedbackLayers([], [deck],null),['base']);
  assert.deepEqual(buttonFeedbackLayers([], [box(NaN,0)],bounds),['base']);
  assert.deepEqual(buttonFeedbackLayers([], [],bounds),[]);
 });

 test('actual button afterglow is tracked through fade and final disappearance',()=>{
  const b=createButtonFeedback();
  assert.equal(BUTTON_BASE_LEVEL,206);
  assert.equal(BUTTON_PEAK_LEVEL,255);
  b.press({...deck,act:'soft'},0,true);
  let first=b.sample(0);
  assert.deepEqual(buttonFeedbackLayers([],first,bounds),['controls']);
  b.release({...deck,act:'soft'},50);
  let after=b.sample(100);
  assert.ok(after.length&&after[0].power>0&&after[0].power<1);
  assert.deepEqual(buttonFeedbackLayers(first,after,bounds),['controls']);
  const gone=b.sample(1000);
  assert.equal(gone.length,0);
  assert.deepEqual(buttonFeedbackLayers(after,gone,bounds),['controls']);
 });

 test('renderer asks for affected layers instead of always marking base',()=>{
  const src=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  const start=src.indexOf('const previousButtonSparks=buttonSparks;');
  const end=src.indexOf("if(layers.needsRender())",start);
  assert.ok(start>0&&end>start);
  const part=src.slice(start,end);
  assert.match(part,/buttonFeedbackLayers\(/);
  assert.match(part,/previousButtonSparks,buttonSparks,layoutInfo\|\|layout\(\)/);
  assert.match(part,/const canvasAffected=controlsGpuEnabled\?/);
  assert.match(part,/affected\.filter\(name=>name!=='controls'\):affected/);
  assert.match(part,/layers\.mark\(\.\.\.canvasAffected\)/);
  assert.doesNotMatch(part,/layers\.mark\('base','controls'\)/);
  assert.match(src,/key\('◐'.*'theme'\)/);
  assert.match(src,/drawControls\(r\)/);
 });
});

describe('Modal repaint regions',()=>{
 const source=()=>fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');

 test('modal can be marked and consumed independently of terminal and controls',()=>{
  const layers=createRenderInvalidation([]);
  assert.equal(layers.needs('modal'),false);
  layers.mark('modal');
  assert.equal(layers.needsRender(),true);
  assert.equal(layers.needs('base'),false);
  const reasons=layers.beginRender();
  assert.deepEqual(reasons,['startup']);
  assert.equal(layers.consume('modal'),true);
  assert.equal(layers.needs('modal'),false);
  layers.mark('controls');layers.reason('terminal-log');
  assert.deepEqual(layers.beginRender(),['terminal-log']);
  assert.equal(layers.needs('modal'),false,
   'typing behind menu does not dirtify its texture');
  assert.equal(layers.consume('controls'),true);
  assert.equal(layers.needsRender(),false);
 });

 test('twenty terminal updates require zero modal redraws after initial paint',()=>{
  const layers=createRenderInvalidation([]);
  layers.mark('modal');layers.beginRender();
  let modalPaints=0;
  if(layers.consume('modal'))modalPaints++;
  for(let i=0;i<20;i++){
   layers.mark('controls');layers.reason('terminal-log');
   layers.beginRender();
   if(layers.consume('modal'))modalPaints++;
   layers.consume('controls');
  }
  assert.equal(modalPaints,1);
 });

 test('renderer only repaints modal on dirty state, first show or base repaint',()=>{
  const s=source();
  const paint=s.slice(s.indexOf('function paintGame(){'),s.indexOf('const SCANLINE_CHOICES='));
  assert.match(paint,/if\(paintedBase\)layers\.mark\('modal'\)/);
  assert.match(paint,/if\(layers\.consume\('modal'\)\|\|!modalPlane\.visible\)/);
  assert.match(paint,/paintModalOverlay\(\)/);
  assert.match(paint,/layers\.consume\('modal'\);/);
  assert.doesNotMatch(paint,/if\(screenManager\.paintsModalLayer\)\{\s*const started=performance\.now\(\)/);
  assert.match(s,/const canvasDirty=\['base','board','sidebar','controls','terminal','modal'\]/);
 });

 test('settings, presses, viewport changes and asynchronous clipboard results mark modal',()=>{
  const s=source();
  const invalidate=s.slice(s.indexOf("function invalidate(reason='input')"),
   s.indexOf('// The core owns piece locking',s.indexOf("function invalidate(reason='input')")));
  assert.match(invalidate,/screenManager\.paintsModalLayer/);
  for(const event of ['input','button-press','button-release','resize',
   'resume','context-restored','font-ready'])
   assert.ok(invalidate.includes("'"+event+"'"),event+' must trigger menu refresh');
  assert.doesNotMatch(invalidate,/'(?:terminal-log|terminal-event|gravity|phosphor-history)'/);
  assert.match(invalidate,/layers\.mark\('modal'\)/);
  assert.match(s,/modalUI\.debugCopyState=success\?'copied':'failed';invalidate\(\)/);
  assert.match(s,/setOptionsScroll:v=>\{modalUI\.scroll=v;\}/);
  assert.match(s,/else\{layers\.mark\('modal'\);layers\.reason\('scroll'\);\}/);
 });

 test('menu button luminance targets modal, never hidden base, while visible',()=>{
  const s=source();
  const paint=s.slice(s.indexOf('const previousButtonSparks=buttonSparks;'),
   s.indexOf('if(layers.needsRender())',s.indexOf('const previousButtonSparks=buttonSparks;')));
  assert.match(paint,/if\(screenManager\.paintsModalLayer\)/);
  assert.match(paint,/if\(buttonSparks\.length\|\|previousButtonSparks\.length\)layers\.mark\('modal'\)/);
  assert.match(paint,/else\{\s*const affected=buttonFeedbackLayers\(/);
  assert.match(s,/if\(previous==='options'&&next!=='options'\)layers\.mark\('base','controls','terminal'\)/);
  assert.match(s,/if\(previous==='options'\|\|next==='options'\)layers\.mark\('modal'\)/);
 });

 test('modal texture upload occurs only when marked and never forces unrelated GPU readback',()=>{
  const s=source();
  const paint=s.slice(s.indexOf('function paintModalOverlay(){'),
   s.indexOf('inputController=createInputController(',s.indexOf('function paintModalOverlay(){')));
  assert.match(paint,/modalTexture\.needsUpdate=true/);
  assert.match(paint,/perf\.textureChanged\('modal'\)/);
  assert.match(s,/if\(modalPlane\.visible\)textureUploads\.upload\(modalTexture,'modal'\)/);
  assert.doesNotMatch(paint,/readPixels|toDataURL|getImageData/);
 });
});

describe('GPU button lighting',()=>{
 class Vector4{
  constructor(x=0,y=0,z=0,w=0){this.set(x,y,z,w);}
  set(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;return this;}
 }
 class ShaderMaterial{
  constructor(args){Object.assign(this,args);}
 }
 const THREE={ShaderMaterial,Vector4,DoubleSide:2};
 const make=()=>createGpuButtonLighting({THREE,texture:{colorSpace:'srgb'}});

 const ui={
  unit:6,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,
  padX:11,stackGap:6,side:93,sideGap:6,headHeight:80,headIcons:46,
  headIconGap:6,headRightPad:6,headTitleInset:17,deckBottom:30,
  deckPad:6,scoreHeight:45,deckGap:6,padGap:6,padHeight:53,
  extrasHeight:44,extrasGap:6,holdHeight:88,nextHeight:162,statsHeight:92
 };
 function realDeck(width,height,safe){
  const r=Layout.computeLayout(width,height,safe,ui);
  const buttons=[];
  const hud=createHudDrawing({
   panel(){},text(){},rect(){},getGame:()=>({queue:[],hold:null,
    score:0,level:0,lines:0}),
   key:(...args)=>{
    const [label,x,y,w,h,act,options={}]=args;
    const model={kind:'button',label,x,y,w,h,act,
     light:Boolean(options.light),repeat:Boolean(options.repeat)};
    buttons.push(model);
    return model;
   },
   smallPiece(){},C:{panel:'#1d1d1d'},UI_SPACE:{
    padGap:6,buttonWidthScale:.75,extrasGap:6
   },fmt:n=>String(n)
  });
  hud.drawControls(r);
  return {buttons,r,bounds:controlsBounds(r,width,height,2)};
 }

 test('shader has one texture, one draw call and the standard color management',()=>{
  const button=make();
  assert.equal(button.material.uniforms.uCount.value,0);
  assert.equal(button.material.uniforms.uExcited.value,0);
  assert.equal(button.material.transparent,false);
  assert.match(button.material.fragmentShader,/#include <colorspace_fragment>/);
  assert.match(button.material.fragmentShader,/texture2D\(uMap,vUv\)/);
  assert.match(button.material.fragmentShader,/decodeSRGB\(outEncoded\)/);
  assert.equal(GPU_BUTTON_CAPACITY,8);
 });

 test('solid button keeps full face/negative ink levels 206/6 to 255/30',()=>{
  assert.equal(buttonLevel(0),206);
  assert.equal(buttonLevel(1),255);
  assert.equal(buttonInkLevel(0),6);
  assert.equal(buttonInkLevel(1),30);
  for(const value of [6,20,60,106,170,206]){
   assert.equal(excitedButtonGray(value,{light:true,power:0}),value);
   const alpha=(206-value)/200;
   const expected=(1-alpha)*255+alpha*30;
   assert.ok(Math.abs(excitedButtonGray(value,{light:true,power:1})-expected)<1e-9);
  }
 });

 test('outlined buttons preserve black fill while brightening text and border',()=>{
  assert.equal(excitedButtonGray(8,{light:false,power:1}),8);
  assert.equal(excitedButtonGray(206,{light:false,power:1}),255);
  assert.equal(excitedButtonGray(107,{light:false,power:1}),131.5);
  assert.equal(excitedButtonGray(206,{light:false,power:0}),206);
 });

 test('the six original HUD buttons configure without changing positions',()=>{
  for(const [w,h,safe] of [
   [393,852,{top:59,bottom:34}],
   [320,568,{top:18,bottom:0}],
   [852,393,{top:0,bottom:20}],
   [280,600,{top:20,bottom:20}],
   [844,390,{left:59,right:59,bottom:21}]
  ]){
   const {buttons,bounds,r}=realDeck(w,h,safe);
   const shader=make();
   assert.deepEqual(buttons.map(b=>b.act),r.compactControls?
    ['left','cw','right','soft','hold','pause']:
    ['left','soft','right','cw','hold','pause']);
   assert.equal(shader.configure(buttons,bounds),true,w+'x'+h);
   assert.equal(shader.count,6);
   assert.deepEqual(shader.regions.map(b=>[b.x,b.y,b.w,b.h]),
    buttons.map(b=>[b.x,b.y,b.w,b.h]));
   for(const rect of shader.material.uniforms.uRects.value.slice(0,6)){
    assert.ok(rect.x>=0&&rect.y>=0&&rect.z<=1&&rect.w<=1);
    assert.ok(rect.x<rect.z&&rect.y<rect.w);
   }
  }
 });

 test('uniform changes illuminate and fade with no CanvasTexture mutation',()=>{
  const {buttons,bounds}=realDeck(393,852,{top:59,bottom:34});
  const texture={version:7,needsUpdate:false};
  const shader=createGpuButtonLighting({THREE,texture});
  assert.equal(shader.configure(buttons,bounds),true);
  assert.equal(shader.material.uniformsNeedUpdate,true);
  shader.material.uniformsNeedUpdate=false; // simulate successful WebGL draw
  assert.equal(shader.update([]),false);
  assert.equal(shader.material.uniformsNeedUpdate,false);
  const first=buttons[1];
  assert.equal(shader.update([{...first,power:1}]),true);
  assert.equal(shader.active,true);
  assert.equal(shader.material.uniformsNeedUpdate,true,
   'Three.js must upload newly excited face/ink uniforms');
  shader.material.uniformsNeedUpdate=false;
  assert.equal(shader.update([{...first,power:1}]),false);
  assert.equal(shader.material.uniformsNeedUpdate,false,
   'unchanged inputs must not force uniform transfer');
  const state=shader.material.uniforms.uLevels.value[1];
  assert.equal(state.y,1);
  assert.equal(state.z,30/255);
  assert.equal(state.w,1);
  assert.equal(shader.update([{...first,power:.5}]),true);
  assert.equal(shader.update([]),true);
  assert.equal(shader.active,false);
  assert.equal(shader.material.uniformsNeedUpdate,true,
   'the final afterglow frame must clear the shader uniformly');
  assert.equal(shader.update([]),false);
  assert.equal(texture.version,7);
  assert.equal(texture.needsUpdate,false);
 });

 test('only exact hitbox matches excite a button; invalid geometry is rejected',()=>{
  const shader=make(),{buttons,bounds}=realDeck(393,852,{top:59,bottom:34});
  assert.equal(shader.configure([],bounds),false);
  assert.equal(shader.configure(buttons.concat(buttons,buttons),bounds),false);
  assert.equal(shader.configure([{kind:'button',x:NaN,y:0,w:20,h:20}],bounds),false);
  assert.equal(shader.configure(buttons,bounds),true);
  assert.equal(shader.update([{...buttons[0],x:buttons[0].x+1,power:1}]),false);
  assert.equal(shader.active,false);
  assert.equal(shader.update([{...buttons[0],power:1}]),true);
  assert.equal(shader.material.uniforms.uLevels.value[0].z,30/255);
 });

 test('renderer keeps Canvas source at baseline and pushes excitation through uniforms',()=>{
  const src=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  assert.match(src,/controlsPlane\.material=controlLighting\.material/);
  assert.match(src,/g===controlsContext&&controlsGpuEnabled\)\?0:buttonSparks/);
  assert.match(src,/controlLighting\.configure\(regions,bounds\)/);
  assert.match(src,/controlLighting\.update\(buttonSparks\)/);
  assert.match(src,/canvasAffected=controlsGpuEnabled\?/);
  assert.match(src,/affected\.filter\(name=>name!=='controls'\):affected/);
  assert.match(src,/if\(game\.score!==prior\.score\|\|game\.lines!==prior\.lines\|\|\s*game\.level!==prior\.level\)layers\.mark\('sidebar'\)/);
  assert.doesNotMatch(src,/if\(act\)layers\.mark\('controls'\)/);
  const action=src.slice(src.indexOf("markLayers:(...names)=>"),
   src.indexOf('invalidate:()=>invalidate()',src.indexOf("markLayers:(...names)=>")));
  assert.match(action,/name!=='controls'/);
 });

 test('direct input score changes invalidate sidebar readouts, not the GPU controls',()=>{
  const game={status:'playing',score:0,lines:0,level:0,pieces:0,hold:null,
   softDrop(){this.score++;return true;}};
  const marked=[];
  const actions=createActionController({
   game,scores:{read:()=>({score:0}),
    update:(storage,best,next)=>next},storage:{},settings:{},
   screens:{close(){}},getLineClearActive:()=>false,clearLineClear(){},
   markLayers:(...layers)=>marked.push(...layers.filter(x=>x!=='controls')),
   invalidate(){},tone(){},onCopyDebug(){},onResetSettingsUI(){}
  });
  assert.equal(actions.perform('soft'),true);
  assert.equal(game.score,1);
  assert.deepEqual(marked,['board','sidebar']);
 });
 test('fallback is selectable and reports which button backend is active',()=>{
  const src=fs.readFileSync(new URL('../tetris/three-v027.js',import.meta.url),'utf8');
  assert.match(src,/maxFragmentUniforms>=32/);
  assert.match(src,/\.get\('buttonRenderer'\)==='canvas'/);
  assert.match(src,/controlsGpuEnabled\)\?0:buttonSparks/);
  assert.match(src,/if\(!controlLighting\.configure\(regions,bounds\)\)disableGpuControls\(\)/);
  assert.match(src,/buttonRenderer:controlsGpuEnabled\?'GPU uniforms':'Canvas2D fallback'/);
 });
});
