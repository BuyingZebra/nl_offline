/* NOMAD V097: isolated opt-in grayscale phosphor history pass.
 * Two decay channels with different time constants are packed into RG using
 * sqrt encoding; 8-bit RTs resolve faint tails without requiring float RTs.
 * This is a frame-averaged envelope, NOT an electron-beam raster simulator.
 * No extra bloom, tint, or canvas uploads. Clears on screen transitions.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {phosphorProfile} from './phosphor-model.js?v097';
const vertex=String.raw`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const updateFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tPrevious;
uniform float uFastDecay,uSlowDecay,uSlowRise,uReset,uBase;
void main(){
 float src=max(0.0,dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722))-uBase);
 vec2 packed=texture2D(tPrevious,vUv).rg;
 vec2 prev=packed*packed;
 float fast=max(src,prev.x*uFastDecay);
 float slow=src>prev.y?
   mix(prev.y,src,uSlowRise):
   max(src,prev.y*uSlowDecay);
 if(uReset>.5){fast=src;slow=src;}
 gl_FragColor=vec4(sqrt(clamp(vec2(fast,slow),0.0,1.0)),0.0,1.0);
}`;
const outputFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tHistory;
uniform vec3 uWeights;
uniform float uBase;
void main(){
 vec3 original=texture2D(tSource,vUv).rgb;
 float src=max(0.0,dot(original,vec3(.2126,.7152,.0722))-uBase);
 vec2 packed=texture2D(tHistory,vUv).rg;
 vec2 history=packed*packed;
 float light=uWeights.x*src+uWeights.y*history.x+uWeights.z*history.y;
 // Keep the independently approved dark base and grayscale source.
 gl_FragColor=vec4(vec3(uBase+clamp(light,0.0,1.0-uBase)),1.0);
}`;
export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let profile=phosphorProfile('p39');
 let width=1,height=1,read=null,write=null,pendingReset=true;
 const stateUniforms={
  tSource:{value:null},tPrevious:{value:null},
  uFastDecay:{value:0},uSlowDecay:{value:0},uSlowRise:{value:1},
  uReset:{value:1},uBase:{value:new THREE.Color(0x080808).r}
 };
 const outputUniforms={
  tSource:{value:null},tHistory:{value:null},
  uWeights:{value:new THREE.Vector3(profile.prompt,profile.fast,profile.slow)},
  uBase:{value:new THREE.Color(0x080808).r}
 };
 const update=new THREE.ShaderMaterial({uniforms:stateUniforms,vertexShader:vertex,
  fragmentShader:updateFragment,depthTest:false,depthWrite:false,blending:THREE.NoBlending});
 const output=new THREE.ShaderMaterial({uniforms:outputUniforms,vertexShader:vertex,
  fragmentShader:outputFragment,depthTest:false,depthWrite:false,blending:THREE.NoBlending});
 const quad=new FullScreenQuad(update);
 function alloc(){
  read?.dispose();write?.dispose();
  const options={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  read=new THREE.WebGLRenderTarget(Math.max(1,Math.ceil(width/2)),
   Math.max(1,Math.ceil(height/2)),options);
  write=read.clone();
  read.texture.colorSpace=THREE.NoColorSpace;
  write.texture.colorSpace=THREE.NoColorSpace;
  pendingReset=true;
 }
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const nextW=Math.max(1,Math.floor(w)),nextH=Math.max(1,Math.floor(h));
  if(width===nextW&&height===nextH&&read)return;
  width=nextW;height=nextH;alloc();
 };
 pass.reset=()=>{pendingReset=true;};
 pass.configure=id=>{
  const next=phosphorProfile(id);
  if(profile.id!==next.id){profile=next;pass.reset();}
  outputUniforms.uWeights.value.set(profile.prompt,profile.fast,profile.slow);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!read||!write)alloc();
  // Clamp large timer jumps after Safari suspension or idle frames.
  const dt=Math.max(.001,Math.min(.1,Number(deltaTime)||1/60));
  stateUniforms.tSource.value=readBuffer.texture;
  stateUniforms.tPrevious.value=read.texture;
  stateUniforms.uFastDecay.value=Math.exp(-dt/profile.fastTau);
  stateUniforms.uSlowDecay.value=Math.exp(-dt/profile.slowTau);
  stateUniforms.uSlowRise.value=1-Math.exp(-dt/profile.riseTau);
  stateUniforms.uReset.value=pendingReset?1:0;
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
  pendingReset=false;
 };
 pass.dispose=()=>{
  read?.dispose();write?.dispose();
  update.dispose();output.dispose();quad.dispose();
  read=null;write=null;
 };
 return pass;
}
