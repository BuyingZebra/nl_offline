/* NOMAD V099 — neutral raster excitation with frame-integrated persistence.
 * Source Canvas2D values control a left-right, top-bottom scanning beam.
 * Phosphor emission is integrated over presentation time, avoiding V098's
 * dark scan snapshots and its non-physical max() excitation.
 * A single adjustable exponential tau is a deliberate first-order model.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {CRT_BOUNDS,normalizeCRTRefresh,normalizePersistenceMs,
 advanceCRTPhase,crtRasterLines} from './phosphor-model.js?v099';

const vertex=String.raw`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const excitationFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tPrevious;
uniform float uBase,uPhase,uCycles,uHz,uLines,uDelta,uTau,uReset;
const float STORE_SCALE=8.0;
void main(){
 float source=dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722));
 float drive=clamp((source-uBase)/max(0.001,1.0-uBase),0.0,1.0);

 // One continuous raster: left-right across each line; top-bottom by line.
 float row=floor(clamp(1.0-vUv.y,0.0,0.999999)*uLines);
 float pos=(row+clamp(vUv.x,0.0,0.999999))/uLines;
 float endRelative=uPhase-pos;
 float visits=max(0.0,floor(endRelative+0.000001)-
  floor(endRelative-uCycles+0.000001));
 float age=fract(endRelative+1.0)/uHz;

 // Narrow spot plus nearest-line overlap. Unlike the V098 spot mask,
 // this has only subtle line-to-line contrast (~7%).
 float distanceToLine=abs(fract((1.0-vUv.y)*uLines)-0.5);
 float spot=(exp(-0.5*pow(distanceToLine/0.42,2.0))+
  exp(-0.5*pow((1.0-distanceToLine)/0.42,2.0)))/1.059;

 float prior=0.0;
 if(uReset<0.5){
  float state=texture2D(tPrevious,vUv).r;
  prior=state*state*STORE_SCALE;
 }
 float period=1.0/uHz;
 float atten=exp(-uDelta/uTau);
 float aged=exp(-age/uTau);
 float ratio=visits>0.5?
  (1.0-exp(-visits*period/uTau))/
   max(0.000001,1.0-exp(-period/uTau)):0.0;

 // Each scan deposits Q=drive*spot*T/tau. The exact exponential
 // integral yields a steady frame-AVERAGED emission equal to drive*spot.
 float excitation=drive*spot*period/uTau;
 float endState=prior*atten+excitation*aged*ratio;
 float integrated=prior*uTau*(1.0-atten)+
  excitation*uTau*(visits-aged*ratio);
 float average=max(0.0,integrated/max(0.000001,uDelta));

 // R=end-of-frame phosphor energy; G=integrated emission; B=video drive.
 // Sqrt encoding on low-cost RGBA8 buffers protects faint afterglow.
 gl_FragColor=vec4(sqrt(clamp(endState/STORE_SCALE,0.0,1.0)),
  sqrt(clamp(average/STORE_SCALE,0.0,1.0)),sqrt(drive),1.0);
}`;

const emissionFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource,tHistory;
uniform float uBase;
const float STORE_SCALE=8.0;
void main(){
 float luma=dot(texture2D(tSource,vUv).rgb,vec3(.2126,.7152,.0722));
 float drive=clamp((luma-uBase)/max(0.001,1.0-uBase),0.0,1.0);
 vec3 memory=texture2D(tHistory,vUv).rgb;
 float mean=memory.g*memory.g*STORE_SCALE;
 float sampledDrive=memory.b*memory.b;
 // Use the full-res grayscale signal for crisp glyph and tile edges.
 // Raster history governs excitation, not an unconditional source overlay.
 float present=drive*clamp(mean/max(0.025,sampledDrive),0.0,2.0);
 // Phosphor continues to glow where video drive has disappeared.
 float lingering=max(0.0,mean-sampledDrive);
 float emitted=clamp(max(present,lingering),0.0,1.0);
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*emitted),1.0);
}`;

const SRGB_BASE=8/255;
const LINEAR_BASE=SRGB_BASE<=0.04045?SRGB_BASE/12.92:
 Math.pow((SRGB_BASE+0.055)/1.055,2.4);

export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let hz=CRT_BOUNDS.defaultHz,ms=CRT_BOUNDS.defaultPersistenceMs;
 let width=1,height=1,read=null,write=null,phase=0,pendingReset=true;
 const state={
  tSource:{value:null},tPrevious:{value:null},uBase:{value:LINEAR_BASE},
  uPhase:{value:0},uCycles:{value:0},uHz:{value:hz},uLines:{value:240},
  uDelta:{value:1/60},uTau:{value:ms/1000},uReset:{value:1}
 };
 const display={
  tSource:{value:null},tHistory:{value:null},uBase:{value:LINEAR_BASE}
 };
 const updateMaterial=new THREE.ShaderMaterial({
  uniforms:state,vertexShader:vertex,fragmentShader:excitationFragment,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending
 });
 const displayMaterial=new THREE.ShaderMaterial({
  uniforms:display,vertexShader:vertex,fragmentShader:emissionFragment,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending
 });
 const quad=new FullScreenQuad(updateMaterial);
 const allocate=()=>{
  read?.dispose();write?.dispose();
  const w=Math.max(1,Math.ceil(width/2)),h=Math.max(1,Math.ceil(height/2));
  const opts={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  read=new THREE.WebGLRenderTarget(w,h,opts);
  write=new THREE.WebGLRenderTarget(w,h,opts);
  read.texture.colorSpace=THREE.NoColorSpace;
  write.texture.colorSpace=THREE.NoColorSpace;
  state.uLines.value=crtRasterLines(h);
  phase=0;pendingReset=true;
 };
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const a=Math.max(1,Math.ceil(w)),b=Math.max(1,Math.ceil(h));
  if(a===width&&b===height)return;
  width=a;height=b;
  if(read||write)allocate();
 };
 pass.reset=()=>{phase=0;pendingReset=true;};
 pass.configure=(refreshHz=60,persistenceMs=190)=>{
  // Sliders change simulation parameters without wiping all phosphor light.
  hz=normalizeCRTRefresh(refreshHz);
  ms=normalizePersistenceMs(persistenceMs);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!read||!write)allocate();
  const dt=Math.max(0.001,Math.min(0.1,Number(deltaTime)||1/60));
  const cycles=dt*hz;
  phase=advanceCRTPhase(phase,dt,hz);
  state.tSource.value=readBuffer.texture;
  state.tPrevious.value=read.texture;
  state.uPhase.value=phase;
  state.uCycles.value=cycles;
  state.uHz.value=hz;
  state.uDelta.value=dt;
  state.uTau.value=ms/1000;
  state.uReset.value=pendingReset?1:0;
  quad.material=updateMaterial;
  renderer.setRenderTarget(write);
  quad.render(renderer);
  display.tSource.value=readBuffer.texture;
  display.tHistory.value=write.texture;
  quad.material=displayMaterial;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
  [read,write]=[write,read];
  pendingReset=false;
 };
 pass.dispose=()=>{
  read?.dispose();write?.dispose();read=null;write=null;
  updateMaterial.dispose();displayMaterial.dispose();quad.dispose();
 };
 return pass;
}
