/* NOMAD continuous LCD experiment v279.
 * Standalone full-resolution display-behaviour engine.
 * DMG-01 reference physics retained separately at dmg01-strict.js and
 * dmg01-reference-lab/. Neither is imported into the running application.
 *
 * Inspired by the reference's model decomposition (row load, column loading,
 * time-dependent director and ionic charge, reflective optical palette).
 * This is an experimental APPROXIMATION, not an electrically identical
 * passive-matrix DMG-01, since there are no discrete DMG electrodes here.
 */
import * as THREE from './vendor/three/three.bundle.js';

const VERTEX='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
// First stage: estimate load across each horizontal row, retaining the
// original pixel as R and the row-wide average as G. No quantization.
const ROW=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSource;
float light(vec2 uv){
 return dot(texture2D(tSource,uv).rgb,vec3(0.2126,0.7152,0.0722));
}
void main(){
 float individual=light(vUv);
 float total=0.0;
 for(int i=0;i<8;i++){
  total+=light(vec2((float(i)+0.5)/8.0,vUv.y));
 }
 gl_FragColor=vec4(individual,total/8.0,0.0,1.0);
}`;
// Second stage: estimate column loading on the same compact electrical
// field. The original artwork never passes through this lower-resolution
// intermediate image; it is sampled directly by the next native-pixel pass.
const COLUMN=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tRow;
void main(){
 vec4 center=texture2D(tRow,vUv);
 float columnMean=0.0;
 for(int i=0;i<8;i++){
  columnMean+=texture2D(tRow,vec2(vUv.x,(float(i)+0.5)/8.0)).r;
 }
 columnMean/=8.0;
 gl_FragColor=vec4(center.g,columnMean,0.0,1.0);
}`;
// Third stage: analog liquid-crystal orientation and independently accumulating
// adsorbed-ion memory. Both are integrated at every DISPLAY pixel. One
// frame of input history accounts for row-latch ordering during transitions.
// Stored R is sqrt(director) and GB are a 16-bit ion value, so slow ionic
// changes survive RGBA8 feedback. A stores the previous input drive.
const TEMPORAL=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tOriginal,tElectric,tPrevious;
uniform float uDelta,uReset,uTemperatureC;
float unpackIon(vec2 gb){
 float hi=floor(gb.x*255.0+0.5);
 float lo=floor(gb.y*255.0+0.5);
 return (hi*256.0+lo)/65535.0;
}
vec2 packIon(float c){
 float value=floor(clamp(c,0.0,1.0)*65535.0+0.5);
 return vec2(floor(value/256.0),mod(value,256.0))/255.0;
}
void main(){
 // The full-resolution original pixel is never downsampled. Only its
 // electrical surroundings are calculated on a compact shared field.
 float raw=dot(texture2D(tOriginal,vUv).rgb,vec3(.2126,.7152,.0722));
 vec2 load=texture2D(tElectric,vUv).rg;
 float effective=clamp(raw+0.026*(load.r-raw)+0.018*(load.g-raw),0.0,1.0);
 float drive=1.0-effective;
 vec4 previous=texture2D(tPrevious,vUv);
 float director=previous.r*previous.r;
 float ionic=unpackIon(previous.gb);
 float previousDrive=previous.a;
 if(uReset>0.5){
  director=drive;
  previousDrive=drive;
  ionic=0.0;
 }
 // A row is latched in sequence during the refresh interval; approximate
 // the exposure split without introducing visible row or column tiles.
 float latchPosition=clamp(1.0-vUv.y,0.0,1.0);
 float exposedDrive=mix(previousDrive,drive,1.0-0.18*latchPosition);
 float target=smoothstep(0.015,0.985,exposedDrive);
 // Original-model-inspired asymmetric transitions, modulated by viscosity
 // versus panel temperature. This is NOT the source's measured STN LUT.
 float temperature=exp(0.042*(uTemperatureC-20.0));
 float tau=(target>director?0.110:0.190)/temperature;
 float alpha=1.0-exp(-uDelta/max(0.005,tau));
 director=mix(director,target,alpha);
 // Retain the original reference model's slow per-frame charge and release
 // coefficients, evaluated at the actual time elapsed.
 float k=drive>ionic?0.000126777389:0.000007115625;
 float ionAlpha=1.0-pow(1.0-k,uDelta*59.7275);
 ionic=mix(ionic,drive,ionAlpha);
 gl_FragColor=vec4(sqrt(clamp(director,0.0,1.0)),
  packIon(ionic),drive);
}`;
// Fourth stage: the upstream reference's measured DMG-01 optical palette,
// interpolated continuously, without pixel apertures or reflector gap shadows.
// Output linear RGB, leaving the app's existing OutputPass responsible for
// converting it to the device's display colour space.
const OPTICAL=String.raw`
precision highp float;
varying vec2 vUv;
uniform sampler2D tState;
float unpackIon(vec2 gb){
 float hi=floor(gb.x*255.0+0.5);
 float lo=floor(gb.y*255.0+0.5);
 return (hi*256.0+lo)/65535.0;
}
vec3 linearize(vec3 c){
 vec3 lo=c/12.92;
 vec3 hi=pow((max(c,vec3(0.0))+0.055)/1.055,vec3(2.4));
 return mix(lo,hi,step(vec3(0.04045),c));
}
vec3 opticalColour(float darkness){
 vec3 a=linearize(vec3(117.0,152.0,51.0)/255.0);
 vec3 b=linearize(vec3(88.0,143.0,81.0)/255.0);
 vec3 c=linearize(vec3(59.0,117.0,96.0)/255.0);
 vec3 d=linearize(vec3(46.0,97.0,90.0)/255.0);
 float x=clamp(darkness,0.0,1.0)*3.0;
 if(x<1.0)return mix(a,b,x);
 if(x<2.0)return mix(b,c,x-1.0);
 return mix(c,d,x-2.0);
}
void main(){
 vec4 state=texture2D(tState,vUv);
 float director=state.r*state.r;
 float ionic=unpackIon(state.gb);
 // After-image retention is tied to long-term stored ionic charge.
 float darkness=clamp(director+0.09*(ionic-director),0.0,1.0);
 gl_FragColor=vec4(opticalColour(darkness),1.0);
}`;

const shader=(fragment,uniforms)=>new THREE.ShaderMaterial({
 uniforms,vertexShader:VERTEX,fragmentShader:fragment,
 depthWrite:false,depthTest:false,blending:THREE.NoBlending
});
const options={depthBuffer:false,stencilBuffer:false,
 format:THREE.RGBAFormat,type:THREE.UnsignedByteType,
 minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter};

export function createContinuousLCDPass(){
 const pass=new THREE.Pass();
 pass.needsSwap=true;
 pass.enabled=false;
 let width=1,height=1,row=null,drive=null,history=[null,null],active=0,first=true;
 let fieldW=1,fieldH=1;
 const rowU={tSource:{value:null}};
 const columnU={tRow:{value:null}};
 const timeU={tOriginal:{value:null},tElectric:{value:null},tPrevious:{value:null},
  uDelta:{value:1/60},uReset:{value:1},uTemperatureC:{value:20}};
 const outputU={tState:{value:null}};
 const mats=[
  shader(ROW,rowU),shader(COLUMN,columnU),
  shader(TEMPORAL,timeU),shader(OPTICAL,outputU)
 ];
 const quad=new THREE.FullScreenQuad(mats[0]);
 function disposeTargets(){
  row?.dispose();drive?.dispose();
  for(const h of history)h?.dispose();
  row=null;drive=null;history=[null,null];
 }
 function target(w=width,h=height){
  const t=new THREE.WebGLRenderTarget(w,h,options);
  t.texture.colorSpace=THREE.NoColorSpace;
  return t;
 }
 function allocate(){
  disposeTargets();
  // Row/column loading is a shared electrical effect, not an image.
  // Keep it compact; only the director/ionic state requires one sample per
  // actual display pixel. This avoids the two full-resolution 8-tap passes
  // that overwhelmed mobile Safari in v278.
  fieldW=Math.min(96,Math.max(16,Math.ceil(width/8)));
  fieldH=Math.min(192,Math.max(16,Math.ceil(height/8)));
  row=target(fieldW,fieldH);
  drive=target(fieldW,fieldH);
  history=[target(),target()];
  active=0;first=true;
 }
 pass.setSize=(w,h)=>{
  const x=Math.max(1,Math.ceil(w)),y=Math.max(1,Math.ceil(h));
  if(x===width&&y===height)return;
  width=x;height=y;
  if(row||drive||history.some(Boolean))allocate();
 };
 pass.reset=()=>{first=true;};
 pass.configure=()=>{}; // No screen-resolution or physical cell layout required.
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(readBuffer.width!==width||readBuffer.height!==height)
   pass.setSize(readBuffer.width,readBuffer.height);
  if(!row||!drive||!history[0])allocate();
  rowU.tSource.value=readBuffer.texture;
  quad.material=mats[0];renderer.setRenderTarget(row);quad.render(renderer);
  columnU.tRow.value=row.texture;
  quad.material=mats[1];renderer.setRenderTarget(drive);quad.render(renderer);
  const next=1-active;
  timeU.tOriginal.value=readBuffer.texture;
  timeU.tElectric.value=drive.texture;
  timeU.tPrevious.value=history[active].texture;
  timeU.uDelta.value=Math.max(0.001,Math.min(0.1,Number(deltaTime)||1/60));
  timeU.uReset.value=first?1:0;
  quad.material=mats[2];renderer.setRenderTarget(history[next]);quad.render(renderer);
  outputU.tState.value=history[next].texture;
  quad.material=mats[3];
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  quad.render(renderer);
  active=next;first=false;
 };
 pass.dispose=()=>{
  disposeTargets();
  quad.dispose();
  for(const mat of mats)mat.dispose();
 };
 return pass;
}
