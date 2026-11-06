/* NOMAD V103: 100%-of-light point-spread and short phosphor decay.
 * Complete postcomposed grayscale display (text, controls, pieces, menus).
 * Temporal excitation and decay are independent of palette and optical PSF.
 * The full emitted field passes through a normalized radial point-spread
 * function: bright light reaches farther by amplitude, not a fake variable
 * spread radius. No 16% additive halo, beam scanning, or rolling mask.
 * Generalized Lorentzian/Moffat-inspired kernel is a provisional optical fit,
 * not a measured CRT profile.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {normalizePersistenceMs,PHOSPHOR_BOUNDS,PHOSPHOR_OPTICS}
 from './phosphor-model.js?v103';

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

const reconstructedFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tHistory;
uniform float uBase;
void main(){
 float current=clamp((dot(texture2D(tSource,vUv).rgb,
  vec3(.2126,.7152,.0722))-uBase)/max(.001,1.0-uBase),0.0,1.0);
 vec2 memory=texture2D(tHistory,vUv).rg;
 float light=memory.r*memory.r;
 float sampledDrive=memory.g*memory.g;
 // Native-resolution glyph geometry and temporal history share the SAME
 // emitted field. Do not spread the low-resolution history independently.
 float fresh=current*min(1.0,light/max(.01,sampledDrive));
 float afterglow=max(0.0,light-sampledDrive);
 float emitted=clamp(fresh+afterglow,0.0,1.0);
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*emitted),1.0);
}`;

// Single normalized PSF. Every photon in the discretized emitted field
// participates. The central sample is naturally strongest; no core bypass.
// Four axes, four diagonals and four farther axial taps approximate a radially
// decreasing non-Gaussian spot profile, following published CRT spot studies.
const opticalFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tEmission;
uniform float uBase;
uniform vec2 uPixelStep;
const float W_CENTER=0.6431949030;
const float W_AXIS=0.0600977071;
const float W_DIAGONAL=0.0219806477;
const float W_OUTER=0.0071229194;
float lightAt(vec2 uv){
 float inside=step(0.0,uv.x)*step(uv.x,1.0)*
  step(0.0,uv.y)*step(uv.y,1.0);
 float light=texture2D(tEmission,clamp(uv,vec2(0.0),vec2(1.0))).r;
 return inside*clamp((light-uBase)/max(.001,1.0-uBase),0.0,1.0);
}
void main(){
 vec2 x=vec2(uPixelStep.x,0.0),y=vec2(0.0,uPixelStep.y);
 float sum=W_CENTER*lightAt(vUv);
 sum+=W_AXIS*(lightAt(vUv+x)+lightAt(vUv-x)+
  lightAt(vUv+y)+lightAt(vUv-y));
 sum+=W_DIAGONAL*(lightAt(vUv+x+y)+lightAt(vUv+x-y)+
  lightAt(vUv-x+y)+lightAt(vUv-x-y));
 sum+=W_OUTER*(lightAt(vUv+2.0*x)+lightAt(vUv-2.0*x)+
  lightAt(vUv+2.0*y)+lightAt(vUv-2.0*y));
 // Linear amplitude scaling means a bright source generates a more visible
 // distant contribution, while a dimmer source falls below visibility first.
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*clamp(sum,0.0,1.0)),1.0);
}`;

const BASE_SRGB=8/255;
const BASE=BASE_SRGB<=.04045?BASE_SRGB/12.92:
 Math.pow((BASE_SRGB+.055)/1.055,2.4);
export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let width=1,height=1,read=null,write=null,emission=null;
 let decayMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,first=true;
 const history={
  tSource:{value:null},tPrevious:{value:null},uBase:{value:BASE},
  uDelta:{value:1/60},uDecayTau:{value:decayMs/1000},
  uRiseTau:{value:PHOSPHOR_BOUNDS.riseMs/1000},uReset:{value:1}
 };
 const reconstruct={
  tSource:{value:null},tHistory:{value:null},uBase:{value:BASE}
 };
 const optics={
  tEmission:{value:null},uBase:{value:BASE},
  uPixelStep:{value:new THREE.Vector2(1,1)}
 };
 const createMaterial=(uniforms,fragmentShader)=>new THREE.ShaderMaterial({
  uniforms,vertexShader:vertex,fragmentShader,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending
 });
 const update=createMaterial(history,historyFragment);
 const native=createMaterial(reconstruct,reconstructedFragment);
 const optical=createMaterial(optics,opticalFragment);
 const quad=new FullScreenQuad(update);

 function allocate(){
  for(const rt of [read,write,emission])rt?.dispose();
  const opts={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  function make(w,h){
   const rt=new THREE.WebGLRenderTarget(w,h,opts);
   rt.texture.colorSpace=THREE.NoColorSpace;
   return rt;
  }
  const halfW=Math.max(1,Math.ceil(width/2));
  const halfH=Math.max(1,Math.ceil(height/2));
  read=make(halfW,halfH);write=make(halfW,halfH);
  // Native output before PSF keeps all text/piece/button geometry crisp.
  emission=make(width,height);
  optics.uPixelStep.value.set(PHOSPHOR_OPTICS.pixelPitch/width,
   PHOSPHOR_OPTICS.pixelPitch/height);
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
  if(!read||!write||!emission)allocate();
  const dt=Math.max(.001,Math.min(.1,Number(deltaTime)||1/60));
  history.tSource.value=readBuffer.texture;
  history.tPrevious.value=read.texture;
  history.uDelta.value=dt;
  history.uDecayTau.value=decayMs/1000;
  history.uReset.value=first?1:0;
  quad.material=update;
  renderer.setRenderTarget(write);
  quad.render(renderer);

  reconstruct.tSource.value=readBuffer.texture;
  reconstruct.tHistory.value=write.texture;
  quad.material=native;
  renderer.setRenderTarget(emission);
  quad.render(renderer);

  // Spatial PSF is applied to ALL native-resolution emitted luminance,
  // including persistent afterimages, before downstream bloom/tint.
  optics.tEmission.value=emission.texture;
  quad.material=optical;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);

  [read,write]=[write,read];
  first=false;
 };
 pass.dispose=()=>{
  for(const rt of [read,write,emission])rt?.dispose();
  read=null;write=null;emission=null;
  for(const material of [update,native,optical])material.dispose();
  quad.dispose();
 };
 return pass;
}
