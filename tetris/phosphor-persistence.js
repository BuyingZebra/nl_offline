/* NOMAD V097 — opt-in, physically motivated luminance history compositor.
 * Two decay channels stored in half-resolution RG of two RGBA8 render targets.
 * Square-root packing improves low-luminance precision on WebGL1/iPhone.
 * Source pixels remain sharp: only the RESIDUAL history is spatially filtered.
 * Envelopes and tint are research-informed models, NOT calibrated phosphors.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {phosphorProfile} from './phosphor-model.js?v097';
const vertex=String.raw`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const historyShader=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tPrevious;
uniform float uFastDecay,uSlowDecay,uSlowRise,uReset,uBase;
void main(){
 float lum=dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722));
 float source=max(0.0,lum-uBase);
 vec2 packed=texture2D(tPrevious,vUv).rg;
 vec2 prev=packed*packed;
 float fast=max(source,prev.x*uFastDecay);
 float slow=source>prev.y?mix(prev.y,source,uSlowRise):max(source,prev.y*uSlowDecay);
 if(uReset>.5){fast=source;slow=source;}
 gl_FragColor=vec4(sqrt(clamp(vec2(fast,slow),0.0,1.0)),0.0,1.0);
}`;
const outputShader=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tHistory;
uniform vec2 uWeights;
uniform float uBase;
void main(){
 vec3 original=texture2D(tSource,vUv).rgb;
 float src=max(0.0,dot(original,vec3(.2126,.7152,.0722))-uBase);
 vec2 packed=texture2D(tHistory,vUv).rg;
 vec2 history=packed*packed;
 // Keep the original source image perfectly crisp. Only past excitation
 // contributes a spatially filtered residual after the source dims or moves.
 float afterglow=uWeights.x*max(0.0,history.x-src)+
                 uWeights.y*max(0.0,history.y-src);
 gl_FragColor=vec4(clamp(original+vec3(afterglow),0.0,1.0),1.0);
}`;
const BASE_SRGB=8/255;
const BASE_LINEAR=BASE_SRGB<=.04045?BASE_SRGB/12.92:
 Math.pow((BASE_SRGB+.055)/1.055,2.4);
export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let profile=phosphorProfile('p39');
 let width=1,height=1,read=null,write=null,pendingReset=true;
 const hu={
  tSource:{value:null},tPrevious:{value:null},
  uFastDecay:{value:0},uSlowDecay:{value:0},uSlowRise:{value:1},
  uReset:{value:1},uBase:{value:BASE_LINEAR}
 };
 const ou={
  tSource:{value:null},tHistory:{value:null},
  uWeights:{value:new THREE.Vector2(profile.fastWeight,profile.slowWeight)},
  uBase:{value:BASE_LINEAR}
 };
 const update=new THREE.ShaderMaterial({uniforms:hu,vertexShader:vertex,
  fragmentShader:historyShader,depthTest:false,depthWrite:false,blending:THREE.NoBlending});
 const output=new THREE.ShaderMaterial({uniforms:ou,vertexShader:vertex,
  fragmentShader:outputShader,depthTest:false,depthWrite:false,blending:THREE.NoBlending});
 const quad=new FullScreenQuad(update);
 const allocate=()=>{
  read?.dispose();write?.dispose();
  const options={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  const w=Math.max(1,Math.ceil(width/2)),h=Math.max(1,Math.ceil(height/2));
  read=new THREE.WebGLRenderTarget(w,h,options);
  write=new THREE.WebGLRenderTarget(w,h,options);
  read.texture.colorSpace=THREE.NoColorSpace;
  write.texture.colorSpace=THREE.NoColorSpace;
  pendingReset=true;
 };
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const nextW=Math.max(1,Math.ceil(w)),nextH=Math.max(1,Math.ceil(h));
  if(nextW===width&&nextH===height)return;
  width=nextW;height=nextH;
  if(read||write)allocate();
 };
 pass.reset=()=>{pendingReset=true;};
 pass.configure=id=>{
  const next=phosphorProfile(id);
  if(profile.id!==next.id){profile=next;pendingReset=true;}
  ou.uWeights.value.set(profile.fastWeight,profile.slowWeight);
 };
 pass.render=(renderer,writeBuffer,readBuffer,dt)=>{
  if(!read||!write)allocate();
  const elapsed=Math.max(.001,Math.min(.1,Number(dt)||1/60));
  hu.tSource.value=readBuffer.texture;
  hu.tPrevious.value=read.texture;
  hu.uFastDecay.value=Math.exp(-elapsed/profile.fastTau);
  hu.uSlowDecay.value=Math.exp(-elapsed/profile.slowTau);
  hu.uSlowRise.value=1-Math.exp(-elapsed/profile.riseTau);
  hu.uReset.value=pendingReset?1:0;
  quad.material=update;
  renderer.setRenderTarget(write);
  quad.render(renderer);
  ou.tSource.value=readBuffer.texture;
  ou.tHistory.value=write.texture;
  quad.material=output;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
  [read,write]=[write,read];
  pendingReset=false;
 };
 pass.dispose=()=>{
  read?.dispose();write?.dispose();read=null;write=null;
  update.dispose();output.dispose();quad.dispose();
 };
 return pass;
}
