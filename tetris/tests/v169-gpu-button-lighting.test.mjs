/* NOMAD V169: same controls plane, cached source, animated shader uniforms.
 * Node: node --test tetris/tests/v169-gpu-button-lighting.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGpuButtonLighting,excitedButtonGray,GPU_BUTTON_CAPACITY} from '../crt.js';
import {createHudDrawing} from '../ui.js';
import {buttonLevel,buttonInkLevel} from '../crt.js';
import {controlsBounds} from '../crt.js';
import {createActionController} from '../session.js';
import '../layout.js';

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
 const r=globalThis.FieldAtlasTetrisLayout.computeLayout(width,height,safe,ui);
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
 const src=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
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
 const src=fs.readFileSync(new URL('../three-v027.js',import.meta.url),'utf8');
 assert.match(src,/maxFragmentUniforms>=32/);
 assert.match(src,/\.get\('buttonRenderer'\)==='canvas'/);
 assert.match(src,/controlsGpuEnabled\)\?0:buttonSparks/);
 assert.match(src,/if\(!controlLighting\.configure\(regions,bounds\)\)disableGpuControls\(\)/);
 assert.match(src,/buttonRenderer:controlsGpuEnabled\?'GPU uniforms':'Canvas2D fallback'/);
});
