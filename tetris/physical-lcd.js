/*
 * NOMAD v269 — RAW OPTICAL LCD EXPERIMENT
 *
 * Input: original full-resolution Canvas2D/Three.js image, without an
 * intermediate per-cell signal texture or four-state drive quantizer.
 *
 * Output: continuous grayscale-to-reflectance mapping through the original
 * optical palette, physical square-cell aperture, reflector shadow and
 * optional virtual front glass.
 *
 * v270 reintroduces temporal STN-inspired electrical response at full
 * framebuffer resolution. A continuous drive is interpolated between
 * measured four-drive reference drift curves, while the original image
 * remains full resolution and the visible cell apertures clip it directly.
 *
 * Continuous subcell electrical addressing is an intentional approximation
 * rather than an exact hardware reconstruction. No fixed four-shade
 * quantization or cell-centre resampling occurs.
 */
import * as THREE from './vendor/three/three.bundle.js';
import {PALETTE,DRIFT_Q,OPTICAL_LUT,ANCHOR_Q,CORRECTION} from './physical-lcd-data.js?v270';

const {Pass,FullScreenQuad}=THREE;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const VERTEX='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';

export function physicalLCDGrid(width,height,density=1.5){
 const d=clamp(Number.isFinite(Number(density))?Number(density):1.5,1,2.5);
 return Object.freeze({
  columns:Math.max(1,Math.ceil(Math.max(1,Number(width)||1)*d/2.5)),
  rows:Math.max(1,Math.ceil(Math.max(1,Number(height)||1)*d/2.5))
 });
}
function srgbLinear(v){
 const c=v/255;
 return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
}
const palettes={
 reference:PALETTE.map(row=>new THREE.Color().setRGB(...row.map(srgbLinear))),
 nomad:[[124,137,86],[180,198,139],[143,170,111],[87,128,94],[45,83,63]]
  .map(row=>new THREE.Color().setRGB(...row.map(srgbLinear)))
};


// The historical lookup data is retained, but a continuous electrical drive
// is interpolated between its four sampled input voltages. All lookup
// textures use 16-bit RG packing because NOMAD's Three.js bundle exports
// CanvasTexture, but not DataTexture or floating-point texture formats.
function lutTexture(samples,width,height,{signed=false}={}){
 if(samples.length!==width*height)throw Error('STN lookup dimensions mismatch');
 const canvas=document.createElement('canvas');
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw Error('STN lookup canvas unavailable');
 const data=ctx.createImageData(width,height);
 for(let i=0;i<samples.length;i++){
  const v=Math.round(clamp((signed?samples[i]+.5:samples[i]),0,1)*65535);
  const p=i*4;
  data.data[p]=(v>>8)&255;data.data[p+1]=v&255;
  data.data[p+2]=0;data.data[p+3]=255;
 }
 ctx.putImageData(data,0,0);
 const t=new THREE.CanvasTexture(canvas);
 t.flipY=false;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;
 t.colorSpace=THREE.NoColorSpace;t.generateMipmaps=false;t.needsUpdate=true;
 return t;
}
function driftRoot(drive){
 // Solve each continuous-drive equilibrium from the same source curves used
 // by the response shader, rather than rounding to one of four voltages.
 const level=clamp(drive,0,1)*3;
 const lo=Math.min(2,Math.floor(level)),hi=lo+1,f=level-lo;
 function curve(row,q){
  const p=clamp(q,0,1)*64,i=Math.min(63,Math.floor(p)),t=p-i;
  const a=DRIFT_Q[row*65+i],b=DRIFT_Q[row*65+i+1];
  return a+(b-a)*t;
 }
 const drift=q=>curve(lo,q)*(1-f)+curve(hi,q)*f;
 let a=.8,b=.99;
 for(let i=0;i<26;i++){
  const mid=(a+b)*.5;
  if(drift(mid)>0)a=mid;else b=mid;
 }
 return (a+b)*.5;
}
const TARGET_CURVE=Array.from({length:256},(_,i)=>driftRoot(i/255));

// Shared source conversion. The existing Canvas2D authored content arrives
// in linear RGB. Convert back to encoded grayscale only for the drive signal.
const SOURCE_GREY=String.raw`
 float sourceDarkness(vec2 uv){
  vec3 linearRGB=texture2D(tSource,clamp(uv,vec2(0.),vec2(1.))).rgb;
  float lum=clamp(dot(linearRGB,vec3(.2126,.7152,.0722)),0.,1.);
  float grey=lum<=.0031308?lum*12.92:1.055*pow(lum,1./2.4)-.055;
  return 1.-clamp(grey,0.,1.);
 }
`;

// State is resolved at the SAME resolution as the original artwork.
// Drift dynamics use the measured STN curves with continuous-drive
// interpolation; the target curve corrects the reference equilibrium so
// steady-state image fidelity is identical to the v269 raw optical view.
const RESPONSE_FRAGMENT='precision highp float;varying vec2 vUv;uniform sampler2D tSource;\n'+SOURCE_GREY+String.raw`
 uniform sampler2D tHistory,uDrift,uOptical,uTargetCurve;
 uniform float uDelta,uResponseMs,uTemperature,uReset;
 uniform float uAnchor[4],uCorrection[4];
 vec2 pack16(float q){
  float n=floor(clamp(q,0.,1.)*65535.+.5);
  return vec2(floor(n/256.),mod(n,256.))/255.;
 }
 float unpackRG(vec4 c){
  vec2 bytes=floor(c.rg*255.+.5);
  return dot(bytes,vec2(256.,1.))/65535.;
 }
 float lookup(sampler2D t,float q,float row,float height){
  float p=clamp(q,0.,1.)*64.,a=floor(p),w=fract(p);
  float low=unpackRG(texture2D(t,vec2((a+.5)/65.,(row+.5)/height)));
  float high=unpackRG(texture2D(t,vec2((min(64.,a+1.)+.5)/65.,(row+.5)/height)));
  return mix(low,high,w);
 }
 float drift(float drive,float q){
  float p=clamp(drive,0.,1.)*3.;
  float low=floor(p),high=min(3.,low+1.),a=fract(p);
  return mix(lookup(uDrift,q,low,4.),lookup(uDrift,q,high,4.),a)-.5;
 }
 float optical(float q){
  float raw=lookup(uOptical,q,0.,1.),c=0.;
  if(q<=uAnchor[0])c=uCorrection[0]*q/max(uAnchor[0],.000001);
  else if(q<=uAnchor[3]){
   int n=q<=uAnchor[1]?0:q<=uAnchor[2]?1:2;
   c=mix(uCorrection[n],uCorrection[n+1],
    (q-uAnchor[n])/max(.000001,uAnchor[n+1]-uAnchor[n]));
  }else c=uCorrection[3]*(1.-q)/max(.000001,1.-uAnchor[3]);
  return clamp(raw+c,.25,1.);
 }
 void main(){
  float darkness=sourceDarkness(vUv);
  // 256-point 16-bit target table preserves continuous greyscale input;
  // there is no rounding to one of the original four voltage levels.
  float index=floor(clamp(darkness,0.,1.)*255.+.5);
  float target=unpackRG(texture2D(uTargetCurve,vec2((index+.5)/256.,.5)));
  vec4 previous=texture2D(tHistory,vUv);
  float q=uReset>.5?target:unpackRG(previous);
  float thermal=exp(3800.*(1./293.15-1./(uTemperature+273.15)));
  float frames=clamp(min(.08,max(.001,uDelta))*59.7275*
   210./max(30.,uResponseMs)*thermal,.0001,5.4);
  int n=int(clamp(ceil(frames/.45),1.,12.));
  float fraction=frames/float(n);
  if(uReset<.5)for(int step=0;step<12;step++){
   if(step>=n)break;
   q=clamp(q+drift(darkness,q)*fraction,0.,1.);
  }
  // The calibrated equilibrium is stored separately so that at rest
  // source detail and ink contrast are not remapped by an STN response curve.
  gl_FragColor=vec4(pack16(q),optical(target),optical(q));
 }
`;

const FRAGMENT=String.raw`
 precision highp float;
 varying vec2 vUv;
 uniform sampler2D tSource,tResponse;
 uniform vec2 uGrid,uOutputSize;
 uniform float uResponseAmount,uInkContrast;
 uniform vec3 uPalette[5];
 uniform float uFill,uShadow,uShadowX,uShadowY;
 uniform float uGlass,uLightAngle,uViewAngle;

 float sourceDarkness(vec2 uv){
  // Source pixels are LINEAR RGB from EffectComposer. Restore the encoded
  // grey originally authored on Canvas2D. Do not quantize to electrical codes.
  vec3 linearRGB=texture2D(tSource,clamp(uv,vec2(0.),vec2(1.))).rgb;
  float lum=clamp(dot(linearRGB,vec3(.2126,.7152,.0722)),0.,1.);
  float grey=lum<=.0031308?lum*12.92:1.055*pow(lum,1./2.4)-.055;
  return 1.-clamp(grey,0.,1.);
 }
 vec3 opticalColour(float darkness){
  float p=clamp(darkness,0.,1.)*4.;
  if(p<1.)return mix(uPalette[0],uPalette[1],p);
  if(p<2.)return mix(uPalette[1],uPalette[2],p-1.);
  if(p<3.)return mix(uPalette[2],uPalette[3],p-2.);
  return mix(uPalette[3],uPalette[4],p-3.);
 }
 float coverage1(float p,float footprint){
  // Analytical aperture integration; keeps visible square cells without
  // reducing the artwork to one image sample for each cell.
  float center=fract(p);
  float low=.5-uFill*.5,high=.5+uFill*.5;
  float a=center-footprint*.5,b=center+footprint*.5,sum=0.;
  for(int k=-1;k<=1;k++){
   float offset=float(k);
   sum+=max(0.,min(b,high+offset)-max(a,low+offset));
  }
  return clamp(sum/max(.00001,footprint),0.,1.);
 }
 float aperture(vec2 p,vec2 fp){
  return coverage1(p.x,fp.x)*coverage1(p.y,fp.y);
 }
 float jointAxis(float pos,float offset,float footprint){
  float low=.5-uFill*.5,high=.5+uFill*.5;
  float base=floor(pos),shadowBase=floor(pos-offset);
  float a=pos-footprint*.5,b=pos+footprint*.5,sum=0.;
  for(int i=-1;i<=1;i++){
   float a0=base+float(i)+low,a1=base+float(i)+high;
   for(int j=-1;j<=1;j++){
    float b0=shadowBase+float(j)+offset+low;
    float b1=shadowBase+float(j)+offset+high;
    sum+=max(0.,min(b,min(a1,b1))-max(a,max(a0,b0)));
   }
  }
  return clamp(sum/max(.00001,footprint),0.,1.);
 }
 void main(){
  // The direct source is still the authority for settled appearance.
  // Electrical history contributes only a transient difference from the
  // same source's calibrated equilibrium. No cell-value quantization.
  float darkness=sourceDarkness(vUv);
  if(uResponseAmount>0.00001){
   vec4 state=texture2D(tResponse,vUv);
   float responding=clamp(darkness+(state.a-state.b)/.75,0.,1.);
   darkness=mix(darkness,responding,uResponseAmount);
  }
  darkness=clamp((darkness-.5)*uInkContrast+.5,0.,1.);
  vec2 p=vUv*uGrid;
  vec2 footprint=max(uGrid/max(uOutputSize,vec2(1.)),vec2(.00001));
  float mask=aperture(p,footprint);
  vec3 background=uPalette[0];
  vec3 rgb=mix(background,opticalColour(darkness),mask);

  // Geometry and reflector cast shadows from the full-resolution input too.
  vec2 shift=vec2(uShadowX,uShadowY);
  vec2 shadowUv=clamp(vUv-shift/uGrid,vec2(0.),vec2(1.));
  float shadowDarkness=sourceDarkness(shadowUv);
  if(uResponseAmount>0.00001){
   vec4 shadowState=texture2D(tResponse,shadowUv);
   float responding=clamp(shadowDarkness+
    (shadowState.a-shadowState.b)/.75,0.,1.);
   shadowDarkness=mix(shadowDarkness,responding,uResponseAmount);
  }
  shadowDarkness=clamp((shadowDarkness-.5)*uInkContrast+.5,0.,1.);
  float displaced=aperture(p-shift,footprint);
  float joint=jointAxis(p.x,shift.x,footprint.x)*
              jointAxis(p.y,shift.y,footprint.y);
  float shadowGap=max(displaced-joint,0.);
  rgb=max(vec3(0.),rgb-background*uShadow*shadowDarkness*shadowGap);

  // Front-glass optics are deliberately independent of the input encoder.
  if(uGlass>0.){
   vec2 panel=vec2(vUv.x,1.-vUv.y);
   float angle=radians(uLightAngle);
   vec2 lightAxis=vec2(cos(angle),sin(angle));
   float along=dot(panel-vec2(.5),lightAxis);
   float distanceToHighlight=(along-.14)/.16;
   float highlight=exp(-distanceToHighlight*distanceToHighlight);
   float grazing=pow(clamp(.08+abs(uViewAngle)/45.,0.,1.),3.);
   float reflection=clamp((.037*highlight+.015*grazing)*uGlass,0.,1.);
   rgb=mix(rgb,vec3(.86,.92,.86),reflection);
   rgb*=1.-uGlass*.045*pow(abs(panel.x-.5)*2.,5.);
  }
  gl_FragColor=vec4(max(vec3(0.),rgb),1.);
 }
`;

export function createPhysicalLCDPass(){
 const pass=new Pass();
 const uniforms={
  tSource:{value:null},
  uGrid:{value:new THREE.Vector2(160,320)},
  uOutputSize:{value:new THREE.Vector2(1,1)},
  uPalette:{value:palettes.reference},
  uFill:{value:.875},uShadow:{value:.18},
  uShadowX:{value:.11},uShadowY:{value:.13},
  uGlass:{value:0},uLightAngle:{value:35},uViewAngle:{value:0}
 };
 const material=new THREE.ShaderMaterial({
  uniforms,vertexShader:VERTEX,fragmentShader:FRAGMENT,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending
 });
 const quad=new FullScreenQuad(material);
 pass.enabled=false;
 pass.setSize=()=>{}; // viewport dimensions are set in CSS pixels by syncFX
 pass.reset=()=>{}; // no persistence or electrical history in RAW test
 pass.configure=({width,height,cellDensity=1.5,cellFill=.875,shadow=.18,
  reference=true,glass=false,glassStrength=.8,glassLightAngle=35,
  glassViewAngle=0}={})=>{
  const {columns,rows}=physicalLCDGrid(width,height,cellDensity);
  uniforms.uGrid.value.set(columns,rows);
  uniforms.uFill.value=clamp(Number(cellFill),.55,.95);
  uniforms.uShadow.value=clamp(Number(shadow),0,.5);
  uniforms.uPalette.value=reference?palettes.reference:palettes.nomad;
  uniforms.uGlass.value=glass?clamp(Number(glassStrength)||0,0,2):0;
  uniforms.uLightAngle.value=clamp(Number(glassLightAngle)||0,0,360);
  uniforms.uViewAngle.value=clamp(Number(glassViewAngle)||0,-45,45);
 };
 pass.render=(renderer,writeBuffer,readBuffer)=>{
  uniforms.tSource.value=readBuffer.texture;
  uniforms.uOutputSize.value.set(readBuffer.width,readBuffer.height);
  quad.material=material;
  renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
 };
 pass.dispose=()=>{material.dispose();quad.dispose();};
 return pass;
}
