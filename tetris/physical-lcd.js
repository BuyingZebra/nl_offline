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
 * This is NOT an electrical STN simulation. Its appearance can be compared
 * directly with v268 in Git history, including the complete reference STN
 * model. It deliberately has NO cell-centre rasterization, temporal memory
 * or forced 4-shade quantization.
 */
import * as THREE from './vendor/three/three.bundle.js';
import {PALETTE} from './physical-lcd-data.js?v269';

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

const FRAGMENT=String.raw`
 precision highp float;
 varying vec2 vUv;
 uniform sampler2D tSource;
 uniform vec2 uGrid,uOutputSize;
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
  // Full-resolution source drives continuous optical transmission directly.
  float darkness=sourceDarkness(vUv);
  vec2 p=vUv*uGrid;
  vec2 footprint=max(uGrid/max(uOutputSize,vec2(1.)),vec2(.00001));
  float mask=aperture(p,footprint);
  vec3 background=uPalette[0];
  vec3 rgb=mix(background,opticalColour(darkness),mask);

  // Geometry and reflector cast shadows from the full-resolution input too.
  vec2 shift=vec2(uShadowX,uShadowY);
  float shadowDarkness=sourceDarkness(vUv-shift/uGrid);
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
