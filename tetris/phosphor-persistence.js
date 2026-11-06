/* NOMAD V104 — spatially local, full-display phosphor persistence.
 * Preserve the V103 temporal envelope: 12ms excitation, 10-120ms decay.
 * Only the luminance at the SAME native-resolution pixel influences its
 * history. No spatial point-spread, kernel, bloom, or scanline filtering.
 * The downstream artistic Bloom pass exclusively owns glow and halation;
 * the downstream CRT mask independently owns optional static scanlines.
 * No reset on game pause or menu transition.
 */
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {normalizePersistenceMs,PHOSPHOR_BOUNDS}
 from './phosphor-model.js?v104';

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
 // Sqrt encoding preserves faint emission in RGBA8; this texture stores
 // ONLY the local emission history, not spatially scattered energy.
 gl_FragColor=vec4(sqrt(clamp(emitted,0.0,1.0)),0.0,0.0,1.0);
}`;

const outputFragment=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tHistory;
uniform float uBase;
void main(){
 float encoded=texture2D(tHistory,vUv).r;
 float emitted=encoded*encoded;
 gl_FragColor=vec4(vec3(uBase+(1.0-uBase)*emitted),1.0);
}`;

const BASE_SRGB=8/255;
const BASE=BASE_SRGB<=.04045?BASE_SRGB/12.92:
 Math.pow((BASE_SRGB+.055)/1.055,2.4);
export function createPhosphorPersistencePass(){
 const pass=new Pass();
 let width=1,height=1,read=null,write=null;
 let decayMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,first=true;
 const history={
  tSource:{value:null},tPrevious:{value:null},uBase:{value:BASE},
  uDelta:{value:1/60},uDecayTau:{value:decayMs/1000},
  uRiseTau:{value:PHOSPHOR_BOUNDS.riseMs/1000},uReset:{value:1}
 };
 const display={tHistory:{value:null},uBase:{value:BASE}};
 const createMaterial=(uniforms,fragmentShader)=>new THREE.ShaderMaterial({
  uniforms,vertexShader:vertex,fragmentShader,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending
 });
 const update=createMaterial(history,historyFragment);
 const output=createMaterial(display,outputFragment);
 const quad=new FullScreenQuad(update);
 function allocate(){
  read?.dispose();write?.dispose();
  const options={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  const make=()=>{
   const rt=new THREE.WebGLRenderTarget(width,height,options);
   rt.texture.colorSpace=THREE.NoColorSpace;
   return rt;
  };
  // Full physical display resolution prevents past pixels from bleeding
  // into nearby glyph edges due to lower-resolution history interpolation.
  read=make();write=make();first=true;
 }
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const x=Math.max(1,Math.ceil(w)),y=Math.max(1,Math.ceil(h));
  if(x===width&&y===height)return;
  width=x;height=y;
  if(read||write)allocate();
 };
 pass.reset=()=>{first=true;};
 pass.configure=(persistenceMs=PHOSPHOR_BOUNDS.defaultPersistenceMs)=>{
  decayMs=normalizePersistenceMs(persistenceMs);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!read||!write)allocate();
  const dt=Math.max(.001,Math.min(.1,Number(deltaTime)||1/60));
  history.tSource.value=readBuffer.texture;
  history.tPrevious.value=read.texture;
  history.uDelta.value=dt;
  history.uDecayTau.value=decayMs/1000;
  history.uReset.value=first?1:0;
  quad.material=update;
  renderer.setRenderTarget(write);
  quad.render(renderer);

  display.tHistory.value=write.texture;
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
