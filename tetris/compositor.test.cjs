/* Run: node --test tetris/compositor.test.cjs
 * GPU shader appearance still requires a real-phone visual pass.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function setup(){
 const instances=[];
 class Vec2{constructor(x,y){this.x=x;this.y=y;}set(x,y){this.x=x;this.y=y;return this;}}
 class Vec3{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}copy(o){this.x=o.x;this.y=o.y;this.z=o.z;return this;}}
 class Vec4{constructor(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;}set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}}
 class Color{constructor(value){this.value=value;}}
 class Texture{constructor(canvas){this.canvas=canvas;this.disposed=false;}dispose(){this.disposed=true;}}
 class EffectComposer{
  constructor(){this.passes=[];this.renderCount=0;this.disposed=false;instances.push(this);}
  addPass(p){this.passes.push(p);}
  render(){this.renderCount++;}
  setPixelRatio(dpr){this.dpr=dpr;}
  setSize(w,h){this.size=[w,h];}
  dispose(){this.disposed=true;}
 }
 class RenderPass{constructor(){this.label='RENDER';}}
 class UnrealBloomPass{constructor(){this.label='BLOOM';this.highPassUniforms={smoothWidth:{value:0}};}}
 class ShaderPass{
  constructor(shader){
   this.uniforms=shader.uniforms;
   const u=this.uniforms;
   this.label='uComposite' in u ? (u.uComposite.value?'BOARD POPUP':'BOARD BLUR'):
    'uX' in u?'GHOST':'uTint' in u?'PHOSPHOR':
    'uRadius' in u?'SOFTNESS':'uStart' in u?'VIGNETTE':
    'uPattern' in u?'CRT':'uOffset' in u?'ROLL':'UNKNOWN';
  }
 }
 class OutputPass{constructor(){this.label='OUTPUT';}}
 const THREE={
  Vector2:Vec2,Vector3:Vec3,Vector4:Vec4,Color,CanvasTexture:Texture,
  RepeatWrapping:'repeat',NearestFilter:'nearest'
 };
 const document={createElement:()=>({
  width:0,height:0,
  getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})
 })};
 const file=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
 const profilerSource=fs.readFileSync(path.join(__dirname,'compositor-pass-profiler.js'),'utf8');
 const instrumentCompositorPasses=new Function(
  profilerSource.replace('export function ','function ')+
  '\nreturn instrumentCompositorPasses;')();
 const standalone=file.replace(/^import .*;\s*$/gm,'').replace('export function createCompositor','function createCompositor');
 assert.ok(!/\bimport\s+/.test(standalone),'Unexpected import syntax');
 const factory=new Function('THREE','EffectComposer','RenderPass','UnrealBloomPass','ShaderPass','OutputPass','document','instrumentCompositorPasses',
  standalone+'\nreturn createCompositor;')
  (THREE,EffectComposer,RenderPass,UnrealBloomPass,ShaderPass,OutputPass,document,instrumentCompositorPasses);
 const externalPopup={external:true};
 const pipeline=factory({renderer:{},scene:{},camera:{},boardPopupTexture:externalPopup});
 return {pipeline,composer:instances[0],externalPopup,instances};
}
const states={
 phosphor:true,bloom:true,bloomStrength:.3,ghost:true,ghostX:2,ghostY:0,ghostStrength:22,
 softness:true,softnessStrength:.64,softnessRadius:3,vignette:true,vignetteAmount:.39,
 scanlines:true,scanlineOpacity:20,scanlinePreset:'original'
};
const update=(pipeline,override={})=>pipeline.syncFX({
 fx:{...states,...override},theme:'green',width:393,height:852,dpr:3,
 boardStatus:'playing',popupStatus:'ready',modalOpen:false,
 layoutInfo:{boardX:11,boardY:120,boardW:234.5,boardH:469}
});
test('pass order remains exactly the approved version',()=>{
 const {composer}=setup();
 assert.deepEqual(composer.passes.map(p=>p.label),[
  'RENDER','BOARD BLUR','BOARD POPUP','GHOST','BLOOM','PHOSPHOR',
  'SOFTNESS','VIGNETTE','CRT','ROLL','OUTPUT'
 ]);
});
test('display effect settings target their own passes',()=>{
 const {pipeline,composer}=setup();
 update(pipeline);
 const p=composer.passes;
 assert.equal(p[3].enabled,true);
 assert.equal(p[3].uniforms.uStrength.value,.22);
 assert.equal(p[4].enabled,true);
 assert.equal(p[4].strength,.3);
 assert.equal(p[5].uniforms.uEnabled.value,1);
 assert.equal(p[6].enabled,true);
 assert.equal(p[7].enabled,true);
 assert.equal(p[8].enabled,true);
 assert.equal(p[8].uniforms.uScreenHeight.value,2556);
 update(pipeline,{ghost:false,bloom:false,phosphor:false,softness:false,vignette:false,scanlines:false});
 for(const i of [3,4,6,7,8])assert.equal(p[i].enabled,false);
 assert.equal(p[5].uniforms.uEnabled.value,0);
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
 const {pipeline,composer,externalPopup}=setup();
 pipeline.resize(844,390,3);
 assert.deepEqual(composer.size,[844,390]);
 assert.equal(composer.dpr,3);
 for(const i of [1,2,3,6]){
  assert.equal(composer.passes[i].uniforms.uSize.value.x,844);
  assert.equal(composer.passes[i].uniforms.uSize.value.y,390);
 }
 pipeline.render();
 assert.equal(composer.renderCount,1);
 pipeline.dispose();
 assert.equal(composer.disposed,true);
 assert.equal(externalPopup.disposed,undefined);
});

test('boot roll is dormant in normal gameplay and wraps only during handoff',()=>{
 const {pipeline,composer}=setup();
 const roll=composer.passes[9];
 assert.equal(roll.label,'ROLL');
 assert.equal(roll.enabled,false);
 assert.equal(roll.uniforms.uOffset.value,0);
 update(pipeline);
 pipeline.setStartupRoll(.25);
 assert.equal(roll.enabled,true);
 assert.ok(Math.abs(roll.uniforms.uOffset.value-.25)<.00001);
 pipeline.setStartupRoll(1.5);
 assert.equal(roll.enabled,true);
 assert.ok(Math.abs(roll.uniforms.uOffset.value-.5)<.00001);
 pipeline.setStartupRoll(2);
 assert.equal(roll.enabled,false);
 assert.equal(roll.uniforms.uOffset.value,0);
 pipeline.setStartupRoll(0);
 assert.equal(roll.enabled,false);
});

test('V077 phosphor amount is strictly 0–100% and voltage is luminance-only',()=>{
 const {pipeline,composer}=setup();
 const ph=composer.passes[5];
 const base={fx:states,theme:'green',width:393,height:852,dpr:2,
  boardStatus:'playing',popupStatus:'ready',modalOpen:false};
 const read=(phosphorStrength,voltage,fx=states)=>{
  pipeline.syncFX({...base,fx,phosphorStrength,voltage});
  return [ph.uniforms.uEnabled.value,ph.uniforms.uVoltage.value];
 };
 assert.deepEqual(read(-.7,4),[0,1.2]);
 assert.deepEqual(read(.5,1.16),[.5,1.16]);
 assert.deepEqual(read(5,-4),[1,1]);
 assert.deepEqual(read(1,1,{...states,phosphor:false}),[0,1]);
 const shader=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
 assert.ok(shader.includes('clamp(uEnabled,0.0,1.0)'));
 assert.ok(shader.includes('clamp(uVoltage,1.0,1.2)'));
 assert.ok(!shader.includes('uTint.value.multiplyScalar'));
});

test('V078 startup sync tearing shares the dormant boot-roll pass',()=>{
 const {pipeline,composer}=setup();
 const signal=composer.passes[9],base={fx:states,theme:'green',
  width:393,height:852,dpr:2,boardStatus:'playing',modalOpen:false};
 pipeline.syncFX({...base,glitch:0,signalTime:0});
 assert.equal(signal.enabled,false);
 pipeline.syncFX({...base,glitch:.8,signalTime:2140});
 assert.equal(signal.enabled,true);
 assert.equal(signal.uniforms.uGlitch.value,.8);
 assert.equal(signal.uniforms.uTime.value,2.14);
 pipeline.syncFX({...base,glitch:5,signalTime:-50});
 assert.equal(signal.uniforms.uGlitch.value,1);
 assert.equal(signal.uniforms.uTime.value,0);
 pipeline.syncFX({...base,glitch:0,signalTime:3000});
 assert.equal(signal.enabled,false);
 pipeline.setStartupRoll(.38);
 assert.equal(signal.enabled,true);
 pipeline.syncFX({...base,glitch:0});
 assert.equal(signal.enabled,true,'existing vertical roll must remain enabled');
 pipeline.setStartupRoll(0);
 assert.equal(signal.enabled,false);
});

test('V083 independently preserves #080808 display base through zero-luminance source swaps',()=>{
 const {pipeline,composer}=setup();
 const vignette=composer.passes[7],crt=composer.passes[8],outputGate=composer.passes[9];
 const fx={...states,vignette:false,scanlines:true};
 const input={fx,theme:'green',width:393,height:852,dpr:2,
  boardStatus:'playing',modalOpen:false};
 pipeline.syncFX({...input,contentLuminance:1});
 assert.equal(vignette.enabled,false,'normal gameplay retains disabled vignette');
 assert.equal(outputGate.enabled,false,'no extra pass during normal gameplay');
 pipeline.syncFX({...input,contentLuminance:0});
 assert.equal(vignette.enabled,false,'fade must not alter vignette setting');
 assert.equal(outputGate.enabled,true,'final luminance pass activates only for transition');
 assert.equal(outputGate.uniforms.uContentLuminance.value,0);
 assert.equal(outputGate.uniforms.uDisplayBase.value.value,0x080808);
 assert.equal(crt.enabled,true,'CRT mask stays enabled at zero luminance');
 pipeline.syncFX({...input,contentLuminance:.5});
 assert.equal(outputGate.uniforms.uContentLuminance.value,.5);
 pipeline.syncFX({...input,contentLuminance:-2});
 assert.equal(outputGate.uniforms.uContentLuminance.value,0);
 pipeline.syncFX({...input,contentLuminance:8});
 assert.equal(outputGate.uniforms.uContentLuminance.value,1);
 assert.equal(outputGate.enabled,false);
 pipeline.syncFX({...input,fx:{...states,vignette:true},contentLuminance:0});
 assert.equal(vignette.enabled,true);
 assert.equal(vignette.uniforms.uAmount.value,states.vignetteAmount);
 assert.equal(crt.uniforms.uOpacity.value,states.scanlineOpacity/100);
 // A surviving roll or glitch must not accidentally disable the common gate.
 pipeline.setStartupRoll(.38);
 assert.equal(outputGate.enabled,true);
 pipeline.setStartupRoll(0);
 assert.equal(outputGate.enabled,true);
 pipeline.syncFX({...input,contentLuminance:1});
 assert.equal(outputGate.enabled,false);
});
test('V083 gamma-correct display base is after scanlines, with unchanged output and no double tint',()=>{
 const shader=fs.readFileSync(path.join(__dirname,'compositor.js'),'utf8');
 const crt=shader.indexOf('composer.addPass(scanlineOverlay)');
 const shared=shader.indexOf('composer.addPass(bootRoll)');
 const display=shader.indexOf('composer.addPass(new OutputPass())');
 assert.ok(crt<shared&&shared<display);
 assert.ok(shader.includes('uDisplayBase:{value:new THREE.Color(0x080808)}'));
 assert.ok(shader.includes('vec3 emitted=completed-uDisplayBase'));
 assert.ok(shader.includes('uDisplayBase+emitted*clamp(uContentLuminance,0.0,1.0)'));
 assert.ok(!shader.includes('mix(vec3(8.0/255.0),finished'));
 assert.ok(shader.includes('gl_FragCoord.x,uScreenHeight-gl_FragCoord.y'));
});
