
/*
 * NOMAD physical LCD — experimental DMG-inspired reflective STN material.
 * Sources/attribution: lcd-lab/CREDITS.md and tetris/PHYSICAL-LCD.md.
 * Uses Retro Display Lab's nominal 20°C STN drift/optical lookup data
 * (Apache-2.0); this does NOT duplicate its full RC electrical model.
 *
 * Scene colour -> 4 shade electrical drive -> individual per-cell director
 * history -> computed optical transmission -> analytic cell aperture +
 * reflector shadow -> physical-display image. No framebuffer readbacks.
 */
import * as THREE from './vendor/three/three.bundle.js';
import {REFRESH_HZ,TARGET_Q,DRIFT_Q,OPTICAL_LUT,ANCHOR_Q,CORRECTION,PALETTE} from './physical-lcd-data.js?v266';
const {Pass,FullScreenQuad}=THREE;
const VERTEX='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
// Same density-to-logical-cell calculation is used by the renderer and live
// properties readout. CSS viewport dimensions do not change output resolution.
export function physicalLCDGrid(width,height,density=1.5){
 const d=clamp(Number.isFinite(Number(density))?Number(density):1.5,1,2.5);
 return Object.freeze({
  columns:Math.max(1,Math.ceil(Math.max(1,Number(width)||1)*d/2.5)),
  rows:Math.max(1,Math.ceil(Math.max(1,Number(height)||1)*d/2.5))
 });
}
function srgbLinear(v){
 const x=v/255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
}
function palette(rgb){return rgb.map(ch=>new THREE.Color().setRGB(...ch.map(srgbLinear)));}
const palettes={
 reference:palette(PALETTE),
 // A comparison profile, deliberately NOT a measured historical panel.
 nomad:palette([[124,137,86],[180,198,139],[143,170,111],[87,128,94],[45,83,63]])
};
// The trimmed NOMAD Three.js bundle deliberately exports CanvasTexture but
// NOT DataTexture, FloatType or RedFormat. Pack each LUT entry to 16-bit RG
// unorm (8 bits per canvas channel); no float-texture extension is needed.
function lookupTexture(samples,width,height,{signed=false}={}){
 if(samples.length!==width*height)throw Error('Physical LCD LUT shape mismatch');
 const canvas=document.createElement('canvas');
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw Error('Physical LCD lookup canvas unavailable');
 const picture=ctx.createImageData(width,height);
 for(let i=0;i<samples.length;i++){
  const encoded=clamp(signed?samples[i]+.5:samples[i],0,1);
  const value=Math.round(encoded*65535),p=i*4;
  picture.data[p]=(value>>8)&255;
  picture.data[p+1]=value&255;
  picture.data[p+2]=0;
  picture.data[p+3]=255;
 }
 ctx.putImageData(picture,0,0);
 const texture=new THREE.CanvasTexture(canvas);
 texture.flipY=false; // shader row 0 corresponds to the first canvas row
 texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
 texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;
 texture.needsUpdate=true;return texture;
}
const PRELUDE=`
 precision highp float;
 varying vec2 vUv;
 uniform sampler2D uDrift,uOptical;
 uniform float uTarget[4],uAnchor[4],uCorrection[4];
 float unpackRG(vec4 c){
  vec2 bytes=floor(c.rg*255.0+0.5);
  return dot(bytes,vec2(256.0,1.0))/65535.0;
 }
 float lut(sampler2D tex,float x,float row,float height){
  float p=clamp(x,0.0,1.0)*64.0;
  float low=floor(p),alpha=fract(p);
  float a=unpackRG(texture2D(tex,vec2((low+.5)/65.0,(row+.5)/height)));
  float b=unpackRG(texture2D(tex,vec2((min(64.0,low+1.0)+.5)/65.0,(row+.5)/height)));
  return mix(a,b,alpha);
 }
 float targetQ(float drive){
  int i=int(clamp(floor(drive+.5),0.0,3.0));
  return uTarget[i];
 }
 float drift(float drive,float q){
  return lut(uDrift,q,clamp(floor(drive+.5),0.0,3.0),4.0)-0.5;
 }
 float optical(float q){
  float s=lut(uOptical,q,0.0,1.0),c;
  if(q<=uAnchor[0])c=uCorrection[0]*q/max(uAnchor[0],.000001);
  else if(q<=uAnchor[3]){
   int n=q<=uAnchor[1]?0:q<=uAnchor[2]?1:2;
   c=mix(uCorrection[n],uCorrection[n+1],
    (q-uAnchor[n])/max(.000001,uAnchor[n+1]-uAnchor[n]));
  }else c=uCorrection[3]*(1.0-q)/max(.000001,1.0-uAnchor[3]);
  return clamp(s+c,.25,1.0);
 }
`;
const STATE_FRAGMENT=PRELUDE+`
 uniform sampler2D tSource,tHistory;
 uniform float uDelta,uTemperature,uReset;
 vec2 pack16(float v){
  float n=floor(clamp(v,0.0,1.0)*65535.0+.5);
  return vec2(floor(n/256.0),mod(n,256.0))/255.0;
 }
 float unpack16(vec2 p){return dot(floor(p*255.0+.5),vec2(256.0,1.0))/65535.0;}
 void main(){
  vec3 scene=texture2D(tSource,vUv).rgb;
  // The UI is authored in grayscale; sample at the cell's physical center.
  float lum=dot(scene,vec3(.2126,.7152,.0722));
  // Recover the Canvas2D artwork's encoded grey before quantizing drive.
  // The compositor samples textures in linear light; quantizing there would
  // incorrectly make light-grey panels into middle Game Boy shades.
  float sourceGrey=lum<=.0031308?lum*12.92:1.055*pow(lum,1.0/2.4)-.055;
  float drive=floor(clamp(1.0-sourceGrey,0.0,1.0)*3.0+.5);
  vec4 previous=texture2D(tHistory,vUv);
  float q=uReset>.5?targetQ(drive):unpack16(previous.rg);
  float ions=uReset>.5?0.0:previous.b;
  float tScale=exp(3800.0*(1.0/293.15-1.0/(uTemperature+273.15)));
  float frames=min(.08,max(0.0,uDelta))*59.7275000;
  int n=int(clamp(ceil(frames/.45),1.0,12.0));
  float fraction=frames/float(n);
  if(uReset<.5)for(int step=0;step<12;step++){
   if(step>=n)break;
   q=clamp(q+drift(drive,q)*fraction*tScale,0.0,1.0);
   float aim=drive/3.0;
   float rate=aim>ions?.000126777389:.000007115625;
   ions=mix(ions,aim,1.0-pow(1.0-rate,fraction));
  }
  float opticalState=optical(q);
  float bias=max(ions-drive/3.0,0.0)*max(7.390426*.05-.186987,0.0)*.082;
  opticalState=clamp(opticalState+bias,.25,1.0);
  gl_FragColor=vec4(pack16(q),ions,opticalState);
 }`;
const OUTPUT_FRAGMENT=`
 precision highp float;varying vec2 vUv;
 uniform sampler2D uState;
 uniform vec2 uGrid,uOutputSize;
 uniform vec3 uPalette[5];
 uniform float uFill,uFootprint,uShadow,uShadowX,uShadowY,uBrightness,uChroma;
 uniform float uGlass,uLightAngle,uViewAngle;
 vec3 enc(vec3 x){
  return mix(x*12.92,1.055*pow(max(x,vec3(0.0)),vec3(1./2.4))-.055,
   step(vec3(.0031308),x));
 }
 vec3 opticalColour(float s){
  float p=clamp(s,0.,1.)*4.;
  if(p<1.)return mix(uPalette[0],uPalette[1],p);
  if(p<2.)return mix(uPalette[1],uPalette[2],p-1.);
  if(p<3.)return mix(uPalette[2],uPalette[3],p-2.);
  return mix(uPalette[3],uPalette[4],p-3.);
 }
 float stateAt(vec2 p){
  vec2 uv=(clamp(floor(p),vec2(0.),uGrid-vec2(1.))+.5)/uGrid;
  return texture2D(uState,uv).a;
 }
 float coverage1(float p,float gap,float footprint){
  float center=fract(p);
  float lower=.5-uFill*.5+gap,upper=.5+uFill*.5+gap;
  float sampleLow=center-footprint*.5,sampleHigh=center+footprint*.5;
  float sum=0.;
  for(int i=-1;i<=1;i++){
   float z=float(i);
   sum+=max(0.,min(sampleHigh,upper+z)-max(sampleLow,lower+z));
  }
  return clamp(sum/max(.00001,footprint),0.,1.);
 }
 float aperture(vec2 p,vec2 fp){
  return coverage1(p.x,0.,fp.x)*coverage1(p.y,0.,fp.y);
 }
 float jointAxis(float pos,float offset,float fp){
  float low=.5-uFill*.5,high=.5+uFill*.5;
  float base=floor(pos),shadowBase=floor(pos-offset);
  float a=pos-fp*.5,b=pos+fp*.5,sum=0.;
  for(int i=-1;i<=1;i++){
   float a0=base+float(i)+low,a1=base+float(i)+high;
   for(int j=-1;j<=1;j++){
    float b0=shadowBase+float(j)+offset+low;
    float b1=shadowBase+float(j)+offset+high;
    sum+=max(0.,min(b,min(a1,b1))-max(a,max(a0,b0)));
   }
  }
  return clamp(sum/max(.00001,fp),0.,1.);
 }
 void main(){
  vec2 p=vUv*uGrid;
  vec2 footprint=max(uGrid/max(uOutputSize,vec2(1.))*max(.01,uFootprint),vec2(.00001));
  float s=stateAt(p);
  vec3 background=opticalColour(0.);
  float mask=aperture(p,footprint);
  vec3 rgb=mix(background,opticalColour(s),mask);
  vec2 shift=vec2(uShadowX,uShadowY);
  float shaded=stateAt(p-shift);
  float displaced=aperture(p-shift,footprint);
  float joint=jointAxis(p.x,shift.x,footprint.x)*jointAxis(p.y,shift.y,footprint.y);
  float shadowGap=max(displaced-joint,0.);
  rgb=max(vec3(0.),rgb-background*uShadow*shaded*shadowGap);
  float gray=dot(rgb,vec3(.2126,.7152,.0722));
  rgb=mix(vec3(gray),rgb,uChroma)*uBrightness;
  // Optional FRONT GLASS. This is a separate artistic optical-surface model,
  // adapted from /lcd-lab/, not part of the sourced STN response reconstruction.
  // It does not alter the simulated cell state, aperture or reflector shadows.
  if(uGlass>0.0){
   vec2 panel=vec2(vUv.x,1.0-vUv.y);
   float angle=radians(uLightAngle);
   vec2 lightAxis=vec2(cos(angle),sin(angle));
   float along=dot(panel-vec2(.5),lightAxis);
   float distanceToHighlight=(along-.14)/.16;
   float highlight=exp(-distanceToHighlight*distanceToHighlight);
   float grazing=pow(clamp(.08+abs(uViewAngle)/45.0,0.0,1.0),3.0);
   float reflection=clamp((.037*highlight+.015*grazing)*uGlass,0.0,1.0);
   rgb=mix(rgb,vec3(.86,.92,.86),reflection);
   rgb*=1.0-uGlass*.045*pow(abs(panel.x-.5)*2.0,5.0);
  }
  // EffectComposer expects LINEAR RGB; OutputPass performs display encoding.
  gl_FragColor=vec4(max(vec3(0.),rgb),1.0);
 }`;
function newMaterial(uniforms,fragmentShader){
 return new THREE.ShaderMaterial({uniforms,vertexShader:VERTEX,fragmentShader,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending});
}
export function createPhysicalLCDPass(){
 const pass=new Pass();
 const driftTexture=lookupTexture(DRIFT_Q,65,4,{signed:true});
 const opticalTexture=lookupTexture(OPTICAL_LUT,65,1);
 const common={
  uDrift:{value:driftTexture},uOptical:{value:opticalTexture},
  uTarget:{value:TARGET_Q},uAnchor:{value:ANCHOR_Q},uCorrection:{value:CORRECTION}
 };
 const stateUniforms={...common,tSource:{value:null},tHistory:{value:null},
  uDelta:{value:1/60},uTemperature:{value:20},uReset:{value:1}};
 const outputUniforms={
  uState:{value:null},uGrid:{value:new THREE.Vector2(160,320)},
  uOutputSize:{value:new THREE.Vector2(1,1)},
  uPalette:{value:palettes.reference},
  uFill:{value:.875},uFootprint:{value:1},
  uShadow:{value:.18},uShadowX:{value:.11},uShadowY:{value:.13},
  uBrightness:{value:1},uChroma:{value:1},
  uGlass:{value:0},uLightAngle:{value:35},uViewAngle:{value:0}
 };
 const stateMaterial=newMaterial(stateUniforms,STATE_FRAGMENT);
 const outputMaterial=newMaterial(outputUniforms,OUTPUT_FRAGMENT);
 const quad=new FullScreenQuad(stateMaterial);
 let gridWidth=1,gridHeight=1,targetA=null,targetB=null,reset=true;
 let configured=false,cssWidth=1,cssHeight=1,density=1.5;
 function allocate(){
  targetA?.dispose();targetB?.dispose();
  const opts={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  const make=()=>{const rt=new THREE.WebGLRenderTarget(gridWidth,gridHeight,opts);
   rt.texture.colorSpace=THREE.NoColorSpace;return rt;};
  targetA=make();targetB=make();reset=true;
 }
 function setGrid(){
  const {columns,rows}=physicalLCDGrid(cssWidth,cssHeight,density);
  if(gridWidth!==columns||gridHeight!==rows){
   gridWidth=columns;gridHeight=rows;
   if(targetA||targetB)allocate();
  }
  outputUniforms.uGrid.value.set(gridWidth,gridHeight);
 }
 pass.enabled=false;
 pass.setSize=()=>{}; // fixed physical cell size is configured in CSS pixels by syncFX
 pass.reset=()=>{reset=true;};
 pass.configure=({width,height,cellDensity=1.5,cellFill=.875,shadow=.18,
  temperature=20,reference=true,glass=false,glassStrength=.8,
  glassLightAngle=35,glassViewAngle=0}={})=>{
  cssWidth=Math.max(1,Number(width)||1);
  cssHeight=Math.max(1,Number(height)||1);
  density=clamp(Number(cellDensity)||1.5,1,2.5);
  setGrid();
  stateUniforms.uTemperature.value=clamp(Number(temperature)||20,5,40);
  outputUniforms.uFill.value=clamp(Number(cellFill)||.875,.55,.95);
  outputUniforms.uShadow.value=clamp(Number(shadow)||0,0,.5);
  outputUniforms.uPalette.value=reference?palettes.reference:palettes.nomad;
  outputUniforms.uGlass.value=glass?clamp(Number(glassStrength)||0,0,2):0;
  outputUniforms.uLightAngle.value=clamp(Number(glassLightAngle)||0,0,360);
  outputUniforms.uViewAngle.value=clamp(Number(glassViewAngle)||0,-45,45);
  configured=true;
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!configured)pass.configure({width:readBuffer.width,height:readBuffer.height});
  if(!targetA||!targetB)allocate();
  // Offscreen state pass evaluates each physical cell, not each output pixel.
  stateUniforms.tSource.value=readBuffer.texture;
  stateUniforms.tHistory.value=targetA.texture;
  stateUniforms.uDelta.value=clamp(Number(deltaTime)||1/60,.001,.08);
  stateUniforms.uReset.value=reset?1:0;
  quad.material=stateMaterial;
  renderer.setRenderTarget(targetB);
  quad.render(renderer);
  // Analytical aperture/gap/shadow projected onto full phone resolution.
  outputUniforms.uState.value=targetB.texture;
  outputUniforms.uOutputSize.value.set(readBuffer.width,readBuffer.height);
  quad.material=outputMaterial;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
  [targetA,targetB]=[targetB,targetA];
  reset=false;
 };
 pass.dispose=()=>{
  targetA?.dispose();targetB?.dispose();
  targetA=null;targetB=null;
  driftTexture.dispose();opticalTexture.dispose();
  stateMaterial.dispose();outputMaterial.dispose();quad.dispose();
 };
 return pass;
}
