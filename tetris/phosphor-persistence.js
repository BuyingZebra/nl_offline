/* NOMAD V098: raster-scanned monochrome light-field model.
 * Simulated electron beam scans left-right, top-bottom at 50/60/75 Hz.
 * RGB history RT: fast excitation, slow excitation, source reference.
 * Output preserves fine live luminance edges, retaining old phosphor light.
 * This is research-informed, not a calibrated physical CRT.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {phosphorProfile,normalizeCRTRefresh,advanceCRTPhase,crtRasterLines}
 from './phosphor-model.js?v098';
const vertex=String.raw`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const historyFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tPrevious;
uniform float uBase,uPhase,uCycles,uHz,uLines,uDelta,uReset;
uniform float uFastDecay,uSlowDecay,uFastTau,uSlowTau;
void main(){
 float lum=dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722));
 float drive=clamp((lum-uBase)/max(.001,1.0-uBase),0.0,1.0);
 // Position within a complete top-to-bottom raster cycle.
 float row=floor(clamp(1.0-vUv.y,0.0,.999999)*uLines);
 float pos=(row+clamp(vUv.x,0.0,.999999))/uLines;
 float ageCycles=mod(uPhase-pos+1.0,1.0);
 float hit=step(ageCycles,uCycles);
 // Line footprint is from beam geometry, not the old decorative mask.
 float lineY=fract((1.0-vUv.y)*uLines);
 float spot=exp(-.5*pow(abs(lineY-.5)/.32,2.0));
 // Frame-averaged exposure for subframe phosphors avoids aliasing P31
 // into black on 60 Hz LCD/OLED panels.
 float fastExp=clamp(max(1.0,1.0/(uHz*uFastTau))*
  uFastTau/max(uDelta,.001)*(1.0-exp(-uDelta/uFastTau)),0.0,1.0);
 float slowExp=clamp(max(1.0,1.0/(uHz*uSlowTau))*
  uSlowTau/max(uDelta,.001)*(1.0-exp(-uDelta/uSlowTau)),0.0,1.0);
 float age=ageCycles/uHz;
 // Smartphone output integrates sub-frame emission from very fast tubes;
 // do not sample their microsecond pulse at an arbitrary raster phase.
 float ageFast=uFastTau<.5/uHz?0.0:age;
 float ageSlow=uSlowTau<.5/uHz?0.0:age;
 vec2 eventLight=hit*drive*spot*
  vec2(fastExp*exp(-ageFast/uFastTau),
       slowExp*exp(-ageSlow/uSlowTau));
 vec2 prior=texture2D(tPrevious,vUv).rg;
 prior*=prior;
 vec2 lit=max(prior*vec2(uFastDecay,uSlowDecay),eventLight);
 if(uReset>.5)lit=eventLight;
 gl_FragColor=vec4(sqrt(clamp(lit,0.0,1.0)),sqrt(drive),1.0);
}`;
const outputFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tHistory;
uniform vec2 uWeights;
uniform float uBase;
void main(){
 float nowL=dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722));
 float signal=clamp((nowL-uBase)/max(.001,1.0-uBase),0.0,1.0);
 vec3 packed=texture2D(tHistory,vUv).rgb;
 vec2 lit=packed.rg*packed.rg;
 float downsampled=packed.b*packed.b;
 float emission=dot(lit,uWeights);
 // Details use the high-res video signal, gated by actual raster history.
 // Old emission remains when current video at this location goes dark.
 float present=signal*clamp(emission/max(.015,downsampled),0.0,1.4);
 float lingering=max(0.0,emission-downsampled);
 float outputLight=clamp(max(present,lingering),0.0,1.0);
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*outputLight),1.0);
}`;
const BASE=8/255;
const BASE_LINEAR=BASE<=.04045?BASE/12.92:Math.pow((BASE+.055)/1.055,2.4);
export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let profile=phosphorProfile('balanced'),hz=60;
 let width=1,height=1,read=null,write=null,pendingReset=true,phase=0;
 const state={
  tSource:{value:null},tPrevious:{value:null},uBase:{value:BASE_LINEAR},
  uPhase:{value:0},uCycles:{value:0},uHz:{value:hz},uLines:{value:240},
  uDelta:{value:1/60},uFastTau:{value:.005},uSlowTau:{value:.19},
  uFastDecay:{value:0},uSlowDecay:{value:0},uReset:{value:1}
 };
 const display={
  tSource:{value:null},tHistory:{value:null},
  uWeights:{value:new THREE.Vector2(profile.fastWeight,profile.slowWeight)},
  uBase:{value:BASE_LINEAR}
 };
 const update=new THREE.ShaderMaterial({uniforms:state,vertexShader:vertex,
  fragmentShader:historyFragment,depthTest:false,depthWrite:false,
  blending:THREE.NoBlending});
 const output=new THREE.ShaderMaterial({uniforms:display,vertexShader:vertex,
  fragmentShader:outputFragment,depthTest:false,depthWrite:false,
  blending:THREE.NoBlending});
 const quad=new FullScreenQuad(update);
 function allocate(){
  read?.dispose();write?.dispose();
  const w=Math.max(1,Math.ceil(width/2)),h=Math.max(1,Math.ceil(height/2));
  const options={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  read=new THREE.WebGLRenderTarget(w,h,options);
  write=new THREE.WebGLRenderTarget(w,h,options);
  read.texture.colorSpace=THREE.NoColorSpace;
  write.texture.colorSpace=THREE.NoColorSpace;
  state.uLines.value=crtRasterLines(h);
  pendingReset=true;phase=0;
 }
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const a=Math.max(1,Math.ceil(w)),b=Math.max(1,Math.ceil(h));
  if(a===width&&b===height)return;
  width=a;height=b;
  if(read||write)allocate();
 };
 pass.reset=()=>{pendingReset=true;phase=0;};
 pass.configure=(id,rate=60)=>{
  const p=phosphorProfile(id),r=normalizeCRTRefresh(rate);
  if(profile.id!==p.id||hz!==r)pass.reset();
  profile=p;hz=r;
  display.uWeights.value.set(p.fastWeight,p.slowWeight);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!read||!write)allocate();
  const dt=Math.max(.001,Math.min(.1,Number(deltaTime)||1/60));
  const cycles=dt*hz;
  phase=advanceCRTPhase(phase,dt,hz);
  state.tSource.value=readBuffer.texture;
  state.tPrevious.value=read.texture;
  state.uPhase.value=phase;
  state.uCycles.value=cycles;
  state.uHz.value=hz;
  state.uFastTau.value=profile.fastTau;
  state.uSlowTau.value=profile.slowTau;
  state.uFastDecay.value=Math.exp(-dt/profile.fastTau);
  state.uSlowDecay.value=Math.exp(-dt/profile.slowTau);
  state.uDelta.value=dt;
  state.uReset.value=pendingReset?1:0;
  quad.material=update;
  renderer.setRenderTarget(write);
  quad.render(renderer);
  display.tSource.value=readBuffer.texture;
  display.tHistory.value=write.texture;
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
