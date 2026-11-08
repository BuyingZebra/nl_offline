/* NOMAD V169 — reusable GPU-driven luminance for static Canvas2D buttons.
 * This shader changes ONLY the ink and fill levels inside known button
 * rectangles. The source canvas, glyph rasterization, layout, hitboxes,
 * phosphor, bloom, and afterglow timing remain owned by their existing modules.
 *
 * The baseline CanvasTexture is rendered ONCE at 206/6 (solid) or 8/206
 * (outline). On a press, shader uniforms remap the baseline raster to the
 * exact 8-bit face/ink levels used by createCanvasUI. No per-frame upload,
 * extra canvas, geometry, scene layer, or postprocessing pass.
 */
import {buttonLevel,buttonInkLevel} from './button-feedback.js?v107';

export const GPU_BUTTON_CAPACITY=8;
export const GPU_BUTTON_SOURCE_LEVELS=Object.freeze({
 solidFace:206,solidInk:6,outlineFace:8,outlineInk:206
});

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finiteBox=b=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0;
const sameBox=(a,b)=>a.x===b.x&&a.y===b.y&&a.w===b.w&&a.h===b.h;
const levelFor=(lit,power)=>Object.freeze({
 face:lit?buttonLevel(power):GPU_BUTTON_SOURCE_LEVELS.outlineFace,
 ink:lit?buttonInkLevel(power):buttonLevel(power)
});
// Canvas text antialiasing interpolates 8-bit sRGB gray against the backing
// fill. This identity follows that interpolation; a zero-power button is
// returned unmodified by the shader, avoiding any cumulative resampling drift.
export function excitedButtonGray(value,{light=false,power=0}={}){
 const original=clamp(Number(value)||0,0,255);
 const power0=clamp(Number(power)||0,0,1);
 if(power0===0)return original;
 const srcFace=light?GPU_BUTTON_SOURCE_LEVELS.solidFace:GPU_BUTTON_SOURCE_LEVELS.outlineFace;
 const srcInk=light?GPU_BUTTON_SOURCE_LEVELS.solidInk:GPU_BUTTON_SOURCE_LEVELS.outlineInk;
 const destination=levelFor(light,power0);
 const amount=clamp((original-srcFace)/(srcInk-srcFace),0,1);
 return destination.face+(destination.ink-destination.face)*amount;
}

const vertexShader=`
 varying vec2 vUv;
 void main(){
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
 }
`;
// Three.js decodes CanvasTexture's sRGB sample before fragment processing.
// Convert back to encoded sRGB for 8-bit Canvas2D interpolation, remap to
// the approved integer levels, then return to linear for OutputPass.
const fragmentShader=`
 varying vec2 vUv;
 uniform sampler2D uMap;
 uniform int uCount;
 uniform int uExcited;
 uniform vec4 uRects[${GPU_BUTTON_CAPACITY}];
 uniform vec4 uLevels[${GPU_BUTTON_CAPACITY}];

 float encodeSRGB(float x){
  return x<=0.0031308?12.92*x:1.055*pow(max(0.0,x),1.0/2.4)-0.055;
 }
 float decodeSRGB(float x){
  return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);
 }
 void main(){
  vec4 pixel=texture2D(uMap,vUv);
  if(uExcited>0){
   for(int i=0;i<${GPU_BUTTON_CAPACITY};i++){
    if(i>=uCount)break;
    vec4 box=uRects[i];
    vec4 state=uLevels[i]; // x solid(1)/outline(0), y face, z ink, w enabled
    if(state.w<0.5)continue;
    if(vUv.x>=box.x&&vUv.x<box.z&&vUv.y>=box.y&&vUv.y<box.w){
     float baseFace=state.x>0.5?206.0:8.0;
     float baseInk=state.x>0.5?6.0:206.0;
     float original=clamp(encodeSRGB(pixel.r),0.0,1.0)*255.0;
     float inkCoverage=clamp((original-baseFace)/(baseInk-baseFace),0.0,1.0);
     float outEncoded=mix(state.y,state.z,inkCoverage);
     float outLinear=decodeSRGB(outEncoded);
     pixel.rgb=vec3(outLinear);
     break;
    }
   }
  }
  gl_FragColor=pixel;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }
`;

export function createGpuButtonLighting({THREE,texture,capacity=GPU_BUTTON_CAPACITY}={}){
 if(!THREE?.ShaderMaterial||!THREE?.Vector4||!texture)
  throw new TypeError('GPU button lighting needs Three.js and a CanvasTexture');
 // Shader source has a fixed capacity to remain portable on WebGL1/iOS.
 if(capacity!==GPU_BUTTON_CAPACITY)
  throw new RangeError('GPU button material capacity is fixed at 8');
 const rects=Array.from({length:capacity},()=>new THREE.Vector4());
 const levels=Array.from({length:capacity},()=>new THREE.Vector4());
 const uniforms={
  uMap:{value:texture},uCount:{value:0},uExcited:{value:0},
  uRects:{value:rects},uLevels:{value:levels}
 };
 const material=new THREE.ShaderMaterial({
  uniforms,vertexShader,fragmentShader,
  transparent:false,depthTest:false,depthWrite:false,
  side:THREE.DoubleSide,toneMapped:false
 });
 let geometry=[],active=false;
 let layoutSignature='';
 function configure(buttons,bounds){
  if(!Array.isArray(buttons)||!finiteBox(bounds))return false;
  const visible=buttons.filter(b=>b?.kind==='button'&&finiteBox(b));
  if(!visible.length||visible.length>capacity)return false;
  if(visible.some(b=>b.x<bounds.x-.5||b.y<bounds.y-.5||
    b.x+b.w>bounds.x+bounds.w+.5||b.y+b.h>bounds.y+bounds.h+.5))
   return false;
  const fingerprint=JSON.stringify([
   bounds.x,bounds.y,bounds.w,bounds.h,
   ...visible.map(b=>[b.x,b.y,b.w,b.h,Boolean(b.light)])
  ]);
  if(fingerprint===layoutSignature)return true;
  geometry=visible.map(b=>({x:b.x,y:b.y,w:b.w,h:b.h,light:Boolean(b.light)}));
  for(let i=0;i<capacity;i++){
   if(i>=geometry.length){
    rects[i].set(0,0,0,0);levels[i].set(0,0,0,0);continue;
   }
   const b=geometry[i];
   rects[i].set(
    clamp((b.x-bounds.x)/bounds.w,0,1),
    clamp((bounds.y+bounds.h-b.y-b.h)/bounds.h,0,1),
    clamp((b.x+b.w-bounds.x)/bounds.w,0,1),
    clamp((bounds.y+bounds.h-b.y)/bounds.h,0,1)
   );
   levels[i].set(b.light?1:0,b.light?206/255:8/255,
    b.light?6/255:206/255,0);
  }
  uniforms.uCount.value=geometry.length;
  uniforms.uExcited.value=0;
  // Three.js ShaderMaterial does not always upload changed uniform arrays
  // after its first draw unless this flag is explicitly raised.
  material.uniformsNeedUpdate=true;
  layoutSignature=fingerprint;active=true;
  return true;
 }
 function update(sparks=[]){
  if(!active)return false;
  let any=false,updated=false;
  for(let i=0;i<geometry.length;i++){
   const b=geometry[i];
   const spark=sparks.find(s=>sameBox(s,b));
   const power=clamp(Number(spark?.power)||0,0,1);
   const face=b.light?buttonLevel(power):8;
   const ink=b.light?buttonInkLevel(power):buttonLevel(power);
   const isActive=b.light?face!==206||ink!==6:ink!==206;
   const nextFace=face/255,nextInk=ink/255;
   const state=levels[i];
   if(state.y!==nextFace||state.z!==nextInk||
     state.w!==(isActive?1:0)){
    state.set(b.light?1:0,nextFace,nextInk,isActive?1:0);
    updated=true;
   }
   if(isActive)any=true;
  }
  if(uniforms.uExcited.value!==(any?1:0)){
   uniforms.uExcited.value=any?1:0;
   updated=true;
  }
  if(updated)material.uniformsNeedUpdate=true;
  return updated;
 }
 return Object.freeze({
  material,configure,update,
  get configured(){return active;},
  get count(){return geometry.length;},
  get active(){return uniforms.uExcited.value>0;},
  get regions(){return geometry.map(b=>({...b}));}
 });
}
