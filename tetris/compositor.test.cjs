/* Run: node --test tetris/compositor.test.cjs
 * GPU shader appearance still requires a real-phone visual pass.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

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
    'uPower' in u?'BUTTON RESPONSE':'uX' in u?'GHOST':'uTint' in u?'PHOSPHOR':
    'uRadius' in u?'SOFTNESS':'uStart' in u?'VIGNETTE':
    'uPattern' in u?'CRT':'uOffset' in u?'ROLL':'UNKNOWN';
  }
  dispose(){this.disposeCount=(this.disposeCount||0)+1;}
 }
 class OutputPass{constructor(){this.label='OUTPUT';}dispose(){this.disposeCount=(this.disposeCount||0)+1;}}
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
 return {pipeline,composer:instances[0],externalPopup,instances,textures};
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
  'RENDER','BOARD BLUR','BOARD POPUP','BUTTON RESPONSE','GHOST','BLOOM','PHOSPHOR',
  'SOFTNESS','VIGNETTE','CRT','ROLL','OUTPUT'
 ]);
});
test('display effect settings target their own passes',()=>{
 const {pipeline,composer}=setup();
 update(pipeline);
 const p=composer.passes;
 assert.equal(p[4].enabled,true);
 assert.equal(p[4].uniforms.uStrength.value,.22);
 assert.equal(p[5].enabled,true);
 assert.equal(p[5].strength,.3);
 assert.equal(p[6].uniforms.uEnabled.value,1);
 assert.equal(p[7].enabled,true);
 assert.equal(p[8].enabled,true);
 assert.equal(p[9].enabled,true);
 assert.equal(p[9].uniforms.uScreenHeight.value,2556);
 update(pipeline,{ghost:false,bloom:false,phosphor:false,softness:false,vignette:false,scanlines:false});
 for(const i of [4,5,7,8,9])assert.equal(p[i].enabled,false);
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

test('every button uses same composited luminance pulse before unchanged CRT passes',()=>{
 const {pipeline,composer}=setup();
 const p=composer.passes[3];
 assert.equal(p.label,'BUTTON RESPONSE');
 assert.equal(p.enabled,false);
 pipeline.syncButtonFeedback([{x:20,y:40,w:60,h:44,power:1}],393,852);
 assert.equal(p.enabled,true);
 assert.equal(p.uniforms.uViewport.value.x,393);
 assert.equal(p.uniforms.uViewport.value.y,852);
 assert.equal(p.uniforms.uRects.value[0].x,20);
 assert.equal(p.uniforms.uRects.value[0].y,40);
 assert.equal(p.uniforms.uPower.value[0],1);
 pipeline.syncButtonFeedback([{x:20,y:40,w:60,h:44,power:.13}],393,852);
 assert.equal(p.uniforms.uPower.value[0],.13);
 pipeline.syncButtonFeedback([],393,852);
 assert.equal(p.enabled,false);
 pipeline.dispose();
});
