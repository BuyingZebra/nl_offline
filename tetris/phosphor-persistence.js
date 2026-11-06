/* NOMAD V102: separable spatial CRT spread + temporal phosphor response.
 * One postcomposition light field: menu, board, HUD, text and buttons.
 * Idealized Gaussian spot based on reported CRT point-spread behaviour.
 * The surrounding halo is spatially scattered emitted light, NOT neighbouring
 * phosphor grains being re-excited. Both core and halo retain the same decay.
 * No raster sweep, temporal flicker mask, or palette coupling.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {normalizePersistenceMs,PHOSPHOR_BOUNDS,PHOSPHOR_OPTICS}
 from './phosphor-model.js?v102';

const vertex=String.raw`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const historyFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tPrevious;
uniform float uBase,uDelta,uDecayTau,uRiseTau,uReset;
void main(){
 float intensity=dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722));
 float drive=clamp((intensity-uBase)/max(.001,1.0-uBase),0.0,1.0);
 float encoded=texture2D(tPrevious,vUv).r;
 float previous=encoded*encoded;
 if(uReset>.5)previous=drive;
 float tau=drive>previous?uRiseTau:uDecayTau;
 float emitted=drive+(previous-drive)*exp(-uDelta/max(.001,tau));
 gl_FragColor=vec4(sqrt(clamp(emitted,0.0,1.0)),sqrt(drive),0.0,1.0);
}`;

// Separable normalized Gaussian K(x,y)=G(x)*G(y). The fixed weights are
// computed from sigma=1.4 quarter-resolution pixels, radius=2.
// As a normalized kernel, a uniform source remains at exactly unit intensity.
// Half/quarter buffers describe an optical footprint, not phosphor chemistry.
const spreadFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uStep;
float lightAt(vec2 uv){
 float encoded=texture2D(tInput,clamp(uv,vec2(0.0),vec2(1.0))).r;
 return encoded*encoded;
}
void main(){
 float sum=0.3057570598*lightAt(vUv);
 sum+=0.2369120141*(lightAt(vUv+uStep)+lightAt(vUv-uStep));
 sum+=0.1102094560*(lightAt(vUv+2.0*uStep)+lightAt(vUv-2.0*uStep));
 gl_FragColor=vec4(sqrt(clamp(sum,0.0,1.0)),0.0,0.0,1.0);
}`;
const outputFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tHistory,tSpread;
uniform float uBase,uSpreadFraction;
void main(){
 float current=clamp((dot(texture2D(tSource,vUv).rgb,
  vec3(.2126,.7152,.0722))-uBase)/max(.001,1.0-uBase),0.0,1.0);
 vec2 memory=texture2D(tHistory,vUv).rg;
 float light=memory.r*memory.r;
 float sampledDrive=memory.g*memory.g;
 // Retain high-resolution glyph and tile edges using the source map while
 // decaying removed light with the very same whole-screen temporal history.
 float fresh=current*min(1.0,light/max(.01,sampledDrive));
 float afterglow=max(0.0,light-sampledDrive);
 float core=clamp(fresh+afterglow,0.0,1.0);
 float scattered=texture2D(tSpread,vUv).r;
 scattered*=scattered;
 // Point-spread equation: L=(1-a)*Lcore + a*(K * Lhistory).
 // The scatter fraction is conservative and normalized: brightness isn't
 // invented, and isolated bright details illuminate nearby dark locations.
 float emitted=clamp(mix(core,scattered,uSpreadFraction),0.0,1.0);
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*emitted),1.0);
}`;
const BASE_SRGB=8/255;
const BASE=BASE_SRGB<=.04045?BASE_SRGB/12.92:
 Math.pow((BASE_SRGB+.055)/1.055,2.4);
export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let width=1,height=1,read=null,write=null,blurX=null,blurY=null;
 let decayMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,first=true;
 const history={
  tSource:{value:null},tPrevious:{value:null},uBase:{value:BASE},
  uDelta:{value:1/60},uDecayTau:{value:decayMs/1000},
  uRiseTau:{value:PHOSPHOR_BOUNDS.riseMs/1000},uReset:{value:1}
 };
 const optX={tInput:{value:null},uStep:{value:new THREE.Vector2(1,0)}};
 const optY={tInput:{value:null},uStep:{value:new THREE.Vector2(0,1)}};
 const display={
  tSource:{value:null},tHistory:{value:null},tSpread:{value:null},
  uBase:{value:BASE},uSpreadFraction:{value:PHOSPHOR_OPTICS.spreadFraction}
 };
 const material=fragment=>new THREE.ShaderMaterial({
  uniforms:fragment.uniforms,vertexShader:vertex,fragmentShader:fragment.code,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending
 });
 const update=material({uniforms:history,code:historyFragment});
 const blurHorizontal=material({uniforms:optX,code:spreadFragment});
 const blurVertical=material({uniforms:optY,code:spreadFragment});
 const output=material({uniforms:display,code:outputFragment});
 const quad=new FullScreenQuad(update);
 function allocate(){
  for(const rt of [read,write,blurX,blurY])rt?.dispose();
  const opts={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  const make=(w,h)=>{
   const rt=new THREE.WebGLRenderTarget(w,h,opts);
   rt.texture.colorSpace=THREE.NoColorSpace;
   return rt;
  };
  read=make(Math.max(1,Math.ceil(width/2)),Math.max(1,Math.ceil(height/2)));
  write=make(read.width,read.height);
  const qW=Math.max(1,Math.ceil(width/4));
  const qH=Math.max(1,Math.ceil(height/4));
  blurX=make(qW,qH);blurY=make(qW,qH);
  optX.uStep.value.set(1/qW,0);
  optY.uStep.value.set(0,1/qH);
  first=true;
 }
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const x=Math.max(1,Math.ceil(w)),y=Math.max(1,Math.ceil(h));
  if(width===x&&height===y)return;
  width=x;height=y;
  if(read||write)allocate();
 };
 pass.reset=()=>{first=true;};
 pass.configure=(persistenceMs=PHOSPHOR_BOUNDS.defaultPersistenceMs)=>{
  decayMs=normalizePersistenceMs(persistenceMs);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!read||!write||!blurX||!blurY)allocate();
  const dt=Math.max(.001,Math.min(.1,Number(deltaTime)||1/60));
  history.tSource.value=readBuffer.texture;
  history.tPrevious.value=read.texture;
  history.uDelta.value=dt;
  history.uDecayTau.value=decayMs/1000;
  history.uReset.value=first?1:0;
  quad.material=update;
  renderer.setRenderTarget(write);
  quad.render(renderer);

  // Quarter-res separable PSF: two cheap spatial convolutions performed on
  // the *emitted* phosphor field, so halos retain persistence automatically.
  optX.tInput.value=write.texture;
  quad.material=blurHorizontal;
  renderer.setRenderTarget(blurX);
  quad.render(renderer);
  optY.tInput.value=blurX.texture;
  quad.material=blurVertical;
  renderer.setRenderTarget(blurY);
  quad.render(renderer);

  display.tSource.value=readBuffer.texture;
  display.tHistory.value=write.texture;
  display.tSpread.value=blurY.texture;
  quad.material=output;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
  [read,write]=[write,read];
  first=false;
 };
 pass.dispose=()=>{
  for(const rt of [read,write,blurX,blurY])rt?.dispose();
  read=null;write=null;blurX=null;blurY=null;
  for(const m of [update,blurHorizontal,blurVertical,output])m.dispose();
  quad.dispose();
 };
 return pass;
}
