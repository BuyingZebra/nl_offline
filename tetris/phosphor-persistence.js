/* NOMAD V100 — continuous full-display monochrome phosphor response.
 * ONE GPU history pass receives the already-composited full scene: text,
 * sidebar, board, buttons, HUD, popup and all modal content. No raster
 * scanning, refresh sampling, rolling patterns or scan-beam masks.
 * Bright excitation rises quickly. Light that stops being driven decays
 * exponentially over the user's persistence slider value.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {normalizePersistenceMs,PHOSPHOR_BOUNDS} from './phosphor-model.js?v100';
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
 // The G channel records this frame's downsampled source for crisp-edge
 // reconstruction; R stores the shared phosphor's emitted luminance.
 gl_FragColor=vec4(sqrt(clamp(emitted,0.0,1.0)),sqrt(drive),0.0,1.0);
}`;
const outputFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tHistory;
uniform float uBase;
void main(){
 vec3 source=texture2D(tSource,vUv).rgb;
 float current=clamp((dot(source,vec3(.2126,.7152,.0722))-uBase)/
  max(.001,1.0-uBase),0.0,1.0);
 vec2 memory=texture2D(tHistory,vUv).rg;
 float light=memory.r*memory.r;
 float sampledDrive=memory.g*memory.g;
 // Keep current text and controls sharp at native display resolution while
 // using the same history response on every composed screen location.
 float fresh=current*min(1.0,light/max(.01,sampledDrive));
 float afterglow=max(0.0,light-sampledDrive);
 float emitted=clamp(fresh+afterglow,0.0,1.0);
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*emitted),1.0);
}`;
const BASE_SRGB=8/255;
const BASE=BASE_SRGB<=.04045?BASE_SRGB/12.92:
 Math.pow((BASE_SRGB+.055)/1.055,2.4);
export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let width=1,height=1,read=null,write=null;
 let decayMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,first=true;
 const updateUniforms={
  tSource:{value:null},tPrevious:{value:null},uBase:{value:BASE},
  uDelta:{value:1/60},
  uDecayTau:{value:decayMs/1000},
  uRiseTau:{value:PHOSPHOR_BOUNDS.riseMs/1000},
  uReset:{value:1}
 };
 const outputUniforms={
  tSource:{value:null},tHistory:{value:null},uBase:{value:BASE}
 };
 const update=new THREE.ShaderMaterial({uniforms:updateUniforms,
  vertexShader:vertex,fragmentShader:historyFragment,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending});
 const output=new THREE.ShaderMaterial({uniforms:outputUniforms,
  vertexShader:vertex,fragmentShader:outputFragment,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending});
 const quad=new FullScreenQuad(update);
 function allocate(){
  read?.dispose();write?.dispose();
  const w=Math.max(1,Math.ceil(width/2)),h=Math.max(1,Math.ceil(height/2));
  const opts={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  read=new THREE.WebGLRenderTarget(w,h,opts);
  write=new THREE.WebGLRenderTarget(w,h,opts);
  read.texture.colorSpace=THREE.NoColorSpace;
  write.texture.colorSpace=THREE.NoColorSpace;
  first=true;
 }
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const nextW=Math.max(1,Math.ceil(w)),nextH=Math.max(1,Math.ceil(h));
  if(width===nextW&&height===nextH)return;
  width=nextW;height=nextH;
  if(read||write)allocate();
 };
 // Reset only on actual texture invalidation (resize/GL loss/explicit toggle).
 // Never reset automatically in response to game state or menu changes.
 pass.reset=()=>{first=true;};
 pass.configure=(persistenceMs=PHOSPHOR_BOUNDS.defaultPersistenceMs)=>{
  decayMs=normalizePersistenceMs(persistenceMs);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!read||!write)allocate();
  const dt=Math.max(.001,Math.min(.1,Number(deltaTime)||1/60));
  updateUniforms.tSource.value=readBuffer.texture;
  updateUniforms.tPrevious.value=read.texture;
  updateUniforms.uDelta.value=dt;
  updateUniforms.uDecayTau.value=decayMs/1000;
  updateUniforms.uReset.value=first?1:0;
  quad.material=update;
  renderer.setRenderTarget(write);
  quad.render(renderer);
  outputUniforms.tSource.value=readBuffer.texture;
  outputUniforms.tHistory.value=write.texture;
  quad.material=output;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
  [read,write]=[write,read];
  first=false;
 };
 pass.dispose=()=>{
  read?.dispose();write?.dispose();read=null;write=null;
  update.dispose();output.dispose();quad.dispose();
 };
 return pass;
}
