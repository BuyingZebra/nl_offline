/* NOMAD — internally compartmentalized visual engine; game rules live elsewhere. */
import * as THREE from './vendor/three/three.bundle.js';
import {createPhysicalLCDPass,physicalLCDGrid} from './dmg01-strict.js?v276';
import {directionalShadowProfile,createDirectionalShadowRenderer,createBoardInsetShadowRenderer} from './shadows.js?v223';
export {createBoardInsetShadowRenderer};
import {I_GRAVEL_BITS,J_GRAVEL_BITS} from './assets/tiles/gravel-layout.mjs?v119';
import {PIECE_LUMINANCE,renderIFragmentSVG} from './assets/tiles/smooth-geometry.mjs?v126';
// Rendering diagnostics: frame timing, GPU pass instrumentation and reports.
import {instrumentCompositorPasses} from './diagnostics.js?v276';
export {createPerfMonitor,createTextureUploadProfiler,captureLaunchDiagnostics,formatDebugReport} from './diagnostics.js?v276';

// Visual interaction geometry: drawn buttons and hitboxes share one definition.
const InteractionGeometry=(()=>{
/* Shared control geometry, hit testing and input dispatch. */


/* V065 — one geometry/interaction model for drawn Canvas2D controls.
 * No Canvas, Three.js, DOM, settings, or game state dependencies.
 * Values use the app's established CSS-pixel coordinates.
 */
function makeRegion(x,y,w,h,act,options={}){
 return {x,y,w,h,act,...options};
}
function makeButtonControl(label,x,y,w,h,act,
 {light=false,repeat=false,arrow=false,modalControl=false,field}={}){
 return {
  kind:'button',label,x,y,w,h,act,light,repeat,arrow,modalControl,
  hitbox:makeRegion(x,y,w,h,act,{kind:'button',light,repeat,modalControl,...(field===undefined?{}:{field})})
 };
}
// Last-drawn region wins, matching the existing overlay z-order.
// A settings control must lie inside the scroll viewport vertically.
function findRegionAt(regions,point,modal=null,modalView=null){
 for(let i=regions.length-1;i>=0;i--){
  const r=regions[i];
  if(!(point.x>=r.x&&point.x<=r.x+r.w&&point.y>=r.y&&point.y<=r.y+r.h))continue;
  if(modal==='options'&&r.modalControl&&modalView&&
   (point.y<modalView.y||point.y>modalView.y+modalView.h))continue;
  return r;
 }
 return undefined;
}
// Map pointer positions onto the same geometry used to draw the bar.
function sliderValueAt(region,x){
 const f=Math.max(0,Math.min(1,(x-region.trackX)/Math.max(1,region.trackW)));
 const v=region.min+f*(region.max-region.min);
 const stepped=Math.round(v/region.step)*region.step;
 return Number(stepped.toFixed(4));
}

/* Tetris System V052 — touch/mouse/keyboard input adapter.
 * Hit regions come from the rendering layer; gameplay and settings changes
 * go through injected callbacks. A controller owns the repeat timers and
 * active pointer so they can be cancelled safely on modal transitions.
 */

return {makeRegion,makeButtonControl,findRegionAt,sliderValueAt};
})();
const {makeRegion,makeButtonControl,findRegionAt,sliderValueAt}=InteractionGeometry;

// GPU effects, compositing, rendering feedback.
const CRT=(()=>{
/* CRT passes, button lighting and render invalidation. */

const {Pass,FullScreenQuad,EffectComposer,RenderPass,UnrealBloomPass,ShaderPass,OutputPass}=THREE;

/* NOMAD V104 — whole-display phosphor envelope.
 * No raster beam or refresh coupling. Rise is fast; falling light follows a
 * continuously adjustable exponential time constant. GPU uses the same model.
 * This is a neutral luminance approximation, not calibrated tube physics.
 */
const PHOSPHOR_BOUNDS=Object.freeze({
 minPersistenceMs:10,maxPersistenceMs:120,
 stepPersistenceMs:10,defaultPersistenceMs:120,
 riseMs:12
});
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
function normalizePersistenceMs(value){
 const n=Number(value);
 return Number.isFinite(n)?
  clamp(Math.round(n/PHOSPHOR_BOUNDS.stepPersistenceMs)*
   PHOSPHOR_BOUNDS.stepPersistenceMs,
   PHOSPHOR_BOUNDS.minPersistenceMs,PHOSPHOR_BOUNDS.maxPersistenceMs):
  PHOSPHOR_BOUNDS.defaultPersistenceMs;
}
// Fast excitation plus a slower fall after the incoming video loses light.
// No artificial reset is needed for a menu, pause, or gameplay transition.
function integratePhosphorResponse(
 prior,drive,seconds,persistenceMs=PHOSPHOR_BOUNDS.defaultPersistenceMs,riseMs=PHOSPHOR_BOUNDS.riseMs
){
 const previous=clamp(Number(prior)||0,0,1);
 const target=clamp(Number(drive)||0,0,1);
 const duration=Math.max(0,Number(seconds)||0);
 const tau=(target>previous?Math.max(.001,riseMs):normalizePersistenceMs(persistenceMs))/1000;
 return target+(previous-target)*Math.exp(-duration/tau);
}

/* NOMAD V104 — spatially local, full-display phosphor persistence.
 * Preserve the V103 temporal envelope: 12ms excitation, 10-120ms decay.
 * Only the luminance at the SAME native-resolution pixel influences its
 * history. No spatial point-spread, kernel, bloom, or scanline filtering.
 * The downstream artistic Bloom pass exclusively owns glow and halation;
 * the downstream CRT mask independently owns optional static scanlines.
 * No reset on game pause or menu transition.
 */

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
function createPhosphorPersistencePass(){
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


/* LCD pixels retain their OWN transmission history before optical colouring.
 * Do not use CRT phosphor or shifted TV signal ghosting for this effect. */
function createLCDResponsePass(){
 const pass=new Pass();let width=1,height=1,prior=null,next=null,first=true;
 let ms=210,strength=.6;
 const history={tSource:{value:null},tPrevious:{value:null},uDelta:{value:.016},
  uTau:{value:.210},uReset:{value:1}};
 const display={tSource:{value:null},tHistory:{value:null},uAmount:{value:.6}};
 const material=(uniforms,fragmentShader)=>new THREE.ShaderMaterial({
  uniforms,vertexShader:vertex,fragmentShader,
  depthTest:false,depthWrite:false,blending:THREE.NoBlending});
 const update=material(history,`
 precision highp float;varying vec2 vUv;
 uniform sampler2D tSource,tPrevious;uniform float uDelta,uTau,uReset;
 void main(){
  vec3 src=texture2D(tSource,vUv).rgb;
  vec3 prev=texture2D(tPrevious,vUv).rgb;
  if(uReset>.5)prev=src;
  float a=dot(src,vec3(.2126,.7152,.0722));
  float b=dot(prev,vec3(.2126,.7152,.0722));
  float tau=a>b?uTau:uTau*.55;
  gl_FragColor=vec4(clamp(src+(prev-src)*exp(-uDelta/max(.001,tau)),0.0,1.0),1.0);
 }`);
 const output=material(display,`
 precision highp float;varying vec2 vUv;
 uniform sampler2D tSource,tHistory;uniform float uAmount;
 void main(){
  vec3 src=texture2D(tSource,vUv).rgb;
  vec3 old=texture2D(tHistory,vUv).rgb;
  gl_FragColor=vec4(mix(src,old,clamp(uAmount,0.0,1.0)),1.0);
 }`);
 const quad=new FullScreenQuad(update);
 function alloc(){
  prior?.dispose();next?.dispose();
  const opts={depthBuffer:false,stencilBuffer:false,
   minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
   format:THREE.RGBAFormat,type:THREE.UnsignedByteType};
  const make=()=>{const rt=new THREE.WebGLRenderTarget(width,height,opts);
   rt.texture.colorSpace=THREE.NoColorSpace;return rt;};
  prior=make();next=make();first=true;
 }
 pass.enabled=false;
 pass.setSize=(w,h)=>{
  const x=Math.max(1,Math.ceil(w)),y=Math.max(1,Math.ceil(h));
  if(x!==width||y!==height){width=x;height=y;if(prior||next)alloc();}
 };
 pass.reset=()=>{first=true;};
 pass.configure=(responseMs,amount)=>{
  ms=clamp(Number(responseMs)||210,30,600);
  strength=clamp(Number(amount)/100||0,0,1);
 };
 pass.render=(renderer,writeBuffer,readBuffer,deltaTime)=>{
  if(!prior||!next)alloc();
  history.tSource.value=readBuffer.texture;history.tPrevious.value=prior.texture;
  history.uDelta.value=clamp(Number(deltaTime)||1/60,.001,.1);
  history.uTau.value=ms/1000;history.uReset.value=first?1:0;
  quad.material=update;renderer.setRenderTarget(next);quad.render(renderer);
  display.tSource.value=readBuffer.texture;display.tHistory.value=next.texture;
  display.uAmount.value=strength;
  quad.material=output;renderer.setRenderTarget(pass.renderToScreen?null:writeBuffer);
  if(pass.clear)renderer.clear();
  quad.render(renderer);
  [prior,next]=[next,prior];first=false;
 };
 pass.dispose=()=>{
  prior?.dispose();next?.dispose();prior=null;next=null;
  update.dispose();output.dispose();quad.dispose();
 };
 return pass;
}

/* Tetris System V051 — independent GPU compositor.
 * The exact V050 pass order and GLSL are intentionally preserved.
 * Source canvases belong to the caller; internal CRT textures belong here.
 */

const VIGNETTE_FADE_SPREAD=.57,CRT_PATTERN_SCALE=1;
const MAX_MENU_BLUR_SIGMA=13;
function menuBlurSigma(percent){
 return MAX_MENU_BLUR_SIGMA*Math.pow(percent/100,1.25);
}

function createCompositor({renderer,scene,camera,boardPopupTexture,pieceBloomMaskTexture=null,shadowBox=true,onPassTiming=()=>{}}){
 const composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 // Extract bloom from grayscale luminance before colourization.
const glow=new UnrealBloomPass(new THREE.Vector2(1,1),1.5,.42,.55);
glow.threshold=0;
// Avoid degenerate smoothstep(0,0,x) without a visible brightness cutoff.
if(glow.highPassUniforms?.smoothWidth)glow.highPassUniforms.smoothWidth.value=.0001;
 // NOMAD v189: one five-scale bloom, two independently blurred light domains.
 // Bright-pass R = exterior, G = recessed interior, B = zero.
 // The source grayscale survives in B after UnrealBloom's additive composite.
 if(glow.materialHighPassFilter&&glow.highPassUniforms){
  const rect={value:new THREE.Vector4(0,0,0,0)};
  glow.highPassUniforms.uBoardRect=rect;
  glow.materialHighPassFilter.uniforms.uBoardRect=rect;
  // The board-local stencil halves tetromino-face contribution to
  // bloom extraction. Their actual RGB pixels, textures, cast shadows, grid
  // and CRT passes remain in the original RenderPass texture.
  // Outside the piece mask, bloom stays at its normal intensity.
  // This reuses the single existing bloom pass.
  const pieces={value:pieceBloomMaskTexture};
  const piecesRect={value:new THREE.Vector4(0,0,0,0)};
  const piecesEnabled={value:pieceBloomMaskTexture?1:0};
  glow.highPassUniforms.uPieceMask=pieces;
  glow.materialHighPassFilter.uniforms.uPieceMask=pieces;
  glow.highPassUniforms.uPieceMaskRect=piecesRect;
  glow.materialHighPassFilter.uniforms.uPieceMaskRect=piecesRect;
  glow.highPassUniforms.uPieceMaskEnabled=piecesEnabled;
  glow.materialHighPassFilter.uniforms.uPieceMaskEnabled=piecesEnabled;
  glow.materialHighPassFilter.fragmentShader="precision highp float;\nvarying vec2 vUv;\nuniform sampler2D tDiffuse,uPieceMask;\nuniform float luminosityThreshold,smoothWidth,uPieceMaskEnabled;\nuniform vec4 uBoardRect,uPieceMaskRect;\nvoid main(){\n vec3 rgb=texture2D(tDiffuse,vUv).rgb;\n float luminance=dot(rgb,vec3(.2126,.7152,.0722));\n float brightness=luminance*smoothstep(luminosityThreshold,\n   luminosityThreshold+smoothWidth,luminance);\n float inside=step(uBoardRect.x,vUv.x)*step(vUv.x,uBoardRect.z)*\n              step(uBoardRect.y,vUv.y)*step(vUv.y,uBoardRect.w);\n if(uPieceMaskEnabled>.5){\n  vec2 maskSpan=max(vec2(.000001),uPieceMaskRect.zw-uPieceMaskRect.xy);\n  vec2 local=(vUv-uPieceMaskRect.xy)/maskSpan;\n  float inMask=step(uPieceMaskRect.x,vUv.x)*step(vUv.x,uPieceMaskRect.z)*\n               step(uPieceMaskRect.y,vUv.y)*step(vUv.y,uPieceMaskRect.w);\n  float face=texture2D(uPieceMask,clamp(local,vec2(0.0),vec2(1.0))).r;\n  brightness*=1.0-0.5*inMask*clamp(face,0.0,1.0);\n }\n gl_FragColor=vec4(brightness*(1.0-inside),brightness*inside,0.0,1.0);\n}";
  glow.materialHighPassFilter.needsUpdate=true;
 }

 const passVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';

 // A Gaussian is separable: horizontal + vertical convolution gives a
 // genuinely smooth 2D Gaussian, without the widely spaced 7x7 samples that
 // caused tiled duplicates at stronger blur settings. Edge Softness uses
 // the same normalized Gaussian weighting in a single 2D pass.
 // Shared by LCD vignette and edge blur, in CSS pixels.
 const roundedScreenFeather=`
   float screenEdgeFeather(vec2 uv,vec2 size,float falloff){
    float shortSide=min(size.x,size.y);
    float radius=0.115*shortSide;
    vec2 q=abs((uv-0.5)*size)-(0.5*size-radius);
    float inside=radius-length(max(q,vec2(0.0)))-min(max(q.x,q.y),0.0);
    return 1.0-smoothstep(0.0,falloff*shortSide,inside);
   }`;
 const gaussianBackdropShader=`
   varying vec2 vUv;uniform sampler2D tDiffuse,uPopup;
   uniform vec4 uRect;uniform vec2 uSize,uAxis;
   uniform float uSigma,uComposite,uCanvasBlend,uFade;
   uniform vec3 uFadeTo;
   #ifdef LCD_EDGE_BLUR
   uniform float uFalloff;
   ${roundedScreenFeather}
   #endif
   vec3 encodeSRGB(vec3 x){
    return mix(12.92*x,1.055*pow(max(x,vec3(0.0)),vec3(1.0/2.4))-.055,
     step(vec3(.0031308),x));
   }
   vec3 decodeSRGB(vec3 x){
    return mix(x/12.92,pow(max((x+.055)/1.055,vec3(0.0)),vec3(2.4)),
     step(vec3(.04045),x));
   }
   vec3 fadeToward(vec3 source,vec3 target,float amount){
    return mix(source,target,amount);
   }
   void main(){
    vec3 backdrop=texture2D(tDiffuse,vUv).rgb;
    float inside=step(uRect.x,vUv.x)*step(vUv.x,uRect.z)*
                 step(uRect.y,vUv.y)*step(vUv.y,uRect.w);
    float sigma=uSigma;
    #ifdef LCD_EDGE_BLUR
    sigma*=screenEdgeFeather(vUv,uSize,uFalloff);
    #endif
    if(inside>.5&&sigma>.01){
     // Keep taps one CSS pixel apart and widen the kernel with sigma.
     // Increasing tap spacing exposed the sampling grid at high blur.
     vec3 sum=backdrop;
     float weights=1.0;
     vec2 texel=uAxis/max(vec2(1.0),uSize);
     float inverseVariance=1.0/(sigma*sigma);
     float weight=exp(-0.5*inverseVariance);
     float decay=exp(-inverseVariance);
     float ratio=decay;
     for(int i=1;i<=${3*MAX_MENU_BLUR_SIGMA};i++){
      float offset=float(i);
      if(offset>ceil(3.0*sigma))break;
      vec2 delta=offset*texel;
      vec3 a=texture2D(tDiffuse,clamp(vUv-delta,uRect.xy,uRect.zw)).rgb;
      vec3 b=texture2D(tDiffuse,clamp(vUv+delta,uRect.xy,uRect.zw)).rgb;
      sum+=(a+b)*weight;
      weights+=2.0*weight;
      weight*=ratio;
      ratio*=decay;
     }
     backdrop=sum/weights;
    }
    if(uComposite>.5){
     if(inside>.5)backdrop=fadeToward(backdrop,uFadeTo,uFade);
     vec4 popup=texture2D(uPopup,vUv);
     // LCD piece shadows blend on the 2D canvas in encoded sRGB.
     if(uCanvasBlend>.5&&popup.a>0.0&&popup.a<1.0){
      backdrop=decodeSRGB(mix(encodeSRGB(backdrop),encodeSRGB(popup.rgb),popup.a));
     }else backdrop=mix(backdrop,popup.rgb,popup.a);
    }
    gl_FragColor=vec4(backdrop,1.0);
   }`;
 function createGaussianBackdropPass(axis,composite,edgeOnly=false){
  return new ShaderPass({
   defines:edgeOnly?{LCD_EDGE_BLUR:1}:{},
   uniforms:{
    tDiffuse:{value:null},uPopup:{value:null},
    uRect:{value:new THREE.Vector4(0,0,0,0)},
    uSize:{value:new THREE.Vector2(1,1)},
    uAxis:{value:new THREE.Vector2(axis,1-axis)},
    uSigma:{value:0},uFalloff:{value:.16},uFade:{value:0},uFadeTo:{value:new THREE.Color(0x101010)},
    uComposite:{value:composite?1:0},uCanvasBlend:{value:0}
   },
   vertexShader:passVertex,fragmentShader:gaussianBackdropShader
  });
 }
 const boardBlurHorizontal=createGaussianBackdropPass(1,false);
 const boardPopupPass=createGaussianBackdropPass(0,true);
 // ShaderPass clones input uniforms, including texture objects. Reattach
 // the ORIGINAL live CanvasTexture so every PAUSED/READY/OVER redraw reaches
 // the GPU, rather than displaying an old START GAME snapshot.
 boardPopupPass.uniforms.uPopup.value=boardPopupTexture;
 boardBlurHorizontal.enabled=false;boardPopupPass.enabled=false;
 composer.addPass(boardBlurHorizontal);
 composer.addPass(boardPopupPass);

 // Apply the same blur and fade to the complete app before drawing the picker.
 const pickerBlurHorizontal=createGaussianBackdropPass(1,false);
 const pickerPopupPass=createGaussianBackdropPass(0,true);
 for(const pass of [pickerBlurHorizontal,pickerPopupPass]){
  pass.enabled=false;
  pass.uniforms.uRect.value.set(0,0,1,1);
  composer.addPass(pass);
 }
 pickerPopupPass.uniforms.uFadeTo.value.set(0x000000);

 // Buttons are drawn into source textures at their current brightness.
 // No postprocessing pass manipulates their geometric bounds.
 // Experimental phosphor time history: grayscale, before optical glow/tint.
 // Disabled when users toggle PHOSPHOR HISTORY off (V096 baseline).
 const persistencePass=createPhosphorPersistencePass();
 composer.addPass(persistencePass);

 // Analog ghost is a displaced image sample, not a duplicate HTML element.
 const ghostPass=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uX:{value:8},uY:{value:0},uStrength:{value:.22},uSize:{value:new THREE.Vector2(1,1)},uBoardRect:{value:new THREE.Vector4(0,0,0,0)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uX,uY,uStrength;uniform vec2 uSize;uniform vec4 uBoardRect;
   void main(){
    vec3 currentImage=texture2D(tDiffuse,vUv).rgb;
    vec2 uv2=vUv+vec2(-uX/max(1.0,uSize.x),uY/max(1.0,uSize.y));
    float mask=step(0.0,uv2.x)*step(uv2.x,1.0)*step(0.0,uv2.y)*step(uv2.y,1.0);
    vec3 echo=texture2D(tDiffuse,clamp(uv2,vec2(0.0),vec2(1.0))).rgb;
    float currentIn=step(uBoardRect.x,vUv.x)*step(vUv.x,uBoardRect.z)*
      step(uBoardRect.y,vUv.y)*step(vUv.y,uBoardRect.w);
    float sampleIn=step(uBoardRect.x,uv2.x)*step(uv2.x,uBoardRect.z)*
      step(uBoardRect.y,uv2.y)*step(uv2.y,uBoardRect.w);
    float sameDomain=1.0-step(.5,abs(currentIn-sampleIn));
    gl_FragColor=vec4(clamp(currentImage+echo*uStrength*mask*sameDomain,0.0,1.0),1.0);
   }`
 });
 ghostPass.enabled=false;
 composer.addPass(ghostPass);

 // Decode R/G bloom after blurring. Board-origin light is clipped here
 // while cover-origin light can overlap the board; no extra rendering pass.
 const tint=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uEnabled:{value:0},uVoltage:{value:1},
   uTint:{value:new THREE.Vector3(.2,1,.2)},
   uBoardRect:{value:new THREE.Vector4(0,0,0,0)}},
  vertexShader:passVertex,
  fragmentShader:`varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uEnabled,uVoltage;
uniform vec3 uTint;
uniform vec4 uBoardRect;
void main(){
 vec3 encoded=texture2D(tDiffuse,vUv).rgb;
 float original=encoded.b;
 float coverBloom=max(0.0,encoded.r-original);
 float boardBloom=max(0.0,encoded.g-original);
 float inside=step(uBoardRect.x,vUv.x)*step(vUv.x,uBoardRect.z)*
              step(uBoardRect.y,vUv.y)*step(vUv.y,uBoardRect.w);
 float lit=(original+coverBloom+boardBloom*inside)*clamp(uVoltage,1.0,1.2);
 vec3 rgb=vec3(lit);
 gl_FragColor=vec4(mix(rgb,rgb*uTint,clamp(uEnabled,0.0,1.0)),1.0);
}
  `
 });

 // Lens blur: normalized 7x7 Gaussian convolution, not shifted copies.
 const edgeSoftness=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.65},uRadius:{value:4},uSize:{value:new THREE.Vector2(1,1)},uBoardRect:{value:new THREE.Vector4(0,0,0,0)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uRadius;uniform vec2 uSize;uniform vec4 uBoardRect;
   // This is exactly the same separable Gaussian kernel (sigma=1.25),
   // with its constant weights calculated once instead of 49 exp() calls
   // per pixel. Keep 7x7 sampling and all edge falloff settings unchanged.
   float gaussianWeight(int k){
    if(k==0)return 1.0;
    if(k==1||k==-1)return .7261490371;
    if(k==2||k==-2)return .2780373005;
    return .0561347628;
   }
   void main(){
    vec4 sharp=texture2D(tDiffuse,vUv);
    vec2 distPx=min(vUv,1.0-vUv)*uSize;
    float d=min(distPx.x,distPx.y);
    float amount=clamp(uAmount*(1.0-smoothstep(0.0,min(uSize.x,uSize.y)*.36,d)),0.0,1.0);
    if(amount<.001||uRadius<.001){gl_FragColor=sharp;return;}
    vec2 pixel=1.0/max(vec2(1.0),uSize);
    float interval=max(.001,uRadius)/3.0;
    float currentIn=step(uBoardRect.x,vUv.x)*step(vUv.x,uBoardRect.z)*
      step(uBoardRect.y,vUv.y)*step(vUv.y,uBoardRect.w);
    vec4 sum=vec4(0.0);float weights=0.0;
    for(int y=-3;y<=3;y++){
     float wy=gaussianWeight(y);
     for(int x=-3;x<=3;x++){
      vec2 offset=vec2(float(x),float(y));
      float weight=gaussianWeight(x)*wy;
      vec2 uv=clamp(vUv+offset*interval*pixel,vec2(0.0),vec2(1.0));
      float sampledIn=step(uBoardRect.x,uv.x)*step(uv.x,uBoardRect.z)*
        step(uBoardRect.y,uv.y)*step(uv.y,uBoardRect.w);
      vec4 sampleColour=abs(currentIn-sampledIn)>.5?sharp:texture2D(tDiffuse,uv);
      sum+=sampleColour*weight;
      weights+=weight;
     }
    }
    gl_FragColor=mix(sharp,sum/max(.001,weights),amount);
   }`
 });
 edgeSoftness.enabled=false;
 // Independent optical falloff; hue and image content stay intact.
 const edgeVignette=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.55},uStart:{value:.50}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uStart;
   void main(){
    vec4 src=texture2D(tDiffuse,vUv);
    vec2 p=abs(vUv*2.0-1.0);
    float edge=smoothstep(uStart,1.0,max(p.x,p.y));
    float corners=smoothstep(.86,1.4,length(p))*.2;
    gl_FragColor=vec4(src.rgb*(1.0-uAmount*clamp(edge+corners,0.0,1.0)),1.0);
   }`
 });
 edgeVignette.enabled=false;
 // Grayscale luminance produces bloom, then phosphor tint colours both.
 composer.addPass(glow);
 composer.addPass(tint);
 composer.addPass(edgeSoftness);

 composer.addPass(edgeVignette);
 // Five small literal grayscale CRT patterns, nearest-neighbor tiled.
 // ORIGINAL is pixel-for-pixel the previously approved 3x6 Photoshop tile.
 const SCANLINE_PRESETS=[
  {id:'original',name:'ORIGINAL',rows:[
   [255,89,89],[255,89,89],[89,89,89],[0,0,0],[0,0,0],[0,0,0]
  ]},
  {id:'horizontal',name:'HORIZONTAL SCANLINES',rows:[
   [220],[110],[40],[0]
  ]},
  {id:'aperture',name:'APERTURE GRILLE',rows:[
   [255,120,60]
  ]},
  {id:'slot',name:'SLOT MASK',rows:[
   [220,110,220,110],[220,110,220,110],[70,0,70,0],
   [110,220,110,220],[110,220,110,220],[0,0,0,0]
  ]},
  {id:'dot',name:'DOT SHADOW MASK',rows:[
   [220,60,220,60],[60,0,60,0],[220,60,220,60],[60,0,60,0]
  ]}
 ];
 function makeRepeatingMaskTexture(rows,filter=THREE.NearestFilter){
  const height=rows.length,width=rows[0].length;
  if(!rows.every(row=>row.length===width))throw Error('Invalid display mask tile');
  const tile=document.createElement('canvas');
  tile.width=width;tile.height=height;
  const ctx=tile.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Display mask texture canvas missing');
  const pixels=ctx.createImageData(width,height);
  rows.forEach((row,y)=>row.forEach((luminance,x)=>{
   const p=(y*width+x)*4;
   pixels.data[p]=luminance;
   pixels.data[p+1]=luminance;
   pixels.data[p+2]=luminance;
   pixels.data[p+3]=255;
  }));
  ctx.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(tile);
  texture.wrapS=THREE.RepeatWrapping;
  texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=filter;
  texture.minFilter=filter;
  texture.generateMipmaps=false;
  return texture;
 }
 const scanlineTextures=Object.fromEntries(
  SCANLINE_PRESETS.map(p=>[p.id,makeRepeatingMaskTexture(p.rows)])
 );
 function activeScanlinePreset(id){return SCANLINE_PRESETS.find(p=>p.id===id)||SCANLINE_PRESETS[0];}
 // Photoshop-like repeating texture layer: scale tile in CSS pixels,
 // then blend it over the finished composite with independently adjustable
 // layer opacity. Multiply only source brightness, so no RGB tint is added.
 const scanlineOverlay=new ShaderPass({
  uniforms:{
   tDiffuse:{value:null},
   uPattern:{value:scanlineTextures.original},
   uPatternSize:{value:new THREE.Vector2(3,6)},
   uOpacity:{value:.20},
   uScale:{value:1},
   uDpr:{value:1},
   uScreenHeight:{value:1}
  },
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse,uPattern;
   uniform float uOpacity,uScale,uDpr,uScreenHeight;
   uniform vec2 uPatternSize;
   void main(){
    vec3 image=texture2D(tDiffuse,vUv).rgb;
    vec2 pixel=vec2(gl_FragCoord.x,uScreenHeight-gl_FragCoord.y);
    vec2 period=max(.25,uScale)*max(1.0,uDpr)*uPatternSize;
    float luminance=texture2D(uPattern,pixel/period).r;
    gl_FragColor=vec4(image*mix(1.0,luminance,clamp(uOpacity,0.0,1.0)),1.0);
   }`
 });
 // ShaderPass clones textures on creation. Rebind the original source.
 scanlineOverlay.uniforms.uPattern.value=scanlineTextures.original;
 scanlineOverlay.enabled=false;
 composer.addPass(scanlineOverlay);

 // Physical STN cell simulation: separate render pass, before legacy LCD FX.
 const physicalLCDPass=createPhysicalLCDPass();
 composer.addPass(physicalLCDPass);
 // LCD segment response happens BEFORE tint, optical bleed and cell apertures.
 const lcdResponsePass=createLCDResponsePass();
 composer.addPass(lcdResponsePass);
 // LCD overlays operate on the complete image in linear light.
 function addLCDOverlay(uniforms,shader){
  const pass=new ShaderPass({
   uniforms:{tDiffuse:{value:null},...uniforms},vertexShader:passVertex,
   fragmentShader:`varying vec2 vUv;uniform sampler2D tDiffuse;
    ${shader}`
  });
  pass.enabled=false;
  composer.addPass(pass);
  return pass;
 }
 const lcdTint=addLCDOverlay({
  uInk:{value:new THREE.Color(0x171910)},uPaper:{value:new THREE.Color(0xe1e2c5)},uSaturation:{value:.20}
 },`
  uniform vec3 uInk,uPaper;
  uniform float uSaturation;
  void main(){
   vec3 src=texture2D(tDiffuse,vUv).rgb;
   vec3 olive=mix(uInk,uPaper,clamp(src.r,0.0,1.0));
   float luma=dot(olive,vec3(0.2126,0.7152,0.0722));
   // The bottom matches the former 31% setting. At the 20% default
   // the chroma multiplier is exactly one, preserving the original olive.
   vec3 color=vec3(luma)+(olive-luma)*mix(0.748,2.008,uSaturation);
   gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
  }`);


 // Diffuse adjacent segments locally without erasing the LCD cell mask.
 // Respect the recessed board's shadow-box optical boundary.
 const lcdBleed=addLCDOverlay({uSize:{value:new THREE.Vector2(1,1)},
  uBoardRect:{value:new THREE.Vector4(0,0,0,0)},
  uRadius:{value:1.5},uAmount:{value:.44}},`
  uniform vec2 uSize;uniform vec4 uBoardRect;
  uniform float uRadius,uAmount;
  float inside(vec2 p){
   return step(uBoardRect.x,p.x)*step(p.x,uBoardRect.z)*
          step(uBoardRect.y,p.y)*step(p.y,uBoardRect.w);
  }
  vec3 sampleSafe(vec2 uv,vec3 original,float centerDomain){
   vec2 p=clamp(uv,vec2(0.0),vec2(1.0));
   return abs(inside(p)-centerDomain)>.5?original:texture2D(tDiffuse,p).rgb;
  }
  void main(){
   vec3 src=texture2D(tDiffuse,vUv).rgb;
   float domain=inside(vUv);
   vec2 px=vec2(uRadius)/max(vec2(1.0),uSize);
   vec3 sum=src*4.0;
   sum+=sampleSafe(vUv+vec2(px.x,0.),src,domain)*2.0;
   sum+=sampleSafe(vUv-vec2(px.x,0.),src,domain)*2.0;
   sum+=sampleSafe(vUv+vec2(0.,px.y),src,domain)*2.0;
   sum+=sampleSafe(vUv-vec2(0.,px.y),src,domain)*2.0;
   sum+=sampleSafe(vUv+px,src,domain);
   sum+=sampleSafe(vUv-px,src,domain);
   sum+=sampleSafe(vUv+vec2(px.x,-px.y),src,domain);
   sum+=sampleSafe(vUv+vec2(-px.x,px.y),src,domain);
   gl_FragColor=vec4(mix(src,sum/16.0,clamp(uAmount,0.0,1.0)),1.0);
  }`);
 // A separated square with a continuous gap on all four sides.
 const lcdTileSize=16;
 const lcdCellRows=Array.from({length:lcdTileSize},(_,y)=>
  Array.from({length:lcdTileSize},(_,x)=>
   Math.min(x,y,lcdTileSize-1-x,lcdTileSize-1-y)<3?0:255));
 const lcdCellTile=makeRepeatingMaskTexture(lcdCellRows,THREE.LinearFilter);
 const lcdCells=addLCDOverlay({
  uTile:{value:null},uSize:{value:new THREE.Vector2(1,1)},uOpacity:{value:0},uScale:{value:3}
 },`
  uniform sampler2D uTile;
  uniform vec2 uSize;
  uniform float uOpacity,uScale;
  void main(){
   vec3 src=texture2D(tDiffuse,vUv).rgb;
   vec2 px=vec2(vUv.x,1.0-vUv.y)*uSize;
   float cell=texture2D(uTile,px/uScale).r;
   // Lift individual pad faces in shadows and darken the gaps in highlights.
   float luma=dot(src,vec3(0.2126,0.7152,0.0722));
   vec3 face=src+(1.0-src)*(0.048*(1.0-smoothstep(0.025,0.55,luma)));
   vec3 gap=src*(1.0-0.36*smoothstep(0.045,0.55,luma));
   gl_FragColor=vec4(mix(src,mix(gap,face,cell),uOpacity),1.0);
  }`);
 lcdCells.uniforms.uTile.value=lcdCellTile;

 // Soften the displayed image, including its LCD cells, before vignette darkening.
 const lcdEdgeBlurPasses=[createGaussianBackdropPass(1,false,true),createGaussianBackdropPass(0,false,true)];
 for(const pass of lcdEdgeBlurPasses){
  pass.enabled=false;
  pass.uniforms.uRect.value.set(0,0,1,1);
  composer.addPass(pass);
 }

 // Feather inward from all four drawable screen edges, including safe-area margins.
 const lcdVignette=addLCDOverlay({
  uAmount:{value:0},uFalloff:{value:.14},uSize:{value:new THREE.Vector2(1,1)}
 },`
  uniform float uAmount,uFalloff;
  uniform vec2 uSize;
  ${roundedScreenFeather}
  void main(){
   vec3 src=texture2D(tDiffuse,vUv).rgb;
   float darkness=uAmount*screenEdgeFeather(vUv,uSize,uFalloff);
   gl_FragColor=vec4(src*(1.0-darkness),1.0);
  }`);

 // Warm colour at the physical glass perimeter, separate from darkness vignette.
 const lcdEdgeColour=addLCDOverlay({
  uSize:{value:new THREE.Vector2(1,1)},uAmount:{value:.4},uFalloff:{value:.06}
 },`
  uniform vec2 uSize;uniform float uAmount,uFalloff;
  ${roundedScreenFeather}
  void main(){
   vec3 src=texture2D(tDiffuse,vUv).rgb;
   float rim=screenEdgeFeather(vUv,uSize,uFalloff);
   vec3 warm=src*vec3(1.18,.94,.90);
   gl_FragColor=vec4(clamp(mix(src,warm,rim*clamp(uAmount,0.0,1.0)),0.0,1.0),1.0);
  }`);
 // Vertical hold/roll is a pure signal-space transform AFTER all existing
 // phosphor and CRT treatments. It is disabled outside the boot handoff.
 // fract() wraps the complete image instead of exposing blank strips.
 // Share one signal-space pass for momentary vertical sync errors,
 // horizontal tearing and the existing vertical-roll handoff. No extra pass
 // is added to the normal gameplay pipeline.
 const bootRoll=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uOffset:{value:0},
   uGlitch:{value:0},uTime:{value:0},
   uContentLuminance:{value:1},
   // THREE.Color(hex) converts sRGB #080808 to LINEAR working-space RGB.
   // Applying this base after the CRT mask makes the actual displayed
   // inactive screen #080808, rather than gamma-lifted charcoal gray.
   uDisplayBase:{value:new THREE.Color(0x080808)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uOffset,uGlitch,uTime,uContentLuminance;
   uniform vec3 uDisplayBase;
   void main(){
    float band=floor(vUv.y*48.0);
    float phase=floor(uTime*47.0);
    float noise=fract(sin(band*97.17+phase*23.19)*43758.5453);
    // Only a few horizontal strips slip during a sync fault.
    float gate=step(.80,noise);
    float dx=(noise-.5)*.065*uGlitch*gate;
    float dy=step(.97,noise)*.007*uGlitch;
    vec2 position=vec2(clamp(vUv.x+dx,0.0,1.0),
     fract(vUv.y+uOffset+dy));
    vec3 completed=texture2D(tDiffuse,position).rgb;
    // Preserve #080808 independently of source/CRT/phosphor.
    // All completed pixel differences share ONE luminance multiplier.
    vec3 emitted=completed-uDisplayBase;
    gl_FragColor=vec4(uDisplayBase+emitted*clamp(uContentLuminance,0.0,1.0),1.0);
   }`
 });
 bootRoll.enabled=false;
 composer.addPass(bootRoll);
 composer.addPass(new OutputPass());
 // Keep the exact pass order, source textures and FX behavior. Measure the
 // CPU time spent issuing each pass only; no extra GL renders or readbacks.
 const passProfiler=instrumentCompositorPasses(composer.passes,[
  'Scene + uploads','Board blur H','Board popup','Picker blur H','Picker popup',
  'Phosphor history','Ghost','Bloom',
  'Phosphor','Edge softness','Vignette','CRT mask','Physical STN LCD','LCD response','LCD colour',
  'LCD bleed','LCD cells','LCD edge blur H','LCD edge blur V',
  'LCD vignette','LCD edge colour','Boot roll','Output'
 ],onPassTiming);
 // Restore the original fixed green and amber phosphor ratios;
 // the blue experiment is removed without changing luminance or bloom.
 const hues={green:new THREE.Vector3(.2,1,.2),
  amber:new THREE.Vector3(185/255,79/255,9/255)};
 let persistenceWasEnabled=false,lcdResponseWasEnabled=false,physicalWasEnabled=false;
 const popupPasses=[boardBlurHorizontal,boardPopupPass];
 const lcdPopupBase=new THREE.Color(0xd8d8d8),crtPopupBase=new THREE.Color(0x101010);
function syncFX({fx,theme,lcd=false,width:W,height:H,dpr:DPR,boardStatus,modalOpen,scoresOverlay=false,popupStatus,layoutInfo,isolateLightWindow=false,propertiesPreview=null,pieceMaskEnabled=true,phosphorStrength=1,voltage=1,glitch=0,signalTime=0,contentLuminance=1}){
 const historyEnabled=!lcd&&fx.persistence===true;
 if(historyEnabled!==persistenceWasEnabled)persistencePass.reset();
 persistenceWasEnabled=historyEnabled;
 persistencePass.enabled=historyEnabled;
 persistencePass.configure(fx.persistenceMs);
 ghostPass.enabled=!lcd&&fx.ghost;
 ghostPass.uniforms.uX.value=fx.ghostX;
 ghostPass.uniforms.uY.value=fx.ghostY;
 ghostPass.uniforms.uStrength.value=fx.ghostStrength/100;
 // Colour strength is bounded to the selected fixed phosphor tint.
 tint.uniforms.uEnabled.value=fx.phosphor?clamp(phosphorStrength,0,1):0;
 // The instant startup voltage spike changes luminance only, never hue.
 tint.uniforms.uVoltage.value=clamp(voltage,1,1.2);
 // Identical artistic hue whether history is on or off; decay is neutral.
 tint.uniforms.uTint.value.copy(hues[theme]||hues.green);
 tint.enabled=!lcd;
 const physicalEnabled=lcd; // Strict DMG-01 is the only LCD material path.
 if(physicalEnabled!==physicalWasEnabled)physicalLCDPass.reset();
 physicalWasEnabled=physicalEnabled;
 physicalLCDPass.enabled=physicalEnabled;
 if(physicalEnabled)physicalLCDPass.configure({width:W,height:H});
 const lcdResponseEnabled=false; // No legacy response/colour bypass.
 if(lcdResponseEnabled!==lcdResponseWasEnabled)lcdResponsePass.reset();
 lcdResponseWasEnabled=lcdResponseEnabled;
 lcdResponsePass.enabled=lcdResponseEnabled;
 lcdResponsePass.configure(fx.lcdResponseMs,fx.lcdResponseAmount);
 lcdTint.enabled=lcd&&!physicalEnabled;
 lcdBleed.enabled=lcd&&!physicalEnabled&&fx.lcdBleed&&fx.lcdBleedAmount>0&&fx.lcdBleedRadius>0;
 lcdBleed.uniforms.uAmount.value=fx.lcdBleedAmount/100;
 lcdBleed.uniforms.uRadius.value=fx.lcdBleedRadius;
 lcdBleed.uniforms.uSize.value.set(W,H);
 lcdEdgeColour.enabled=lcd&&!physicalEnabled&&fx.lcdEdgeColour&&fx.lcdEdgeColourAmount>0;
 lcdEdgeColour.uniforms.uAmount.value=fx.lcdEdgeColourAmount/100;
 lcdEdgeColour.uniforms.uFalloff.value=fx.lcdEdgeColourFalloff*.005;
 lcdEdgeColour.uniforms.uSize.value.set(W,H);
 lcdCells.enabled=lcd&&!physicalEnabled&&fx.lcdCells&&fx.lcdCellOpacity>0;
 const lcdEdgeBlurEnabled=lcd&&!physicalEnabled&&fx.lcdEdgeBlur&&fx.lcdEdgeBlurSigma>0;
 for(const pass of lcdEdgeBlurPasses){
  pass.enabled=lcdEdgeBlurEnabled;
  if(lcdEdgeBlurEnabled){
   pass.uniforms.uSigma.value=fx.lcdEdgeBlurSigma;
   pass.uniforms.uFalloff.value=fx.lcdEdgeBlurFalloff*0.005;
   pass.uniforms.uSize.value.set(W,H);
  }
 }
 lcdVignette.enabled=lcd&&!physicalEnabled&&fx.lcdVignette&&fx.lcdVignetteAmount>0;
 if(lcd){
  lcdTint.uniforms.uSaturation.value=fx.lcdTint?fx.lcdOliveSaturation/100:0;
  lcdCells.uniforms.uOpacity.value=fx.lcdCellOpacity/100;
  lcdCells.uniforms.uScale.value=fx.lcdCellSize;
  lcdCells.uniforms.uSize.value.set(W,H);
  lcdVignette.uniforms.uAmount.value=fx.lcdVignetteAmount/100;
  lcdVignette.uniforms.uFalloff.value=fx.lcdVignetteFalloff*0.005;
  lcdVignette.uniforms.uSize.value.set(W,H);
 }
 bootRoll.uniforms.uGlitch.value=clamp(glitch,0,1);
 bootRoll.uniforms.uTime.value=Math.max(0,Number(signalTime)||0)/1000;
 const faded=clamp(Number(contentLuminance),0,1);
 bootRoll.uniforms.uContentLuminance.value=faded;
 bootRoll.enabled=(bootRoll.uniforms.uOffset.value>0.00001&&
  bootRoll.uniforms.uOffset.value<.99999)||bootRoll.uniforms.uGlitch.value>0.00001||faded<1;
 glow.enabled=!lcd&&fx.bloom;
 glow.strength=fx.bloomStrength;
 // Never mask a full-page settings screen or other view where the piece
 // board is hidden. With bloom disabled, the stencil is not sampled.
 const pickerOpen=Boolean(pickerPopupPass.uniforms.uPopup.value);
 if(glow.highPassUniforms?.uPieceMaskEnabled)
  glow.highPassUniforms.uPieceMaskEnabled.value=
   fx.bloom&&!pickerOpen&&pieceMaskEnabled&&pieceBloomMaskTexture?1:0;
 edgeSoftness.enabled=!lcd&&fx.softness;
 edgeSoftness.uniforms.uAmount.value=fx.softnessStrength;
 edgeSoftness.uniforms.uRadius.value=fx.softnessRadius;
 // One board-visibility rule for PAUSED, HIGH SCORE and the light lab.
 // Display System hides the board; Light Control keeps the aperture but
 // suppresses popup blur. All screens use the same source textures and passes.
 const boardBackdropVisible=!modalOpen||scoresOverlay||Boolean(propertiesPreview);
 const boardWindowVisible=boardBackdropVisible||isolateLightWindow;
 const boardOverlayActive=propertiesPreview?propertiesPreview.backdrop:
  boardStatus!=='playing'&&boardBackdropVisible&&popupStatus===boardStatus;
 // Use the same aperture-limited Gaussian for gameplay, with independent
 // CRT and LCD settings. Popup blur takes over behind menus.
 const gameplaySigma=fx.boardBlurEnabled!==false&&(propertiesPreview||boardStatus==='playing')&&boardBackdropVisible?
  fx.boardBlur||0:0;
 const menuSigma=menuBlurSigma(fx.menuBlur);
 const menuFade=fx.menuFade/100;
 const sigma=boardOverlayActive?
  (fx.menuBackdropEnabled!==false?menuSigma:0):gameplaySigma;
 pickerBlurHorizontal.enabled=pickerOpen&&menuSigma>.01;
 pickerPopupPass.enabled=pickerOpen;
 pickerBlurHorizontal.uniforms.uSigma.value=menuSigma;
 pickerPopupPass.uniforms.uSigma.value=menuSigma;
 pickerPopupPass.uniforms.uFade.value=menuFade;
 boardBlurHorizontal.enabled=sigma>.01;
 boardPopupPass.enabled=boardBackdropVisible;
 boardPopupPass.uniforms.uComposite.value=boardBackdropVisible?1:0;
 for(const pass of popupPasses)pass.uniforms.uSigma.value=sigma;
 boardPopupPass.uniforms.uFade.value=boardOverlayActive&&fx.menuBackdropEnabled!==false?
  menuFade:0;
 boardPopupPass.uniforms.uFadeTo.value=lcd?lcdPopupBase:crtPopupBase;
 boardPopupPass.uniforms.uCanvasBlend.value=lcd?1:0;
 // Keep the live CanvasTexture bound through all update paths.
 boardPopupPass.uniforms.uPopup.value=boardPopupTexture;
 if(layoutInfo){
  const r=layoutInfo,x=r.boardX+2,y=r.boardY+2,w=Math.max(0,r.boardW-4),h=Math.max(0,r.boardH-4);
  for(const pass of popupPasses){
   pass.uniforms.uRect.value.set(x/W,1-(y+h)/H,(x+w)/W,1-y/H);
  }
  // Board content is the light source only when the recessed window is visible.
  // Zero rect restores v188 global bloom for the optional A/B query parameter.
  // The picker is one continuous surface. The board's optical boundaries
  // would otherwise split its bloom, ghosting and softness along the rails.
  const active=shadowBox&&boardWindowVisible&&!pickerOpen&&w>0&&h>0;
  const x0=active?x/W:0,y0=active?1-(y+h)/H:0;
  const x1=active?(x+w)/W:0,y1=active?1-y/H:0;
  for(const uniform of [glow.highPassUniforms?.uBoardRect,
   tint.uniforms.uBoardRect,ghostPass.uniforms.uBoardRect,
   edgeSoftness.uniforms.uBoardRect,lcdBleed.uniforms.uBoardRect]){
   uniform?.value.set(x0,y0,x1,y1);
  }
  // Piece-mask coordinates track the ENTIRE cropped board texture, while
  // bloom aperture still uses its 2px inner window.
  glow.highPassUniforms?.uPieceMaskRect?.value.set(
   layoutInfo.boardX/W,1-(layoutInfo.boardY+layoutInfo.boardH)/H,
   (layoutInfo.boardX+layoutInfo.boardW)/W,1-layoutInfo.boardY/H
  );
 }
 edgeVignette.enabled=!lcd&&fx.vignette;
 edgeVignette.uniforms.uAmount.value=fx.vignetteAmount;
 edgeVignette.uniforms.uStart.value=VIGNETTE_FADE_SPREAD;
 // Static CRT scanline artwork is independent of phosphor persistence.
 // A user-enabled mask must remain visible whether history is on or off.
 scanlineOverlay.enabled=!lcd&&fx.scanlines&&fx.scanlineOpacity>0;
 const scanlinePreset=activeScanlinePreset(fx.scanlinePreset);
 scanlineOverlay.uniforms.uPattern.value=scanlineTextures[scanlinePreset.id];
 scanlineOverlay.uniforms.uPatternSize.value.set(scanlinePreset.rows[0].length,scanlinePreset.rows.length);
 scanlineOverlay.uniforms.uOpacity.value=clamp(fx.scanlineOpacity/100,0,1);
 scanlineOverlay.uniforms.uScale.value=CRT_PATTERN_SCALE;
 scanlineOverlay.uniforms.uDpr.value=DPR;
 scanlineOverlay.uniforms.uScreenHeight.value=H*DPR;
}
 function setStartupRoll(turns=0){
  // Turns are complete-screen revolutions; a whole number is perfectly static.
  const offset=((Number(turns)||0)%1+1)%1;
  bootRoll.uniforms.uOffset.value=offset;
  bootRoll.enabled=(offset>0.00001&&offset<0.99999)||
   bootRoll.uniforms.uGlitch.value>0.00001||
   bootRoll.uniforms.uContentLuminance.value<1;
 }
 function resize(W,H,DPR){
  composer.setPixelRatio(DPR);
  composer.setSize(W,H);
  ghostPass.uniforms.uSize.value.set(W,H);
  edgeSoftness.uniforms.uSize.value.set(W,H);
  for(const pass of [...popupPasses,pickerBlurHorizontal,pickerPopupPass])
   pass.uniforms.uSize.value.set(W,H);
 }
 // EffectComposer.dispose() only owns its render targets and copy pass.
 // It does NOT release added passes (notably bloom render targets/materials).
 // All pass resources and CRT pattern textures must be explicitly released.
 let disposed=false;
 function dispose(){
  if(disposed)return false;
  disposed=true;
  const failures=[];
  function safe(name,fn){
   try{fn();}catch(error){failures.push(name+': '+String(error?.message||error));}
  }
  safe('profiler',()=>passProfiler.dispose());
  for(const pass of composer.passes)
   safe('pass',()=>pass.dispose?.());
  safe('composer',()=>composer.dispose());
  for(const texture of Object.values(scanlineTextures))
   safe('scanline',()=>texture.dispose());
  safe('LCD cell texture',()=>lcdCellTile.dispose());
  if(failures.length)throw new Error(failures.join(' | ').slice(0,240));
  return true;
 }
 // Sampling is opt-in; do not scan the pipeline during normal gameplay.
 function passStats(){
  let activePasses=0;
  for(const pass of composer.passes)if(pass.enabled!==false)activePasses++;
  return {activePasses,totalPasses:composer.passes.length};
 }
 return Object.freeze({syncFX,resize,setStartupRoll,
  setPicker(texture){
   pickerPopupPass.uniforms.uPopup.value=texture;
  },
  resetPersistence:()=>persistencePass.reset(),
  render:(dt)=>composer.render(dt),dispose,passStats,
  activeScanlinePreset,SCANLINE_PRESETS});
}

/* NOMAD V107 — source-owned button excitation.
 * Every illuminated button stroke, label, icon or solid face starts at 206
 * and reaches 255 during a press. The Canvas2D source itself animates:
 * no geometric full-screen postprocess, pressed rectangle, or extra glow.
 * Dark reversed text on filled keys remains legible and responds subtly.
 * The shared GPU phosphor decay (when enabled) supplies the afterglow.
 */
const MAX_BUTTON_FLASHES=8;
const BUTTON_BASE_LEVEL=206;
const BUTTON_PEAK_LEVEL=255;
const BUTTON_FLASH_PEAK_MS=90;
const MIN_PRESS_FRAME_MS=34;
const BUTTON_AFTERGLOW_MS=410;
const BUTTON_FLASH_TOTAL_MS=BUTTON_FLASH_PEAK_MS+BUTTON_AFTERGLOW_MS;
const buttonLevel=power=>Math.round(BUTTON_BASE_LEVEL+
 (BUTTON_PEAK_LEVEL-BUTTON_BASE_LEVEL)*Math.max(0,Math.min(1,Number(power)||0)));
const buttonInkLevel=power=>Math.round(6+24*Math.max(0,Math.min(1,Number(power)||0)));
const EMPTY_BUTTON_SAMPLES=Object.freeze([]);
function createButtonFeedback({capacity=MAX_BUTTON_FLASHES}={}){
 const hits=[],limit=Math.max(1,Math.min(MAX_BUTTON_FLASHES,Math.floor(capacity)||1));
 const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.w===b.w&&a.h===b.h;
 function press(r,now,held=true){
  if(!r||!Number.isFinite(now))return false;
  const {x,y,w,h}=r;
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return false;
  const existing=hits.findIndex(a=>same(a,r));
  if(existing>=0)hits.splice(existing,1);
  hits.push({x,y,w,h,pressedAt:now,releasedAt:held?null:now+BUTTON_FLASH_PEAK_MS});
  if(hits.length>limit)hits.shift();
  return true;
 }
 function release(r,now){
  if(!r||!Number.isFinite(now))return false;
  const a=hits.find(h=>same(h,r));
  if(!a||a.releasedAt!==null)return false;
  a.releasedAt=now;return true;
 }
 function sample(now,physicalPersistence=false){
  if(!Number.isFinite(now))return EMPTY_BUTTON_SAMPLES;
  for(let i=hits.length-1;i>=0;i--){
   const a=hits[i];
   if(a.releasedAt!==null&&physicalPersistence&&
    now>=Math.max(a.releasedAt,a.pressedAt+MIN_PRESS_FRAME_MS)){
    hits.splice(i,1);continue;
   }
   if(a.releasedAt!==null&&now-a.releasedAt>=BUTTON_AFTERGLOW_MS)hits.splice(i,1);
  }
  if(!hits.length)return EMPTY_BUTTON_SAMPLES;
  return hits.map(a=>{
   const age=a.releasedAt===null?0:Math.max(0,now-a.releasedAt);
   const fade=physicalPersistence?1:Math.max(0,1-age/BUTTON_AFTERGLOW_MS);
   return Object.freeze({x:a.x,y:a.y,w:a.w,h:a.h,power:fade*fade});
  });
 }
 function clear(){const had=hits.length>0;hits.length=0;return had;}
 return Object.freeze({press,release,sample,clear,get count(){return hits.length;}});
}

/* Identical to the historical quantized signature comparison, without
 * allocating nested arrays or concatenated strings on each frame.
 */
function buttonFeedbackChanged(previous,current){
 if(previous===current)return false;
 if(previous.length!==current.length)return true;
 for(let i=0;i<current.length;i++){
  const a=previous[i],b=current[i];
  if(a.x!==b.x||a.y!==b.y||a.w!==b.w||a.h!==b.h||
   Math.round(a.power*49)!==Math.round(b.power*49))return true;
 }
 return false;
}

/* NOMAD V169 — reusable GPU-driven luminance for static Canvas2D buttons.
 * This shader changes ONLY the ink and fill levels inside known button
 * rectangles. The source canvas, glyph rasterization, layout, hitboxes,
 * phosphor, bloom, and afterglow timing remain owned by their existing modules.
 *
 * The baseline CanvasTexture uses the active display palette.
 * On a press, shader uniforms remap the baseline raster to the
 * exact 8-bit face/ink levels used by createCanvasUI. No per-frame upload,
 * extra canvas, geometry, scene layer, or postprocessing pass.
 */

const GPU_BUTTON_CAPACITY=8;
const GPU_BUTTON_SOURCE_LEVELS=Object.freeze({
 solidFace:206,solidInk:6,outlineFace:8,outlineInk:206
});

const LCD_BUTTON_LEVELS=Object.freeze({panel:231,outline:28,solidInk:227});
function lcdButtonInk(power){return Math.round(LCD_BUTTON_LEVELS.outline+30*power);}
function controlButtonLevels(light,power,onLight){
 if(onLight)return light?
  {face:lcdButtonInk(power),ink:LCD_BUTTON_LEVELS.solidInk}:
  {face:LCD_BUTTON_LEVELS.panel,ink:lcdButtonInk(power)};
 return {face:light?buttonLevel(power):GPU_BUTTON_SOURCE_LEVELS.outlineFace,
  ink:light?buttonInkLevel(power):buttonLevel(power)};
}

const finiteBox=b=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0;
const sameBox=(a,b)=>a.x===b.x&&a.y===b.y&&a.w===b.w&&a.h===b.h;
// Canvas text antialiasing interpolates 8-bit sRGB gray against the backing
// fill. This identity follows that interpolation; a zero-power button is
// returned unmodified by the shader, avoiding any cumulative resampling drift.
function excitedButtonGray(value,{light=false,power=0}={}){
 const original=clamp(Number(value)||0,0,255);
 const power0=clamp(Number(power)||0,0,1);
 if(power0===0)return original;
 const srcFace=light?GPU_BUTTON_SOURCE_LEVELS.solidFace:GPU_BUTTON_SOURCE_LEVELS.outlineFace;
 const srcInk=light?GPU_BUTTON_SOURCE_LEVELS.solidInk:GPU_BUTTON_SOURCE_LEVELS.outlineInk;
 const destination=controlButtonLevels(light,power0,false);
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
 uniform int uOnLight;
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
     if(uOnLight==1){
      baseFace=state.x>0.5?${LCD_BUTTON_LEVELS.outline}.0:${LCD_BUTTON_LEVELS.panel}.0;
      baseInk=state.x>0.5?${LCD_BUTTON_LEVELS.solidInk}.0:${LCD_BUTTON_LEVELS.outline}.0;
     }
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

function createGpuButtonLighting({THREE,texture,capacity=GPU_BUTTON_CAPACITY}={}){
 if(!THREE?.ShaderMaterial||!THREE?.Vector4||!texture)
  throw new TypeError('GPU button lighting needs Three.js and a CanvasTexture');
 // Shader source has a fixed capacity to remain portable on WebGL1/iOS.
 if(capacity!==GPU_BUTTON_CAPACITY)
  throw new RangeError('GPU button material capacity is fixed at 8');
 const rects=Array.from({length:capacity},()=>new THREE.Vector4());
 const levels=Array.from({length:capacity},()=>new THREE.Vector4());
 const uniforms={
  uMap:{value:texture},uCount:{value:0},uExcited:{value:0},uOnLight:{value:0},
  uRects:{value:rects},uLevels:{value:levels}
 };
 const material=new THREE.ShaderMaterial({
  uniforms,vertexShader,fragmentShader,
  transparent:false,depthTest:false,depthWrite:false,
  side:THREE.DoubleSide,toneMapped:false
 });
 let geometry=[],active=false;
 let layoutSignature='';
 function configure(buttons,bounds,onLight=false){
  if(!Array.isArray(buttons)||!finiteBox(bounds))return false;
  const visible=buttons.filter(b=>b?.kind==='button'&&finiteBox(b));
  if(!visible.length||visible.length>capacity)return false;
  if(visible.some(b=>b.x<bounds.x-.5||b.y<bounds.y-.5||
    b.x+b.w>bounds.x+bounds.w+.5||b.y+b.h>bounds.y+bounds.h+.5))
   return false;
  const fingerprint=JSON.stringify([
   bounds.x,bounds.y,bounds.w,bounds.h,onLight,
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
   const {face,ink}=controlButtonLevels(b.light,0,onLight);
   levels[i].set(b.light?1:0,face/255,ink/255,0);
  }
  uniforms.uCount.value=geometry.length;
  uniforms.uOnLight.value=onLight?1:0;
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
   const onLight=uniforms.uOnLight.value===1;
   const {face,ink}=controlButtonLevels(b.light,power,onLight);
   const baseline=controlButtonLevels(b.light,0,onLight);
   const isActive=face!==baseline.face||ink!==baseline.ink;
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

/* NOMAD V166 — isolate button source invalidation by visible HUD layer.
 * The fullscreen base canvas includes the header and the board-status popup.
 * Its duplicated deck artwork is hidden by the opaque cropped controls layer.
 * Game-deck button excitation therefore needs ONLY that cropped texture.
 * Both prior and current silhouettes are considered so the last afterglow
 * frame is always cleared when a released button disappears.
 * Pure CSS-pixel geometry; no Canvas2D, WebGL, or gameplay dependency.
 */
function buttonFeedbackLayers(previous=[],current=[],layout=null){
 const deck=layout&&Number.isFinite(layout.dx)&&Number.isFinite(layout.dy)&&
  Number.isFinite(layout.dw)&&Number.isFinite(layout.dh)&&
  layout.dw>0&&layout.dh>0?layout:null;
 let base=false,controls=false;
 const inDeck=b=>deck&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&
  b.w>0&&b.h>0&&
  b.x>=deck.dx-.01&&b.y>=deck.dy-.01&&
  b.x+b.w<=deck.dx+deck.dw+.01&&
  b.y+b.h<=deck.dy+deck.dh+.01;
 for(const b of [...previous,...current]){
  if(inDeck(b))controls=true;
  else base=true; // header, board popup, or ambiguous geometry
  if(base&&controls)break;
 }
 return [...(base?['base']:[]),...(controls?['controls']:[])];
}

/* Tetris V062 — geometry and drawing helper for cropped, opaque HUD layers.
 * All bounds use CSS pixels and snap to the 2x canvas pixel grid.
 * Preserves the existing Canvas2D coordinate system and Three.js passes.
 */
function croppedBounds(boxes,width,height,dpr=1,pad=2){
 const scale=Math.max(1,dpr||1);
 const valid=boxes.filter(b=>b&&b.w>0&&b.h>0);
 if(!valid.length)return {x:0,y:0,w:1/scale,h:1/scale};
 const x=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.x))-pad)*scale)/scale);
 const y=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.y))-pad)*scale)/scale);
 const right=Math.min(width,Math.ceil((Math.max(...valid.map(b=>b.x+b.w))+pad)*scale)/scale);
 const bottom=Math.min(height,Math.ceil((Math.max(...valid.map(b=>b.y+b.h))+pad)*scale)/scale);
 return {x,y,w:Math.max(1/scale,right-x),h:Math.max(1/scale,bottom-y)};
}
function sidebarBounds(r,width,height,dpr){
 // NEXT and HOLD labels now sit above the compact preview frames.
 const headingSpace=r.previewLabelSpace??0;
 const headingBox=p=>({
  x:p.x,y:p.y-headingSpace,w:p.w,h:headingSpace
 });
 return croppedBounds([
  r.holdPanel,r.nextPanel,r.statsPanel,
  headingBox(r.holdPanel),headingBox(r.nextPanel)
 ],width,height,dpr);
}
function controlsBounds(r,width,height,dpr){
 // V168: buttons own only the deck. The operation log has its own
 // independently invalidated, much smaller opaque CanvasTexture.
 return croppedBounds([{x:r.dx,y:r.dy,w:r.dw,h:r.dh}],width,height,dpr);
}
function drawCroppedCanvas({canvas,context,plane,texture,bounds,dpr,width,height,draw}){
 const {x,y,w,h}=bounds;
 const pxW=Math.max(1,Math.round(w*dpr)),pxH=Math.max(1,Math.round(h*dpr));
 if(canvas.width!==pxW||canvas.height!==pxH){canvas.width=pxW;canvas.height=pxH;}
 context.setTransform(dpr,0,0,dpr,-x*dpr,-y*dpr);
 draw(bounds);
 plane.scale.set(w/width,h/height,1);
 plane.position.set(-1+(2*x+w)/width,1-(2*y+h)/height,plane.position.z);
 texture.needsUpdate=true;
 return {pixels:pxW*pxH,width:pxW,height:pxH};
}

/* V168 — the single owner of rendering dirtiness and attribution.
 * No canvas, DOM, game engine, or Three.js dependencies.
 * A mark schedules work; consume(layer) acknowledges one layer repaint.
 */
function createRenderInvalidation(initial=['base','board','sidebar','controls','terminal']){
 const layers=new Set(['base','board','sidebar','controls','terminal','modal']);
 const pending=new Set(initial.filter(x=>layers.has(x)));
 const reasons=new Set(['startup']);
 let renderNeeded=true;
 function mark(...names){
  for(const n of names){
   if(!layers.has(n))throw Error('Unknown render layer: '+n);
   pending.add(n);
  }
  renderNeeded=true;
 }
 function reason(name='input'){
  reasons.add(name);
  renderNeeded=true;
 }
 function needs(layer){return pending.has(layer);}
 function consume(layer){
  if(!pending.has(layer))return false;
  pending.delete(layer);
  // A paint can mark (then consume) a layer after beginRender(). A fully
  // serviced frame must not request a second no-op composition.
  if(pending.size===0&&reasons.size===0)renderNeeded=false;
  return true;
 }
 function needsRender(){return renderNeeded;}
 function beginRender(){
  const why=[...reasons];
  reasons.clear();renderNeeded=false;
  return why;
 }
 function snapshot(){return Object.freeze({pending:[...pending],reasons:[...reasons],renderNeeded});}
 return Object.freeze({mark,reason,needs,consume,needsRender,beginRender,snapshot});
}

/* Tetris V058 — visual state guard, independent of FPS and gravity timers.
 * A renderer should only upload Canvas2D pixels when displayed game data
 * actually changes. Capture before ticking; compare after ticking.
 */
function captureGameVisualState(game){
 const p=game.current;
 return {piece:p,x:p?.x,y:p?.y,rotation:p?.rotation,kind:p?.kind,
  pieces:game.pieces,lines:game.lines,score:game.score,level:game.level,
  hold:game.hold,status:game.status};
}
function gameVisualStateChanged(before,game){
 const p=game.current;
 return before.piece!==p||before.x!==p?.x||before.y!==p?.y||
  before.rotation!==p?.rotation||before.kind!==p?.kind||
  before.pieces!==game.pieces||before.lines!==game.lines||
  before.score!==game.score||before.level!==game.level||
  before.hold!==game.hold||before.status!==game.status;
}
function flashPhase(elapsed,interval=72){
 return Math.floor(elapsed/interval)%2;
}

return {LCD_BUTTON_LEVELS,lcdButtonInk,PHOSPHOR_BOUNDS,normalizePersistenceMs,integratePhosphorResponse,createPhosphorPersistencePass,createCompositor,MAX_BUTTON_FLASHES,BUTTON_BASE_LEVEL,BUTTON_PEAK_LEVEL,BUTTON_FLASH_PEAK_MS,MIN_PRESS_FRAME_MS,BUTTON_AFTERGLOW_MS,BUTTON_FLASH_TOTAL_MS,buttonLevel,buttonInkLevel,createButtonFeedback,buttonFeedbackChanged,GPU_BUTTON_CAPACITY,GPU_BUTTON_SOURCE_LEVELS,excitedButtonGray,createGpuButtonLighting,buttonFeedbackLayers,croppedBounds,sidebarBounds,controlsBounds,drawCroppedCanvas,createRenderInvalidation,captureGameVisualState,gameVisualStateChanged,flashPhase};
})();
const {buttonLevel,buttonInkLevel,LCD_BUTTON_LEVELS,lcdButtonInk}=CRT;
// Textures, sprite art, fragments, silhouette shadows.
const Art=(()=>{
/* Piece sprites, tile fallback, fragments and shadows. */

function pieceLuminance(kind){
 return PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
}

/* NOMAD V118 — approved 1989 Game Boy tile motifs.
 * Exactly the seven approved lower-row designs (I/O/T/S/Z/J/L).
 * Pixel-art source is grayscale; the existing phosphor compositor provides
 * green/amber tint, CRT bloom and scanlines. No layout or rules changes.
 */

const PIECE_PATTERNS=Object.freeze({
 I:'continuous-gravel',
 J:'dotted-field',
 L:'recessed-square',
 O:'corner-highlight',
 S:'small-center',
 T:'solid-fill',
 Z:'centered-square'
});
const SIZE=12;
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
const gray=v=>{const n=clamp(v);return 'rgb('+n+','+n+','+n+')';};
const matrix=(w,h)=>Array.from({length:h},()=>Array(w).fill(-1));
function box(m,x,y,w,h,c){
 for(let yy=Math.max(0,y);yy<Math.min(m.length,y+h);yy++)
  for(let xx=Math.max(0,x);xx<Math.min(m[0].length,x+w);xx++)m[yy][xx]=clamp(c);
}
function outline(m,cTop,cLeft,cBottom,cRight){
 const w=m[0].length,h=m.length;
 box(m,1,1,w-2,1,cTop);box(m,1,1,1,h-2,cLeft);
 box(m,1,h-2,w-2,1,cBottom);box(m,w-2,1,1,h-2,cRight);
}
function tilePixels(kind){
 const m=matrix(SIZE,SIZE),L=PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
 const bright=clamp(L+25);
 switch(kind){
 case 'O': // luminous top-left corner within a recessed medium-gray face
  box(m,1,1,10,10,L-95);
  outline(m,bright,bright,L-45,L-48);
  box(m,3,3,5,1,bright);box(m,3,3,1,5,bright);
  box(m,4,4,3,1,L+5);box(m,4,4,1,3,L+5);
  box(m,2,9,8,1,L-125);
  break;
 case 'T': // intentionally plain, without an invented frame or texture
  box(m,1,1,10,10,L-5);
  break;
 case 'S': // bright flat square with one small black central recess
  box(m,1,1,10,10,L+12);
  box(m,1,1,10,1,L+25);box(m,1,1,1,10,L+25);
  box(m,5,5,2,2,8);
  break;
 case 'Z': // black field, bright nested square, dark centered pixel
  box(m,1,1,10,10,10);
  outline(m,bright,bright,L+5,L+5);
  box(m,4,4,4,4,L+48);
  box(m,5,5,2,2,8);
  break;
 case 'J': // scattered isolated dark dots, never checkerboard
  box(m,1,1,10,10,L+17);
  outline(m,L+45,L+45,L+35,L+35);
  for(const [x,y,w,h] of J_GRAVEL_BITS)box(m,x,y,w,h,12);
  break;
 case 'L': // medium face with a square beveled recess
  box(m,1,1,10,10,L-26);
  outline(m,L+24,L+18,L-12,L-12);
  box(m,3,3,7,7,L-54);
  box(m,3,3,7,1,L-3);box(m,3,3,1,7,L-3);
  box(m,4,4,5,5,L-46);
  box(m,9,3,1,7,L-108);box(m,3,9,7,1,L-108);
  break;
 default:
  return barPixels(1,false);
 }
 return m;
}
function rotate90(m){
 const h=m.length,w=m[0].length;
 const rotated=matrix(h,w);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)rotated[x][h-1-y]=m[y][x];
 return rotated;
}
function barPixels(length,vertical,sourceOffset=0,rotation=vertical?1:0){
 const count=Math.round(length),offset=Math.round(sourceOffset);
 if(count<1||count>4||offset<0||offset+count>4)
  throw new RangeError('Invalid I fragment length or sourceOffset');
 if(!Number.isInteger(rotation)||rotation<0||rotation>3)
  throw new RangeError('Invalid I fragment rotation');
 const w=SIZE*count,L=PIECE_LUMINANCE.I;
 let m=matrix(w,SIZE);
 // Face and outer rim belong to this one contiguous fragment, never each
 // adjacent block. Only actual source gravel spots appear inside this rim.
 box(m,1,1,w-2,10,L-55);
 outline(m,L+16,L+16,L+8,L+8);
 for(const [x,y,dw,dh] of I_GRAVEL_BITS){
  const localX=x-offset*SIZE;
  if(localX>=2&&localX+dw<=w-2)box(m,localX,y,dw,dh,L-167);
 }
 for(let n=0;n<rotation;n++)m=rotate90(m);
 return m;
}
const tileCache=new Map();
function sprite(kind){
 if(!tileCache.has(kind))tileCache.set(kind,tilePixels(kind));
 return tileCache.get(kind);
}
const barCache=new Map();
function barSprite(length,vertical){
 const key=length+':'+vertical;
 if(!barCache.has(key))barCache.set(key,barPixels(length,vertical));
 return barCache.get(key);
}
function raster(g,pixels,x,y,w,h){
 if(!(w>0&&h>0)||!pixels.length)return;
 const rows=pixels.length,cols=pixels[0].length;
 const dx=w/cols,dy=h/rows;
 for(let yy=0;yy<rows;yy++){
  const line=pixels[yy];
  for(let xx=0;xx<cols;){
   const color=line[xx],start=xx++;
   while(xx<cols&&line[xx]===color)xx++;
   if(color<0)continue;
   g.fillStyle=gray(color);
   // Fractional cell sizes are allowed; tiny overlap avoids raster cracks.
   g.fillRect(x+start*dx,y+yy*dy,(xx-start)*dx+.001,dy+.001);
  }
 }
}
function drawIFragment(g,x,y,w,h,{sourceOffset=0,length=4,rotation=0}={}){
 if(!(w>0&&h>0))return;
 raster(g,barPixels(length,Boolean(rotation%2),sourceOffset,rotation),x,y,w,h);
}
function drawIBar(g,x,y,w,h){
 if(!(w>0&&h>0))return;
 const vertical=h>w;
 const length=Math.max(1,Math.round((vertical?h:w)/(vertical?w:h)));
 raster(g,barSprite(length,vertical),x,y,w,h);
}
function drawTileFace(g,x,y,w,h,kind){
 if(kind==='I'){drawIBar(g,x,y,w,h);return;}
 raster(g,sprite(kind),x,y,w,h);
}
// The four I cells share ONE continuous rectangle in NEXT/HOLD and in flight.
function drawPieceTiles(g,tiles,kind,{rotation}={}){
 if(!Array.isArray(tiles)||!tiles.length)return;
 if(kind==='I'){
  const minX=Math.min(...tiles.map(t=>t.x)),minY=Math.min(...tiles.map(t=>t.y));
  const maxX=Math.max(...tiles.map(t=>t.x+t.size));
  const maxY=Math.max(...tiles.map(t=>t.y+t.size));
  const vertical=maxY-minY>maxX-minX;
  drawIFragment(g,minX,minY,maxX-minX,maxY-minY,
   {sourceOffset:0,length:tiles.length,rotation:rotation??(vertical?1:0)});
  return;
 }
 for(const t of tiles)drawTileFace(g,t.x,t.y,t.size,t.size,kind);
}

/* NOMAD V121 — cached SVG sprite rendering for grayscale CRT source.
 * Uses the authored /assets/tiles/vector/*.svg files, not approximated
 * Canvas paths. SVGs are decoded once per shape; responsive sizes are then
 * rasterized at display DPR and cached. I-fragment variants are generated
 * from the same authored SVG geometry with original source coordinates.
 * Pixel renderer is a resilient fallback while SVG images finish loading.
 */

const KINDS=Object.freeze(['I','J','L','O','S','T','Z']);
const VECTOR_PIECE_KINDS=KINDS;
function spriteIdentity(kind,{sourceOffset=0,length=4,rotation=0}={}){
 if(kind!=='I'){
  if(!KINDS.includes(kind))throw new RangeError('Unknown tile kind: '+kind);
  return kind;
 }
 if(!Number.isInteger(sourceOffset)||!Number.isInteger(length)||
  !Number.isInteger(rotation)||rotation<0||rotation>3||
  length<1||length>4||sourceOffset<0||sourceOffset+length>4)
  throw new RangeError('Invalid I fragment source metadata');
 return 'I:'+sourceOffset+':'+length+':'+rotation;
}

function createVectorTileRenderer({
 createImage=()=>new Image(),
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1,
 isLCD=()=>false,
 onReady=()=>{},
 assetPrefix='./assets/tiles/vector/'
}={}){
 const images=new Map(),rasterized=new Map();
 let disposed=false;
 const MAX_RASTERS=128;
 const sendReady=()=>{if(!disposed)onReady();};
 function spriteSource(key){
  if(key.length===1||key==='I:0:4:0')return assetPrefix+key[0]+'.svg?v126';
  const [,offset,length,rotation]=key.split(':').map((n,i)=>i?Number(n):n);
  const svg=renderIFragmentSVG({sourceOffset:offset,length,rotation});
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 }
 function load(key){
  let asset=images.get(key);
  if(asset)return asset;
  const image=createImage();
  asset={status:'loading',image};
  images.set(key,asset);
  image.onload=()=>{
   if(disposed)return;
   asset.status='ready';
   sendReady();
  };
  image.onerror=()=>{
   if(disposed)return;
   asset.status='failed';
   sendReady(); // repaint using the pixel fallback
  };
  image.src=spriteSource(key);
  return asset;
 }
 function draw(key,g,x,y,w,h,fallback){
  if(disposed||!(w>0&&h>0))return false;
  const asset=load(key);
  const lcd=isLCD(),ready=asset.status==='ready';
  if(!ready&&!lcd){fallback(g,x,y,w,h);return false;}
  const dpr=Math.max(1,Math.min(4,Number(pixelRatio())||1));
  const pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
  const cacheKey=key+'@'+pw+'x'+ph+(lcd?(ready?':lcd':':lcd-fallback'):'');
  let canvas=rasterized.get(cacheKey);
  if(!canvas){
   canvas=createCanvas();
   canvas.width=pw;canvas.height=ph;
   const ctx=canvas.getContext('2d',{alpha:true});
   if(!ctx){fallback(g,x,y,w,h);return false;}
   ctx.imageSmoothingEnabled=true;
   if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
   try{
    if(ready)ctx.drawImage(asset.image,0,0,pw,ph);
    else fallback(ctx,0,0,pw,ph);
   }catch(error){fallback(g,x,y,w,h);return false;}
   if(lcd){
    // CRT and LCD start with the same sprite luminance. LCD ink only
    // backs the transparent margin, including one continuous edge on an I bar.
    // The source faces have a one-unit margin on a twelve-unit cell.
    const cell=Math.min(w,h);
    const margin=Math.max(0,cell/12-2);
    const insetX=margin*pw/w,insetY=margin*ph/h;
    ctx.globalCompositeOperation='destination-over';
    ctx.fillStyle='#080808';
    ctx.fillRect(insetX,insetY,pw-2*insetX,ph-2*insetY);
   }
   if(rasterized.size>=MAX_RASTERS){
    const oldest=rasterized.keys().next().value;
    rasterized.delete(oldest);
   }
   rasterized.set(cacheKey,canvas);
  }else{
   // Recently used sprites remain in the small least-recently-used cache.
   rasterized.delete(cacheKey);rasterized.set(cacheKey,canvas);
  }
  g.drawImage(canvas,x,y,w,h);
  return true;
 }
 function drawTile(g,x,y,w,h,kind){
  if(!KINDS.includes(kind))return false;
  if(kind==='I')return drawVectorIFragment(g,x,y,w,h,{
   sourceOffset:0,length:1,rotation:0
  });
  return draw(spriteIdentity(kind),g,x,y,w,h,(target,px,py,pw,ph)=>
   drawTileFace(target,px,py,pw,ph,kind));
 }
 function drawVectorIFragment(g,x,y,w,h,{sourceOffset=0,length=4,rotation=0}={}){
  const options={sourceOffset,length,rotation};
  const key=spriteIdentity('I',options);
  return draw(key,g,x,y,w,h,(target,px,py,pw,ph)=>
   drawIFragment(target,px,py,pw,ph,options));
 }
 function drawPiece(g,tiles,kind,{rotation=0}={}){
  if(!Array.isArray(tiles)||!tiles.length)return;
  if(kind!=='I'){
   for(const t of tiles)drawTile(g,t.x,t.y,t.size,t.size,kind);
   return;
  }
  const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x+t.size));
  const minY=Math.min(...tiles.map(t=>t.y)),maxY=Math.max(...tiles.map(t=>t.y+t.size));
  drawVectorIFragment(g,minX,minY,maxX-minX,maxY-minY,{
   sourceOffset:0,length:tiles.length,rotation
  });
 }
 function preload(){for(const kind of KINDS)load(kind==='I'?'I:0:4:0':kind);}
 function dispose(){
  disposed=true;
  for(const asset of images.values()){
   asset.image.onload=null;asset.image.onerror=null;
  }
  images.clear();rasterized.clear();
 }
 return Object.freeze({
  drawTile,drawIFragment:drawVectorIFragment,drawPiece,preload,dispose,
  get imageCount(){return images.size;},
  get rasterCount(){return rasterized.size;}
 });
}

/* NOMAD piece-instance layout. Rendering only; game rules and board cell kinds
 * remain untouched. A contiguous I fragment must belong to ONE locked piece,
 * have consecutive original source indexes, and be physically adjacent in the
 * same direction. Clearing rows never re-seeds the remaining texture.
 */
function collectIFragments(board,metadata,{hiddenRows=null}={}){
 const grouped=new Map(),missing=[];
 const hidden=y=>hiddenRows?.has(y)===true;
 for(let y=0;y<board.length;y++)for(let x=0;x<(board[y]?.length||0);x++){
  if(board[y][x]!=='I'||hidden(y))continue;
  const cell=metadata?.[y]?.[x];
  const valid=cell?.kind==='I'&&Number.isSafeInteger(cell.pieceId)&&
   cell.pieceId>0&&Number.isInteger(cell.sourceIndex)&&
   cell.sourceIndex>=0&&cell.sourceIndex<4&&
   Number.isInteger(cell.rotation)&&cell.rotation>=0&&cell.rotation<=3;
  if(!valid){
   missing.push(Object.freeze({x,y,pieceId:null,sourceOffset:0,length:1,rotation:0,untracked:true}));
   continue;
  }
  if(!grouped.has(cell.pieceId))grouped.set(cell.pieceId,[]);
  grouped.get(cell.pieceId).push({x,y,pieceId:cell.pieceId,index:cell.sourceIndex,rotation:cell.rotation});
 }
 const runs=[];
 for(const entries of grouped.values()){
  entries.sort((a,b)=>a.index-b.index);
  let group=[];
  const emit=()=>{
   if(!group.length)return;
   runs.push(Object.freeze({
    pieceId:group[0].pieceId,
    x:Math.min(...group.map(e=>e.x)),
    y:Math.min(...group.map(e=>e.y)),
    sourceOffset:group[0].index,
    length:group.length,
    rotation:group[0].rotation,
    untracked:false
   }));
   group=[];
  };
  for(const entry of entries){
   if(group.length){
    const last=group[group.length-1],dr=entry.rotation;
    // 0=right,1=down,2=left,3=up in source-index order.
    const dx=[1,0,-1,0][dr],dy=[0,1,0,-1][dr];
    if(dr!==last.rotation||entry.index!==last.index+1||
      entry.x!==last.x+dx||entry.y!==last.y+dy)emit();
   }
   group.push(entry);
  }
  emit();
 }
 return Object.freeze([...runs,...missing].sort((a,b)=>a.y-b.y||a.x-b.x||String(a.pieceId).localeCompare(String(b.pieceId))));
}

/* NOMAD V188 — the approved v06 one-silhouette directional Gaussian system.
 * Keep existing piece identities, clip, stage order and SVG artwork unchanged.
 * Per-silhouette caches avoid per-frame pixel processing and extra GPU passes.
 */
const COLS=10,ROWS=20;
// Respect immutable boardMeta.pieceId even when two independent tetrominoes
// share edges or have been split by completed rows. Fallback legacy cells
// have distinct IDs rather than merging every connected block.
function collectPieceShadowGroups(board,meta,active=null,hiddenRows=null){
 const groups=new Map();
 function add(id,x,y){
  if(!Number.isInteger(x)||!Number.isInteger(y)||
     x<0||x>=COLS||y<0||y>=ROWS)return;
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push({x,y});
 }
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(!board?.[y]?.[x]||hiddenRows?.has(y))continue;
  const pieceId=meta?.[y]?.[x]?.pieceId;
  add(Number.isSafeInteger(pieceId)&&pieceId>0?'locked:'+pieceId:'cell:'+x+':'+y,x,y);
 }
 // A new group is rebuilt from the live matrix EVERY repaint. Rotations,
 // wall kicks, gravity and hold therefore update the silhouette immediately.
 if(active?.matrix){
  const id='active:'+(Number.isSafeInteger(active.id)?active.id:'current');
  active.matrix.forEach((row,dy)=>row.forEach((kind,dx)=>{
   if(kind)add(id,active.x+dx,active.y+dy);
  }));
 }
 return [...groups].map(([id,cells])=>{
  cells.sort((a,b)=>a.y-b.y||a.x-b.x);
  const minX=Math.min(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y));
  const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
  return {id,cells,minX,minY,maxX,maxY};
 });
}

// Public compatibility API; implementation is independently reusable.
const pieceShadowProfile=directionalShadowProfile;
const createPieceShadowRenderer=createDirectionalShadowRenderer;

return {pieceLuminance,PIECE_PATTERNS,drawIFragment,drawIBar,drawTileFace,drawPieceTiles,VECTOR_PIECE_KINDS,spriteIdentity,createVectorTileRenderer,collectIFragments,collectPieceShadowGroups,pieceShadowProfile,createPieceShadowRenderer};
})();
// Canvas user interface, overlay and terminal drawing.
const UI=(()=>{
/* Canvas controls, overlays, sidebar and terminal. */
const SCORE_VALUE_FONT_SIZE=15;

/* Tetris System V052 — Canvas2D drawing primitives.
 * Drawing targets and hitboxes are caller-owned and resolve on each draw,
 * allowing the same primitives to draw gameplay and modal canvases.
 */
function drawPropertySlider({rect,text,region,ink},{x,midY,w,barH,labelW,gap,labelSize,setting,value}){
 const {label,field,min,max,step,unit}=setting;
 const barX=label?x+labelW+gap:x;
 const barW=Math.max(1,x+w-barX),barY=midY-barH/2;
 const fraction=Math.max(0,Math.min(1,(value-min)/(max-min)));
 const digits=step<.1?2:step<1?1:0;
 rect(barX,barY,barW,barH,'#676767');
 rect(barX,barY,barW*fraction,barH,'#cecece');
 if(label)text(label,x,midY,labelSize,ink,'left',Math.max(1,labelW-2));
 text(value.toFixed(digits)+unit,barX+barW/2,midY,
  Math.min(13,Math.max(9,barH*.64)),'#060606','center',Math.max(1,barW-8),'terminal');
 region(barX,barY,barW,barH,'slider',{field,min,max,step,
  trackX:barX,trackW:barW,modalControl:true});
}
function createCanvasUI({getContext,getRegions,C,FONT,
 LETTER_SPACING_EM,BUTTON_ICON_LABELS,
 BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE,
 getButtonPower=()=>0,ICON_FONT=FONT,TERMINAL_FONT=FONT}){
function panel(x,y,w,h,r=8,fill=C.panel,border=C.border){
 const g=getContext();
 if(w<=0||h<=0)return;
 // All UI containers and buttons have square (unbeveled) corners.
 // Preserve existing fills, grayscale luminance, borders and hitbox geometry.
 g.beginPath();g.roundRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1),0);
 if(fill){g.fillStyle=fill;g.fill();}
 if(border){g.strokeStyle=border;g.lineWidth=1;g.stroke();}
}
// No per-label overrides. Canvas fillText(maxWidth) compresses glyph widths,
// so measure naturally and wrap only text that exceeds a caller's available width.
function wrapText(source,maxWidth){
 const g=getContext();
 const paragraphs=String(source).split('\n');
 if(!Number.isFinite(maxWidth))return paragraphs;
 const limit=Math.max(1,maxWidth),lines=[];
 for(const paragraph of paragraphs){
  if(g.measureText(paragraph).width<=limit){lines.push(paragraph);continue;}
  let line='';
  for(const word of paragraph.trim().split(/\s+/)){
   const joined=line?line+' '+word:word;
   if(g.measureText(joined).width<=limit){line=joined;continue;}
   if(line){lines.push(line);line='';}
   if(g.measureText(word).width<=limit){line=word;continue;}
   for(const ch of Array.from(word)){
    if(line&&g.measureText(line+ch).width>limit){lines.push(line);line='';}
    line+=ch;
   }
  }
  lines.push(line);
 }
 return lines;
}
function textStyle(g,str,size,role){
 // Fallout 4 roles: Roboto Condensed for UI, Share Tech Mono for data.
 const icon=BUTTON_ICON_LABELS.has(String(str))||str==='▶';
 const terminal=role==='terminal'&&!icon;
 g.font=(terminal?'400 ':'700 ')+size+'px '+
  (icon?ICON_FONT:terminal?TERMINAL_FONT:FONT);
 g.letterSpacing=(size*LETTER_SPACING_EM).toFixed(3)+'px';
}
function textWidth(str,size){
 const g=getContext();
 g.save();
 textStyle(g,str,size,'ui');
 const width=g.measureText(str).width;
 g.restore();
 return width;
}
function text(str,x,y,size=12,color=C.ink,align='left',maxWidth=Infinity,role='ui',fitLine=false){
 const g=getContext();
 textStyle(g,str,size,role);
 g.textAlign=align;
 g.fillStyle=color;
 const lines=fitLine?[str]:wrapText(str,maxWidth),step=size*1.2;
 const width=fitLine&&Number.isFinite(maxWidth)?[maxWidth]:[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],centerY=y+(i-(lines.length-1)/2)*step;
  // Canvas "middle" tracks the em box, not the ink of the selected font.
  // Align the measured visible glyph bounds with the existing text anchor.
  g.textBaseline='alphabetic';
  const metrics=g.measureText(line);
  const left=metrics.actualBoundingBoxLeft,right=metrics.actualBoundingBoxRight;
  const inkX=align==='center'&&Number.isFinite(left)&&Number.isFinite(right)?
   x+(left-right)/2:x;
  const ascent=metrics.actualBoundingBoxAscent;
  const descent=metrics.actualBoundingBoxDescent;
  if(Number.isFinite(ascent)&&Number.isFinite(descent)&&ascent+descent>0){
   g.fillText(line,inkX,centerY+(ascent-descent)/2,...width);
  }else{
   // Older contexts exposing width alone keep the previous behavior.
   g.textBaseline='middle';
   g.fillText(line,inkX,centerY,...width);
  }
 }
 g.letterSpacing='0px';
}
function rect(x,y,w,h,color){const g=getContext();g.fillStyle=color;g.fillRect(x,y,w,h);}
function region(x,y,w,h,act,opts={}){const model=makeRegion(x,y,w,h,act,opts);getRegions().push(model);return model;}
// All visible button emission is set at the source, not by a later rectangle.
 const grayLevel=n=>{const v=Math.max(0,Math.min(255,Math.round(n)));return 'rgb('+v+','+v+','+v+')';};
 const buttonLight=(x,y,w,h)=>{
  const power=getButtonPower({x,y,w,h});
  return buttonLevel(power);
 };
function key(label,x,y,w,h,act,opts={}){
 const model=makeButtonControl(label,x,y,w,h,act,opts);
 const power=Math.max(0,Math.min(1,Number(getButtonPower(model.hitbox))||0));
 const lit=grayLevel(opts.onLight?lcdButtonInk(power):buttonLevel(power));
 // Negative-space text in solid buttons follows the press (6→30) without
 // disappearing into the bright solid face (206→255).
 const inverseInk=grayLevel(opts.onLight?LCD_BUTTON_LEVELS.solidInk:buttonInkLevel(power));
 const size=opts.fontSize??(BUTTON_ICON_LABELS.has(String(model.label))?BUTTON_ICON_FONT_SIZE:BUTTON_FONT_SIZE);
 // V165: keep button artwork as a single flat face. Solid buttons
 // remain exactly the approved full luminance (206 base, 255 pressed);
 // press afterglow, text, stroke, and hitboxes are unchanged.
 panel(model.x,model.y,model.w,model.h,8,model.light?lit:opts.onLight?'#e7e7e7':C.button,lit);
 text(model.label,model.x+model.w/2,model.y+model.h/2,size,
  model.light?inverseInk:lit,'center',Math.max(10,model.w-2*(opts.labelPadding??7)));
 if(model.arrow)text('▶',model.x+17,model.y+model.h/2,
  BUTTON_ICON_FONT_SIZE,model.light?inverseInk:lit,'center');
 getRegions().push(model.hitbox);
 return model;
}

 return Object.freeze({panel,wrapText,text,textWidth,rect,region,key,buttonLight});
}

/* V063 — Canvas2D HUD painting extracted without visual changes.
 * Caller supplies drawing primitives, live game state and existing button
 * registrar; the same UI can draw on the cached base or cropped canvases.
 */
// A three-cell I is a PREVIEW-ONLY glyph. Gameplay keeps its four-block I;
// drawPiece still supplies the same original continuous gravel SVG artwork.
const PREVIEW_I_SHAPE=Object.freeze([Object.freeze(['I','I','I'])]);
function previewPieceShape(kind,shapes){
 return kind==='I'?PREVIEW_I_SHAPE:shapes?.[kind];
}
// Each occupied preview cell has ONE size: 75% of the gameplay cell,
// supplied by computeLayout(). Only the PIECE'S POSITION varies with its
// footprint. Never scale a whole tetromino to fit the preview container.
// The fixed three-cell I uses this same size as every four-cell tetromino.
function fitPreviewCells(shape,x,y,w,h,cellSize){
 if(!Array.isArray(shape)||!(w>0)||!(h>0)||
    !Number.isFinite(cellSize)||!(cellSize>0))return [];
 const points=[];
 for(let row=0;row<shape.length;row++){
  const values=shape[row];
  if(!Array.isArray(values))continue;
  for(let col=0;col<values.length;col++)if(values[col])points.push([col,row]);
 }
 if(!points.length)return [];
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const minX=Math.min(...xs),minY=Math.min(...ys);
 const cols=Math.max(...xs)-minX+1,rows=Math.max(...ys)-minY+1;
 const startX=x+(w-cellSize*cols)/2,startY=y+(h-cellSize*rows)/2;
 return points.map(([col,row])=>({
  x:startX+(col-minX)*cellSize,
  y:startY+(row-minY)*cellSize,size:cellSize
 }));
}

function secondaryButtonWidth(r,ui){
 return (r.dw-2*r.deckPad-ui.extrasGap)/2*ui.buttonWidthScale;
}

// Single source of control dimensions for visible pixels and invisible hitboxes.
function visitControlButtons(r,UI_SPACE,emit){
 // V114: restore the enclosing controls panel; button geometry and hitboxes
 // stay exactly as before.

 const px=r.dx+r.deckPad,pw=r.dw-2*r.deckPad;
 // The score strip is now in the right-hand column; leave the approved
 // positions and dimensions of every game control unchanged.
 const cy=r.dy+r.deckPad,ch=r.buttonH;
 const gap=UI_SPACE.padGap;
 let ey;
 if(r.compactControls){
  // Narrow landscape: maintain usable touch targets by reflowing controls.
  const third=Math.max(0,(pw-2*gap)/3);
  emit('◀',px,cy,third,ch,'left',{light:true,repeat:true});
  emit('↻',px+third+gap,cy,third,ch,'cw');
  emit('▶',px+2*(third+gap),cy,third,ch,'right',{light:true,repeat:true});
  emit('DROP',px,cy+ch+gap,pw,ch,'soft',{light:true,repeat:true});
  ey=cy+2*(ch+gap);
 }else{
  const col=Math.max(0,(pw-gap*4)/5);
  emit('◀',px,cy,col,ch,'left',{light:true,repeat:true});
  emit('DROP',px+col+gap,cy,col*2+gap,ch,'soft',{light:true,repeat:true});
  emit('▶',px+col*3+gap*3,cy,col,ch,'right',{light:true,repeat:true});
  emit('↻',px+col*4+gap*4,cy,col,ch,'cw');
  ey=cy+ch+r.deckGap;
 }
 // Keep the secondary controls centered at their approved 75% width.
 const extraGap=UI_SPACE.extrasGap;
 const ew=secondaryButtonWidth(r,UI_SPACE);
 const groupW=ew*2+extraGap,groupX=px+(pw-groupW)/2;
 emit('HOLD',groupX,ey,ew,r.extraH,'hold');
 emit('PAUSE',groupX+ew+extraGap,ey,ew,r.extraH,'pause');
}
function registerControlHitboxes(r,UI_SPACE,region){
 visitControlButtons(r,UI_SPACE,(label,x,y,w,h,act,{light=false,repeat=false,modalControl=false}={})=>{
  region(x,y,w,h,act,{kind:'button',light,repeat,modalControl});
 });
}
function createHudDrawing({panel,text,rect,key,smallPiece,getGame,
 C,UI_SPACE,fmt,getLCD=()=>false,LCD_BOARD=C}){
function drawSidebar(r){
 const game=getGame(),onLight=getLCD();
 const readoutColors=onLight?LCD_BOARD:C;
 const {nextPanel:next,statsPanel:stats,holdPanel:hold}=r;
 const labelSize=10;
 const inset=Math.max(3,Math.min(6,stats.w*.06));
 // V141: the same square double-border housing for all five boxes.
 const doubleFrame=(x,y,w,h)=>{
  const rim=Math.min(4,Math.max(2,(h-12)/2));
  panel(x,y,w,h,0,readoutColors.panel,onLight?C.bright:C.border);
  if(w>rim*2+1&&h>rim*2+1)
   panel(x+rim,y+rim,w-rim*2,h-rim*2,0,null,readoutColors.bright);
  return rim;
 };
 const preview=(box,kind,role)=>{
  // One compact panel only. The NEXT/HOLD label is outside its border.
  const heading=role==='next'?'NEXT':'HOLD';
  // The panel aligns right with the header/footer; the label itself
  // stays left-aligned, just outside the panel's top edge.
  text(heading,box.x+inset+1,box.y-r.previewLabelSpace/2,
   labelSize,C.weak,'left',Math.max(8,box.w-2*inset));
  doubleFrame(box.x,box.y,box.w,box.h);
  const pad=5;
  smallPiece(kind,box.x+pad,box.y+pad,
   Math.max(0,box.w-2*pad),Math.max(0,box.h-2*pad),
   role,r.previewCell);
 };
 preview(next,game.queue[0],'next');
 // Three independent flat LCD readouts, not one combined score panel.
 // Labels live outside their boxes; every box has the SAME right-aligned
 // width (also matching the NEXT and HOLD containers).
 const readouts=[['SCORE',fmt(game.score)],['LEVEL',fmt(game.level,2)],['LINES',fmt(game.lines,2)]];
 const slot=stats.h/3;
 const titleSpace=Math.min(15,Math.max(8,slot*.31));
 const bottomGap=Math.min(5,Math.max(2,slot*.10));
 const readoutHeight=Math.max(1,slot-titleSpace-bottomGap);
 readouts.forEach(([title,value],i)=>{
  const top=stats.y+i*slot,boxY=top+titleSpace;
  text(title,stats.x+inset+1,top+titleSpace*.50,labelSize,C.weak,
   'left',Math.max(8,stats.w-2*inset));
  const rim=doubleFrame(stats.x,boxY,stats.w,readoutHeight);
  // Terminal data values are LEFT aligned within their frames.
  const valueInset=Math.max(10,Math.min(12,stats.w*.14));
  text(value,stats.x+valueInset,boxY+readoutHeight/2,SCORE_VALUE_FONT_SIZE,
   readoutColors.ink,'left',Math.max(8,stats.w-valueInset-rim-4),'terminal',true);
 });
 preview(hold,game.hold,'hold');
}
function drawControls(r){
 const onLight=getLCD();
 panel(r.dx,r.dy,r.dw,r.dh,0,onLight?LCD_BOARD.panel:C.panel,onLight?C.bright:C.border);
 visitControlButtons(r,UI_SPACE,(label,x,y,w,h,act,opts)=>{
  key(label,x,y,w,h,act,{...opts,onLight});
 });
}

 return Object.freeze({drawSidebar,drawControls});
}

/* V064 — isolated Canvas2D settings and modal interface.
 * All original drawing primitives/layout measurements are preserved.
 * State is limited to menu scroll, scanline picker, status and view hit area.
 * No WebGL, frame-scheduler, or gameplay dependencies.
 */
// Shared geometry of the visible theme button. Only restore this hitbox
// after score/light overlays clear the underlying game input regions.
function headerThemeBounds(r,UI_SPACE){
 const h=r.headerButtonH;
 return {x:r.hx+r.hw-UI_SPACE.headRightPad-2*h-UI_SPACE.headIconGap,
  y:r.hy+(r.hh-h)/2,w:h,h};
}
// Shared PAUSED / HIGH SCORE geometry; START GAME keeps its original layout.
// The three-row classic scoreboard is centered within the clear band between
// the shared upper title and the unchanged primary-action anchor.
function boardOverlaySlots({x,y,w,h},UI_SPACE){
 const buttonW=w*UI_SPACE.overlayButtonWidthScale;
 const buttonX=x+(w-buttonW)/2;
 const titleY=y+Math.max(15,Math.min(26,h*.07));
 const primaryY=y+h/2;
 const titleSize=20;
 const titleBottom=titleY+titleSize/2;
 const rowH=Math.max(12,Math.min(34,(primaryY-titleBottom-18)/3));
 const scoreH=rowH*3;
 const scoreY=(titleBottom+primaryY-scoreH)/2;
 return {
  titleX:x+w/2,titleY,titleSize,
  score:{x:buttonX,y:scoreY,w:buttonW,h:scoreH},
  actionX:buttonX,actionY:primaryY,actionW:buttonW
 };
}
// Restore the original unframed SCORE / LINES / LEVEL terminal rows and dots.
function drawMenuScoreBox({text,rect,C},box,record){
 const {x,y,w,h}=box,rowH=h/3;
 const rows=[
  ['SCORE',String(record?.score??0).padStart(6,'0')],
  ['LINES',String(record?.lines??0).padStart(2,'0')],
  ['LEVEL',String(record?.level??0).padStart(2,'0')]
 ];
 rows.forEach(([label,value],i)=>{
  const middle=y+(i+.5)*rowH;
  text(label,x,middle,SCORE_VALUE_FONT_SIZE,C.ink,'left',w*.43,'terminal',true);
  text(value,x+w,middle,SCORE_VALUE_FONT_SIZE,C.bright,'right',w*.56,'terminal',true);
  if(i<2){
   const dotW=1.5,dotH=.8;
   const dividerY=middle+rowH/2-dotH/2;
   for(let dx=0;dx+dotW<=w;dx+=5)rect(x+dx,dividerY,dotW,dotH,C.bright);
  }
 });
}

function propertyDeckSpacing(r,gap){
 const available=r.dh-2*r.deckPad;
 const baseGap=Math.min(gap,Math.max(2,r.dh*.045));
 return {available,baseGap,regularH:Math.max(1,(available-3*baseGap)/4)};
}
function propertySliderSize(h){
 return {barH:Math.min(h,Math.max(9,Math.min(24,h*.76))),
  labelSize:Math.min(11,Math.max(8,h*.44))};
}
function drawPropertyDeck({panel,rect,text,region,C},r,gap,rows){
 panel(r.dx,r.dy,r.dw,r.dh,0,C.panel);
 const x=r.dx+r.deckPad,w=Math.max(1,r.dw-2*r.deckPad);
 const {available,baseGap,regularH}=propertyDeckSpacing(r,gap);
 const fixed=rows.reduce((sum,row)=>sum+(row.height??0),0);
 const flexible=rows.filter(row=>row.height===undefined).length;
 const rowGap=rows.length>1?Math.min(baseGap,
  Math.max(0,(available-fixed-flexible*9)/(rows.length-1))):0;
 const rowH=flexible?Math.max(1,Math.min(regularH,
  (available-fixed-rowGap*(rows.length-1))/flexible)):regularH;
 const labelW=Math.min(125,Math.max(80,w*.29));
 const sliderGraphics={rect,text,region,ink:C.ink};
 let y=r.dy+r.deckPad;
 for(const row of rows){
  const h=row.height??rowH;
  if(row.draw)row.draw(x,y,w,h);
  else drawPropertySlider(sliderGraphics,{x,midY:y+h/2,w,
   ...propertySliderSize(h),labelW,gap,...row});
  y+=h+rowGap;
 }
}
function createModalUI({
 DISPLAY_EFFECTS,SCANLINE_CHOICES,getViewport,layout,insets,clearRegions,
 panel,text,rect,region,key,C,UI_SPACE,
 getFX,settingValue,chooseScanlineSetting,invalidate,
 getBest,getModal,LCD_BOARD=C,textWidth=(label,size)=>label.length*size*.6
}){
 const listLabels={phosphor:'PHOSPHOR COLOR',persistence:'PHOSPHOR RESPONSE',scanlines:'SCANLINES',
  vignette:'VIGNETTE',bloom:'BLOOM',ghost:'SIGNAL GHOSTING',softness:'EDGE SOFTNESS'};
 const properties=[{id:'display',title:'DISPLAY MODE',toggle:'lcdDisplay'},...DISPLAY_EFFECTS,
  {id:'defaults',toggle:'defaultsEnabled',title:'RESTORE DEFAULTS'}];
 const lcdProperties=properties.filter(property=>!property.crtOnly);
 const crtProperties=properties.filter(property=>!property.lcdOnly);
 // LCD RESPONSE is shared: legacy LCD uses its grayscale persistence
 // pass; PHYSICAL LCD uses the restored Lab four-drive per-cell STN state.
 const legacyLCD=new Set(['lcdTint','lcdBleed','lcdCells',
  'lcdVignette','lcdEdgeColour','lcdEdgeBlur']);
 // When physical material is selected, hide inactive post-FX sliders;
 // otherwise they would appear to be broken while the physical pass owns LCD.
 const visibleProperties=()=>!settingValue('lcdDisplay')?crtProperties:
  lcdProperties.filter(property=>getFX().lcdPhysical?
   !legacyLCD.has(property.id):
   !['lcdPhysicalReference','lcdPhysicalGlass','lcdDensityStudy',
    'lcdVisibility'].includes(property.id));
 let selected=properties[0],debugCopyState='idle';
 const activeProperty=()=>visibleProperties().includes(selected)?selected:properties[0];
 function currentPattern(){
  const fx=getFX();
  return fx.scanlines?Math.max(0,SCANLINE_CHOICES.findIndex(choice=>choice.id===fx.scanlinePreset)):0;
 }
 function cyclePattern(step){
  if(!SCANLINE_CHOICES.length)return;
  const index=(currentPattern()+step+SCANLINE_CHOICES.length)%SCANLINE_CHOICES.length;
  chooseScanlineSetting(SCANLINE_CHOICES[index].id);invalidate();
 }
// The picker footer shares Hold and Pause geometry.
function modalBounds(name){
 const {W,H}=getViewport();
 const safe=insets(),pad=UI_SPACE.unit,gap=UI_SPACE.unit;
 const board=layout();
 // The personal record fills the existing blurred playfield.
 // Unusually narrow landscape boards need a wider, legible overlay.
 if(name==='scores'){
  const b=board,narrow=b.boardW<205||b.boardH<310;
  if(narrow){
   const w=Math.min(410,W-2*UI_SPACE.padX);
   const h=Math.min(330,Math.max(0,H-safe.top-safe.bottom-2*gap));
   return {x:(W-w)/2,y:safe.top+(H-safe.top-safe.bottom-h)/2,
    w,h,pad,gap,buttonH:b.buttonH,landscapeFallback:true};
  }
  return {x:b.boardX,y:b.boardY,w:b.boardW,h:b.boardH,pad,gap,
   buttonH:b.buttonH,landscapeFallback:false};
 }
 const usable=Math.max(0,H-safe.top-safe.bottom);
 const buttonW=secondaryButtonWidth(board,UI_SPACE),buttonH=board.extraH;
 const w=2*buttonW+3*pad, rowHeight=32;
 const chrome=buttonH+5*pad;
 const budget=Math.min(390,usable*.68,usable-2*gap);
 const count=Math.min(visibleProperties().length,Math.max(0,Math.floor((budget-chrome)/rowHeight)));
 const h=chrome+count*rowHeight;
 return {w,h,x:(W-w)/2,y:safe.top+(usable-h)/2,pad,buttonW,buttonH,rowHeight,count};
}
let optionsScroll=0;
function optionRows(q=modalBounds('options')){
 const {rowHeight,count}=q;
 return {x:q.x+q.pad,y:q.y+q.pad,w:q.w-2*q.pad,h:count*rowHeight+2*q.pad,rowHeight,count,
  maxScroll:Math.max(0,visibleProperties().length-count)*rowHeight};
}
function drawOptions(q){
 const {W,H}=getViewport(),lcd=Boolean(settingValue('lcdDisplay'));
 const colors=lcd?LCD_BOARD:C;
 const view=optionRows(q),first=Math.round(Math.min(optionsScroll,view.maxScroll)/view.rowHeight);
 clearRegions();region(0,0,W,H,'block');
 panel(q.x,q.y,q.w,q.h,0,colors.panel,C.border);
 const {x:frameX,w:frameW}=view;
 panel(frameX,view.y,frameW,view.h,0,null,C.border);
 const {barH}=propertySliderSize(propertyDeckSpacing(layout(),q.pad).regularH);
 const labelSize=10,arrowSize=13;
 const arrowX=frameX+q.pad;
 const labelX=arrowX+textWidth('▶',arrowSize)+q.pad,right=frameX+frameW-q.pad;
 const statusW=Math.ceil(textWidth('DISABLED',labelSize))+2*q.pad;
 const statusX=right-statusW;
 const active=activeProperty();
 for(const [index,property] of visibleProperties().slice(first,first+view.count).entries()){
  const y=view.y+q.pad+index*view.rowHeight,mid=y+view.rowHeight/2;
  const label=(listLabels[property.id]??property.title).toUpperCase();
  const labelEnd=statusX-q.pad;
  const labelWidth=Math.max(1,labelEnd-labelX-2*q.pad);
  if(property===active)text('▶',arrowX,mid,arrowSize,colors.ink,'left');
  text(label,labelX,mid,labelSize,colors.ink,'left',labelWidth,'ui',true);
  region(frameX,y,statusX-frameX,view.rowHeight,'property:'+property.id,{kind:'button',modalControl:true});
  const dotStart=Math.min(labelEnd-q.pad,labelX+textWidth(label,labelSize)+q.pad);
  for(let x=dotStart;x<labelEnd-1;x+=q.pad)rect(x,mid-.5,1,1,colors.ink);
  const height=Math.min(barH,view.rowHeight-2);
  if(property.noToggle){
   key('OPEN',statusX,mid-height/2,statusW,height,'property:'+property.id,
    {onLight:lcd,modalControl:true,fontSize:labelSize,labelPadding:q.pad});
  }else{
   const enabled=Boolean(settingValue(property.toggle));
   key(enabled?'ENABLED':'DISABLED',statusX,mid-height/2,statusW,height,'toggle',
    {field:property.toggle,light:enabled,onLight:lcd,modalControl:true,fontSize:labelSize,labelPadding:q.pad});
  }
 }
 const w=q.buttonW,y=view.y+view.h+q.pad;
 key('CONFIRM',q.x+q.pad,y,w,q.buttonH,'confirmProperties',{light:true,onLight:lcd});
 key('CANCEL',q.x+2*q.pad+w,y,w,q.buttonH,'cancelProperties',{onLight:lcd});
}
function drawProperty(){
 const {W,H}=getViewport(),r=layout(),gap=UI_SPACE.unit;
 clearRegions();region(0,0,W,H,'block');
 const rows=[],lcd=Boolean(settingValue('lcdDisplay')),colors=lcd?LCD_BOARD:C;
 const property=activeProperty();
 const buttonRow=(label,act,opts={})=>{
  const height=opts.light?r.buttonH:r.extraH;
  return {height,draw:(x,y,w)=>key(label,x,y,w,height,act,{modalControl:true,onLight:lcd,...opts})};
 };
 if(property.toggle){
  const field=property.toggle,enabled=Boolean(settingValue(field));
  const label=field==='lcdDisplay'?(lcd?'LCD  ↔  CRT':'CRT  ↔  LCD'):
   (enabled?'ENABLED':'DISABLED');
  const toggle=buttonRow(label,'toggle',{field,light:field==='lcdDisplay'||enabled});
  if(property.pattern)rows.push({height:Math.max(toggle.height,r.extraH),draw(x,y,w,h){
   const toggleW=(w-gap)*.42,buttonY=y+(h-toggle.height)/2;
   toggle.draw(x,buttonY,toggleW);
   const patternX=x+toggleW+gap,patternW=w-toggleW-gap;
   const arrowW=Math.min(r.extraH,patternW*.19),arrowY=y+(h-r.extraH)/2;
   key('‹',patternX,arrowY,arrowW,r.extraH,'pattern:previous',{modalControl:true});
   key('›',x+w-arrowW,arrowY,arrowW,r.extraH,'pattern:next',{modalControl:true});
   text(SCANLINE_CHOICES[currentPattern()]?.name??'OFF',patternX+patternW/2,y+h/2,11,
    C.bright,'center',Math.max(1,patternW-2*arrowW-4));
  }});
  else rows.push(toggle);
 }
 const sliders=property.sliders??[];
 for(const [label,field,min,max,step,unit] of sliders){
  rows.push({setting:{label:label||'STRENGTH',field,min,max,step,unit},
   value:Number(settingValue(field))});
  if(property.id==='lcdDensityStudy'&&field==='lcdPhysicalDensity'){
   rows.push({height:Math.min(61,Math.max(49,r.extraH+13)),draw:(x,y,w,h)=>{
    const current=Number(settingValue('lcdPhysicalDensity'));
    const presets=[1,1.5,2,2.5],space=gap,buttonW=(w-3*space)/4;
    const buttonH=Math.max(22,h-19);
    presets.forEach((preset,i)=>{
     key(preset+'×',x+i*(buttonW+space),y,buttonW,buttonH,
      'density-preset:'+preset,{
       modalControl:true,onLight:lcd,light:Math.abs(current-preset)<.001,
       fontSize:Math.min(12,Math.max(9,buttonW*.21)),labelPadding:3
      });
    });
    const {W,H}=getViewport();
    const grid=physicalLCDGrid(W,H,current);
    text('PHYSICAL CELLS  '+grid.columns+' × '+grid.rows,
     x+w/2,y+buttonH+(h-buttonH)/2,Math.min(11,Math.max(9,(h-buttonH)*.7)),
     colors.ink,'center',w-6,'terminal');
   }});
  }
 }
 if(property.id==='defaults'&&settingValue(property.toggle))rows.push(buttonRow('RESTORE DEFAULTS','resetFX'));
 drawPropertyDeck({panel,rect,text,region,C:colors},r,gap,rows);
 const theme=headerThemeBounds(r,UI_SPACE);
 region(theme.x,theme.y,theme.w,theme.h,'theme',{kind:'button'});
 region(theme.x+theme.w+UI_SPACE.headIconGap,theme.y,theme.w,theme.h,'options',{kind:'button'});
}
function drawScores(q){
 // The shared upper title and START GAME action anchor remain unchanged.
 const {W,H}=getViewport(),{x,y,w,h}=q;
 clearRegions();region(0,0,W,H,'block');
 const onLight=Boolean(settingValue('lcdDisplay')),boardColors=onLight?LCD_BOARD:C;
 panel(x,y,w,h,5,null,boardColors.border);
 const best=getBest(),slots=boardOverlaySlots(q,UI_SPACE);
 text('HIGH SCORE',slots.titleX,slots.titleY,slots.titleSize,boardColors.bright,'center',w-18);
 drawMenuScoreBox({text,rect,C:boardColors},slots.score,best);
 // Same size, position, font and leading arrow as RESUME / START GAME.
 key('RETURN',slots.actionX,slots.actionY,slots.actionW,q.buttonH,
  'close',{light:true,arrow:true,onLight});
 // The base header is still visible; register just its colour button above
 // this menu's full-screen input blocker, with no duplicate button drawing.
 const theme=headerThemeBounds(layout(),UI_SPACE);
 region(theme.x,theme.y,theme.w,theme.h,'theme',{kind:'button'});
}
function paintModal(q){
 const modal=getModal();
 if(modal==='options')drawOptions(q);
 else if(modal==='property')drawProperty();
 else if(modal==='scores')drawScores(q);
}
 return Object.freeze({
  modalBounds,paintModal,cyclePattern,paintProperty:drawProperty,
  optionRows,
  get optionsScroll(){return optionsScroll;},
  set optionsScroll(value){optionsScroll=value;invalidate();},
  reset(){selected=properties[0];optionsScroll=0;debugCopyState='idle';},
  selectProperty(id){
   const property=visibleProperties().find(entry=>entry.id===id);
   if(!property)return false;
   selected=property;invalidate();return true;
  },
  get property(){return activeProperty().id;},
  get debugCopyState(){return debugCopyState;},
  set debugCopyState(value){debugCopyState=value;}
 });

}

/* NOMAD minimal terminal output engine.
 * Understands a small byte stream: printable ASCII/text, CR, LF, BS,
 * TAB, and CSI K / 2K (erase-to-end / erase-entire-line).
 *
 * It owns characters and cursor only; it does NOT know about gameplay,
 * message timestamps, animation timing, fades, or the canvas. The UI keeps
 * the two fixed '>' prompts and treats row 0 as live output, row 1 as history.
 */
function createTerminalEngine({columns=36,capacity=160}={}){
 const max=Math.max(4,Math.min(1024,Math.trunc(Number(capacity)||160)));
 const clampColumns=n=>Math.max(4,Math.min(max,Math.trunc(Number(n)||4)));
 let cols=clampColumns(columns),cursor=2;
 let active=Array(max).fill(' '),history='';
 let mode='text',csi='';
 active[0]='>';active[1]=' ';
 const cellWrite=ch=>{
  if(cursor>=cols-1)return false; // reserve one complete cursor cell
  active[cursor++]=ch;
  return true;
 };
 const reset=()=>{
  active.fill(' ');
  active[0]='>';active[1]=' ';
  cursor=2;
 };
 const clearAfter=()=>{
  for(let i=cursor;i<max;i++)active[i]=' ';
 };
 const clearLine=()=>{
  for(let i=2;i<max;i++)active[i]=' ';
 };
 function executeCSI(command){
  const raw=csi;
  csi='';
  if(command==='K'){
   if(raw==='2')clearLine();
   else if(raw===''||raw==='0')clearAfter();
  }
 }
 function feed(input){
  let changed=false;
  for(const ch of String(input)){
   if(mode==='esc'){
    mode=ch==='['?'csi':'text';
    csi='';
    continue;
   }
   if(mode==='csi'){
    if(/[0-9;]/.test(ch)&&csi.length<12){csi+=ch;continue;}
    if(ch==='K')executeCSI(ch);
    mode='text';csi='';
    continue;
   }
   if(ch==='\x1b'){mode='esc';continue;}
   if(ch==='\r'){cursor=2;continue;}
   if(ch==='\n'){
    history=active.slice(0,Math.min(cursor,cols)).join('').trimEnd();
    reset();changed=true;continue;
   }
   if(ch==='\b'){cursor=Math.max(2,cursor-1);continue;}
   if(ch==='\t'){
    const target=2+Math.ceil((cursor-1)/4)*4;
    while(cursor<target&&cursor<cols-1)changed=cellWrite(' ')||changed;
    continue;
   }
   // Ignore unsupported C0 controls and DEL rather than printing boxes.
   const code=ch.codePointAt(0);
   if(code<32||code===127)continue;
   changed=cellWrite(ch)||changed;
  }
  return changed;
 }
 function setColumns(n){
  cols=clampColumns(n);
  cursor=Math.max(2,Math.min(cursor,cols-1));
 }
 function setHistory(line){
  // Resizing a responsive UI requires recomposing historical dot leaders.
  history=String(line||'').slice(0,cols-1);
 }
 function snapshot(){
  return {cells:active.slice(0,cols),cursor,columns:cols,history};
 }
 return Object.freeze({feed,setColumns,setHistory,snapshot});
}

/* NOMAD two-row line-at-a-time terminal. Fixed character cells, uppercase typography and
 * character-at-a-time output. Right-side statuses are aligned using dot leaders
 * computed BEFORE the line is typed; no text ever jumps on screen.
 * Rendering owns no game rules, DOM, or WebGL state.
 */
const pad=n=>String(n).padStart(2,'0');
function stamped(date,seconds=true){
 const d=date instanceof Date&&Number.isFinite(date.getTime())?date:new Date();
 return '['+pad(d.getHours())+':'+pad(d.getMinutes())+
  (seconds?':'+pad(d.getSeconds()):'')+']';
}
function terminalLineBounds(r){
 return {x:r.dx+5,y:r.dy+r.dh+1,w:Math.max(1,r.dw-10),h:37};
}
// A line is built once, then emitted through the same character grid that
// moves the full-cell cursor. Statuses never pop in at the right-hand edge.
function composeTerminalMessage(entry,columns){
 const width=Math.max(1,Math.floor(columns)-3); // '> ', then one cursor cell
 const parts=value=>{
  const s=String(value||'').trim().toUpperCase();
  const colon=s.indexOf(':');
  if(colon>0)return [s.slice(0,colon).trim(),s.slice(colon+1).trim()];
  const i=s.indexOf(' ');
  return i<0?['SYS',s]:[s.slice(0,i),s.slice(i+1).trim()];
 };
 const shortTag={SYSTEM:'SYS',SESSION:'SES',GAME:'GM',INPUT:'IN',CLEAR:'CLR',LEVEL:'LVL'};
 const candidates=[
  [stamped(entry.at,true),parts(entry.full),false],
  [stamped(entry.at,true),parts(entry.short),false],
  [stamped(entry.at,false),parts(entry.full),false],
  [stamped(entry.at,false),parts(entry.short),false],
  [stamped(entry.at,false),parts(entry.short),true],
  ['',parts(entry.short),true]
 ];
 for(const [stamp,p,abbreviate] of candidates){
  const tag=abbreviate?(shortTag[p[0]]||p[0].slice(0,3)):p[0];
  const left=(stamp?stamp+' ':'')+tag;
  const right=p[1];
  // Minimum '..' and spaces around the leaders; exact width keeps the
  // final status flush-right one cell before the blinking block cursor.
  const remaining=width-left.length-right.length;
  if(remaining>=4){
   return left+' '+'.'.repeat(remaining-2)+' '+right;
  }
 }
 // Very small viewports: retain the status first, with as much label as fits.
 const [tag,status]=parts(entry.short);
 const right=status.slice(-Math.max(1,width-4));
 const room=width-right.length;
 const left=tag.slice(0,Math.max(0,room-3));
 if(room>=4)return left+' '+'.'.repeat(room-left.length-2)+' '+right;
 return right.padStart(width,' ');
}
// A small authentic byte-stream terminal owns the character grid and cursor.
// NOMAD owns the queue, fixed prompts, and two-row snap/fade presentation.
// Old text snaps off, waits 250 ms, appears on the lower history row,
// then waits 250 ms before the next message types at 37 characters/second.
function createTerminalLog({clock=()=>new Date(),
 typeMs=1000/37,holdMs=1750,offMs=250,pretypeMs=250}={}){
 const engine=createTerminalEngine({columns:36});
 let columns=36,phase='new';
 let current='',activeEntry=null,historyEntry=null;
 let nextAt=0,lastInput=0;
 const events=[{full:'SYSTEM: READY',short:'SYS: READY',at:clock()}];
 const clearActive=now=>{
  // CR + ANSI CSI 2K resets the output without touching either prompt.
  engine.feed('\r\x1b[2K');
  lastInput=now;
 };
 const write=(ch,now)=>{engine.feed(ch);lastInput=now;};
 function enqueue(full,short=full,priority=false){
  const entry={full:String(full).toUpperCase(),short:String(short).toUpperCase(),at:clock()};
  if(priority)events.splice(0,events.length,entry);
  else{events.push(entry);if(events.length>6)events.splice(0,events.length-6);}
 }
 function setColumns(n){
  const next=Math.max(4,Math.min(160,Math.floor(Number(n)||4)));
  if(next===columns)return;
  const state=engine.snapshot();
  const alreadyTyped=state.cells.slice(2,state.cursor).join('');
  columns=next;
  engine.setColumns(columns);
  // Recompose the status suffix at the actual viewport's character width.
  if(historyEntry)engine.setHistory('> '+composeTerminalMessage(historyEntry,columns));
  if(activeEntry&&phase!=='snap-off'){
   const rewritten=composeTerminalMessage(activeEntry,columns);
   current=rewritten;
   if(!rewritten.startsWith(alreadyTyped)||state.cursor>=columns){
    clearActive(lastInput);
    if(phase==='hold')phase='type';
    nextAt=0;
   }
  }
 }
 function start(now){
  activeEntry=events.shift()||null;
  if(!activeEntry){phase='hold';nextAt=now+holdMs;return false;}
  clearActive(now);
  current=composeTerminalMessage(activeEntry,columns);
  phase='type';nextAt=now;
  return true;
 }
 function advance(now){
  if(now<nextAt)return false;
  if(phase==='new')return start(now);
  if(phase==='type'){
   const typed=engine.snapshot().cursor-2;
   if(typed<current.length){
    write(current[typed],now);nextAt=now+typeMs;return true;
   }
   phase='hold';nextAt=now+holdMs;
   return false;
  }
  if(phase==='hold'){
   if(events.length===0)return false;
   // Only content snaps off; the two fixed prompt arrows remain visible.
   phase='snap-off';nextAt=now+offMs;lastInput=now;
   return true;
  }
  if(phase==='snap-off'){
   // LF actually advances the terminal stream. NOMAD draws the just-finished
   // line in the faded lower row instead of a conventional upper scrollback.
   historyEntry=activeEntry;
   engine.feed('\n');
   engine.setHistory('> '+composeTerminalMessage(historyEntry,columns));
   activeEntry=events.shift()||null;
   if(!activeEntry){phase='hold';nextAt=now+holdMs;return true;}
   clearActive(now);
   current=composeTerminalMessage(activeEntry,columns);
   phase='pretype';nextAt=now+pretypeMs;
   return true;
  }
  if(phase==='pretype'){
   phase='type';nextAt=now;
   return true;
  }
  return false;
 }
 function cursorVisible(now){
  const elapsed=Math.max(0,now-lastInput);
  return elapsed<500||Math.floor((elapsed-500)/480)%2===0;
 }
 function nextDelay(now){
  const elapsed=Math.max(0,now-lastInput);
  const blink=elapsed<500?500-elapsed:480-((elapsed-500)%480);
  const phaseWait=(phase==='hold'&&!events.length)?Infinity:Math.max(0,nextAt-now);
  return Math.max(16,Math.min(blink,phaseWait));
 }
 function snapshot(){
  return {...engine.snapshot(),phase,
   pending:events.length,activeVisible:phase!=='snap-off'};
 }
 return Object.freeze({enqueue,setColumns,advance,cursorVisible,nextDelay,snapshot});
}
function drawTerminalLog(ctx,log,r,now,ink='#e3e3e3',bg='#080808',
 font='"Roboto Condensed",ui-monospace,Menlo,monospace'){
 const b=terminalLineBounds(r);
 const fontSize=10;
 ctx.save();
 ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();
 ctx.font='700 '+fontSize+'px '+font;
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.letterSpacing='0px';
 if('fontKerning' in ctx)ctx.fontKerning='none';
 // Title-style proportional characters retain a fixed terminal cell grid.
 const cell=Math.max(1,Math.ceil(Math.max(
  ...['M','W','@','0'].map(ch=>ctx.measureText(ch).width)
 ))+1);
 log.setColumns(Math.max(4,Math.floor(b.w/cell)));
 const {cells,cursor,history,activeVisible}=log.snapshot();
 const metrics=ctx.measureText('H');
 const ascent=metrics.actualBoundingBoxAscent||fontSize*.70;
 const descent=metrics.actualBoundingBoxDescent||0;
 const cellH=Math.ceil(ascent+descent)+4;
 // Preserve the two-row terminal; shift its artwork 8px below the original
 // active position, rather than 14px. Gameplay layout is unchanged.
 const pitch=14,top=b.y+16,bottom=top+pitch;
 function glyph(ch,col,y,color=ink){
  ctx.fillStyle=color;
  ctx.fillText(ch,b.x+col*cell+(cell-ctx.measureText(ch).width)/2,
   y+(ascent-descent)/2);
 }
 // The two prompts are fixed. Historical text never moves or rewrites them.
 if(activeVisible){
  for(let i=2;i<cursor;i++){
   const ch=cells[i];
   if(ch!==' ')glyph(ch,i,top);
  }
 }
 for(let i=2;i<history.length&&i<cells.length;i++){
  const ch=history[i];
  if(ch!==' ')glyph(ch,i,bottom);
 }
 // Background-gradient occlusion affects ONLY older text at the bottom.
 const fade=ctx.createLinearGradient(0,b.y+23,0,b.y+b.h);
 fade.addColorStop(0,'rgba(8,8,8,0)');
 fade.addColorStop(.55,'rgba(8,8,8,0.40)');
 fade.addColorStop(1,bg);
 ctx.fillStyle=fade;ctx.fillRect(b.x,b.y+23,b.w,b.h-23);
 // Draw fixed arrows AFTER fading so neither the arrow nor its position dims.
 glyph('>',0,top);
 glyph('>',0,bottom);
 if(log.cursorVisible(now)&&cursor<cells.length){
  const position=activeVisible?cursor:2;
  const x=b.x+position*cell,y=top-cellH/2;
  ctx.fillStyle=ink;ctx.fillRect(x,y,cell,cellH);
  const ch=activeVisible?cells[position]:' ';
  if(ch&&ch!==' ')glyph(ch,position,top,bg);
 }
 ctx.restore();
}

return {createCanvasUI,drawPropertySlider,drawPropertyDeck,previewPieceShape,fitPreviewCells,createHudDrawing,visitControlButtons,registerControlHitboxes,headerThemeBounds,boardOverlaySlots,drawMenuScoreBox,createModalUI,createTerminalEngine,terminalLineBounds,composeTerminalMessage,createTerminalLog,drawTerminalLog};
})();
// Device-independent CSS-pixel visual geometry.
const Layout=(()=>{
'use strict';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const PORTRAIT_MIN_BOARD_GAP=8;
function computeLayout(W,H,safe,ui){
  W=Math.max(1,Number(W)||1);H=Math.max(1,Number(H)||1);
  const edges={
    top:clamp(Number(safe?.top)||0,0,H*.45),
    bottom:clamp(Number(safe?.bottom)||0,0,H*.45),
    left:clamp(Number(safe?.left)||0,0,W*.45),
    right:clamp(Number(safe?.right)||0,0,W*.45)
  };
  const usableW=Math.max(1,W-edges.left-edges.right);
  const usableH=Math.max(1,H-edges.top-edges.bottom);
  const landscape=W>H&&H<=600;
  const width=landscape?usableW:Math.min(usableW,ui.appMax);
  const off=edges.left+(usableW-width)/2;
  const pad=ui.padX,inner=Math.max(0,width-2*pad);
  const short=H<=730,compact=H<=620,gap=ui.stackGap;
  const deckPad=ui.deckPad,deckGap=ui.deckGap;
  // Preserve the established portrait sizes on either side of each range.
  // Grow the header and deck together gradually, so their combined height
  // grows more slowly than the viewport and cannot take height from the board.
  const compactGrowth=clamp((H-604)/32,0,1);
  const regularGrowth=clamp((H-702)/56,0,1);
  const preferredButtonH=42+3*compactGrowth+(ui.padHeight-45)*regularGrowth;
  const preferredExtraH=42+(ui.headIcons-42)*regularGrowth;
  const buttonH=landscape?(compact?42:short?45:ui.padHeight):
    Math.max(44,preferredButtonH);
  const headerButtonH=landscape?37:preferredExtraH;
  const extraH=landscape?headerButtonH:Math.max(44,preferredExtraH);
  let hy=edges.top+4+5*compactGrowth-9*regularGrowth;
  let hh=50+8*compactGrowth+(ui.headHeight-58)*regularGrowth;
  const dhDefault=2*deckPad+deckGap+buttonH+extraH;
  // Ease into the full bottom margin. The terminal needs 37 CSS pixels
  // plus its 1px deck gap, including room below the usable area if present.
  const preferredMargin=Math.min(ui.deckBottom,
    Math.max(ui.unit,usableH*.055,ui.deckBottom+(H-550)*.25));
  const bottomMargin=Math.max(preferredMargin,38-edges.bottom);
  let dh=dhDefault,dy=H-edges.bottom-bottomMargin-dh;
  let sy=hy+hh+gap,sh=Math.max(0,dy-gap-sy);
  let hx=off+pad,hw=inner,sx=off+pad,sw=inner,dx=off+pad,dw=inner;
  if(landscape){
    const legacyStatsOffset=ui.scoreHeight+deckGap;
    let left=clamp(width*.24,100,205);
    let right=clamp(width*.30,166,260);
    const shortage=Math.max(0,124-(width-left-right-36));
    if(shortage){
      left=Math.max(88,left-shortage*.4);
      right=Math.max(150,right-shortage*.6);
    }
    hy=edges.top+8;hh=Math.min(64,Math.max(42,usableH-16));
    dy=edges.top+8+legacyStatsOffset;
    // Reserve an unframed terminal line below the landscape controls.
    dh=Math.max(0,usableH-16-legacyStatsOffset-31);
    sy=edges.top+8;sh=Math.max(0,usableH-16);
    hx=off+8;hw=Math.max(0,left);
    sx=off+left+14;sw=Math.max(0,width-left-right-36);
    dx=off+width-right-8;dw=Math.max(0,right);
  }
  const sideGap=Math.min(ui.sideGap,Math.max(0,sw*.025));
  const sideWidth=Math.min(ui.side,Math.max(0,sw*.36));
  // The stage already excludes one stack gap at its top and bottom.
  const minimumBoardSpacing=2*Math.max(0,PORTRAIT_MIN_BOARD_GAP-gap);
  const boardRegionH=landscape?sh:Math.max(0,sh-minimumBoardSpacing);
  const brickGap=ui.padGap; // Identical to the horizontal control gap.
  let bw=Math.max(0,Math.min(305,sw-sideWidth-sideGap,boardRegionH/2));
  if(!landscape&&bw>4){
    // V135: anchor the OUTER brick frame (not the board's playable cells)
    // to the header and footer's left edge. Reserve the full 75%-cell-wide
    // rail on both sides and keep the 75%-size preview panel fully visible.
    // Only unusually width-constrained portrait viewports need a small
    // additional board reduction to satisfy both edge alignments.
    const framedSpan=boardWidth=>{
      const tile=Math.max(0,(boardWidth-4)/10)*.75;
      const sidebarPanelWidth=Math.min(sideWidth,
        Math.max(Math.min(sideWidth,52),tile*4+10));
      // Two board-to-rail gutters, plus the right rail-to-sidebar gutter.
      return boardWidth+2*tile+3*brickGap+sidebarPanelWidth;
    };
    if(framedSpan(bw)>hw){
      let lo=4,hi=bw;
      for(let i=0;i<32;i++){
        const mid=(lo+hi)/2;
        if(framedSpan(mid)<=hw)lo=mid;
        else hi=mid;
      }
      bw=lo;
    }
  }
  const bh=bw*2;
  const bx=landscape?sx+Math.max(0,(sw-bw-sideGap-sideWidth)/2):
    hx+Math.max(0,(bw-4)/10)*.75+brickGap;
  // Keep the game board's 10:20 ratio while centering it vertically.
  const by=sy+Math.max(0,(sh-bh)/2);
  // When width limits the board, move the header and deck inward equally.
  // Keep the leftover space outside the centered stack.
  const stackInset=landscape?0:Math.max(0,(sh-bh)/2+gap-PORTRAIT_MIN_BOARD_GAP);
  hy+=stackInset;
  dy-=stackInset;
  sy+=stackInset;
  sh-=2*stackInset;
  // V133: in portrait, align the complete sidebar's RIGHT edge with
  // the header and footer; do not right-align its text labels.
  // Landscape retains its existing three-column arrangement.
  const boardCell=Math.max(0,(bw-4)/10);
  const previewCell=boardCell*.75;
  const firstSideX=bx+bw+sideGap;
  // V141 portrait: match the six-pixel gap on BOTH sides of the right rail.
  // All five sidebar panels still terminate at the unchanged header edge.
  // Landscape retains its previously approved three-column geometry.
  const rightRailEnd=bx+bw+brickGap+previewCell;
  const equalGutterX=rightRailEnd+brickGap;
  const sxSide=landscape?firstSideX:
    Math.min(hx+hw,Math.max(firstSideX,equalGutterX));
  const swSide=landscape?Math.max(0,Math.min(sideWidth,sx+sw-sxSide)):
    Math.max(0,hx+hw-sxSide);
  // V132: compact, equal-width panels share one right edge. NEXT/HOLD each
  // have just one visible preview frame, with a label above its border.
  // The game board and outer sidebar bounds remain untouched.
  const previewLabelSpace=16;
  const panelGap=ui.unit;
  const desiredWidth=previewCell*4+10; // max-size I piece + 5px edge inset
  // Portrait boxes expand to the rail gutter, rather than leaving an
  // uneven strip. Preserve the existing compact landscape sizing.
  const panelWidth=landscape?
    Math.min(swSide,Math.max(Math.min(swSide,52),desiredWidth)):swSide;
  const panelX=sxSide+swSide-panelWidth;
  const previewTarget=panelWidth;
  // V138: three separate SCORE / LEVEL / LINES readouts need room for
  // labels above flat, equal-width displays. Keep the center alignment.
  const statsTarget=Math.min(150,Math.max(104,bh*.32));
  const usablePanelHeight=Math.max(0,bh-2*previewLabelSpace-2*panelGap);
  const targetTotal=2*previewTarget+statsTarget;
  const fit=targetTotal>0?Math.min(1,usablePanelHeight/targetTotal):0;
  let previewH=previewTarget*fit,statsH=statsTarget*fit;
  // A very short portrait may have a wide sidebar but limited vertical
  // height. Reserve legible score rows and let previews become shallower.
  if(!landscape){
    const minStatsH=Math.min(96,usablePanelHeight*.58);
    if(statsH<minStatsH){
      statsH=minStatsH;
      previewH=Math.min(previewTarget,Math.max(0,(usablePanelHeight-statsH)/2));
    }
  }
  const nextPanel={x:panelX,y:by+previewLabelSpace,w:panelWidth,h:previewH};
  const statsPanel={x:panelX,y:by+(bh-statsH)/2,w:panelWidth,h:statsH};
  const holdPanel={x:panelX,y:by+bh-previewH,w:panelWidth,h:previewH};
  const compactControls=landscape&&(dw-2*deckPad)<250;
  return {safe:edges,landscape,short,compact,compactControls,width,off,pad,inner,gap,
    hy,hh,hx,hw,sy,sh,sx,sw,boardX:bx,boardY:by,boardW:bw,boardH:bh,
    sideX:sxSide,sideW:swSide,brickGap,previewCell,previewLabelSpace,holdPanel,nextPanel,statsPanel,dx,dy,dw,dh,
    deckPad,deckGap,buttonH,headerButtonH,extraH,
    footerY:H-edges.bottom-18-stackInset};
}
const api=Object.freeze({computeLayout});

return api;
})();
export const {PHOSPHOR_BOUNDS,normalizePersistenceMs,integratePhosphorResponse,createPhosphorPersistencePass,createCompositor,MAX_BUTTON_FLASHES,BUTTON_BASE_LEVEL,BUTTON_PEAK_LEVEL,BUTTON_FLASH_PEAK_MS,MIN_PRESS_FRAME_MS,BUTTON_AFTERGLOW_MS,BUTTON_FLASH_TOTAL_MS,createButtonFeedback,buttonFeedbackChanged,GPU_BUTTON_CAPACITY,GPU_BUTTON_SOURCE_LEVELS,excitedButtonGray,createGpuButtonLighting,buttonFeedbackLayers,croppedBounds,sidebarBounds,controlsBounds,drawCroppedCanvas,createRenderInvalidation,captureGameVisualState,gameVisualStateChanged,flashPhase}=CRT;
export const {pieceLuminance,PIECE_PATTERNS,drawIFragment,drawIBar,drawTileFace,drawPieceTiles,VECTOR_PIECE_KINDS,spriteIdentity,createVectorTileRenderer,collectIFragments,collectPieceShadowGroups,pieceShadowProfile,createPieceShadowRenderer}=Art;
export const {createCanvasUI,drawPropertySlider,drawPropertyDeck,previewPieceShape,fitPreviewCells,createHudDrawing,visitControlButtons,registerControlHitboxes,headerThemeBounds,boardOverlaySlots,drawMenuScoreBox,createModalUI,createTerminalEngine,terminalLineBounds,composeTerminalMessage,createTerminalLog,drawTerminalLog}=UI;
export {buttonLevel,buttonInkLevel,PIECE_LUMINANCE,Layout};
export {instrumentCompositorPasses,makeRegion,makeButtonControl,findRegionAt,sliderValueAt};

/* Rendering-resource lifecycle: private implementation, public explicit hooks.
 * Platform decides WHEN to suspend or dispose; renderer owns WHAT is disposed.
 */
const RenderResourceLifecycle=(()=>{
/* Source-pixel estimate, not an observed browser allocation or GPU VRAM.
 * Runs only when Copy Debug is requested by the user.
 */
function estimateCanvasSourceBytes(canvases=[]){
 const names=['base','board','piece-mask','sidebar','controls','terminal','modal','popup','picker'];
 const seen=new Set(),surfaces=[];
 let pixels=0;
 for(const [i,canvas] of canvases.entries()){
  if(!canvas||seen.has(canvas))continue;
  seen.add(canvas);
  const width=canvas.width,height=canvas.height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<0||height<0||!Number.isSafeInteger(width*height*4))continue;
  const count=width*height;
  pixels+=count;
  surfaces.push(Object.freeze({name:names[i]||'source-'+i,
   width,height,pixels:count,rgba8MiB:+(count*4/1048576).toFixed(2)}));
 }
 return Object.freeze({count:surfaces.length,pixels,rgba8Bytes:pixels*4,
  rgba8MiB:+(pixels*4/1048576).toFixed(2),surfaces:Object.freeze(surfaces)});
}
/* The renderer owns its compositor, scene meshes, UI CanvasTextures and audio.
 * Teardown is idempotent and continues when an individual dispose throws.
 * No cleanup is triggered by temporary visibility loss or bfcache entry.
 */
function createGraphicsCleanup({
 renderer,compositor,scene,textures=[],canvases=[],getAudioContext=()=>null
}={}){
 let done=false;const errors=[];
 function safe(name,callback){
  try{callback();}catch(error){
   errors.push({name,error:String(error?.message||error).slice(0,160)});
  }
 }
 function dispose(){
  if(done)return false;
  done=true;
  safe('compositor',()=>compositor?.dispose?.());
  const geometries=new Set(),materials=new Set();
  safe('scene-traverse',()=>scene?.traverse?.(object=>{
   if(object.geometry)geometries.add(object.geometry);
   const material=object.material;
   if(Array.isArray(material)){
    for(const item of material)if(item)materials.add(item);
   }else if(material)materials.add(material);
  }));
  for(const geometry of geometries)safe('geometry',()=>geometry.dispose?.());
  for(const material of materials)safe('material',()=>material.dispose?.());
  for(const texture of new Set(textures))if(texture)
   safe('texture',()=>texture.dispose?.());
  safe('renderer',()=>renderer?.dispose?.());
  for(const canvas of new Set(canvases))if(canvas)safe('canvas',()=>{
   canvas.width=1;canvas.height=1;
  });
  safe('audio',()=>{
   const audio=getAudioContext();
   const result=audio?.close?.();
   if(result?.catch)result.catch(()=>{});
  });
  return true;
 }
 return Object.freeze({dispose,
  get disposed(){return done;},
  get errors(){return errors.map(e=>({...e}));}
 });
}


/* NOMAD Tetris V089 — WebGL context lifecycle and bounded diagnostics.
 * Three.js still owns the WebGLRenderer and its internal context recreation.
 * This observer prevents game activity while the context is unavailable and
 * reports recovery outcomes without storage, network calls or visible UI.
 */
function createGraphicsHealth({
 canvas,onLost,onRestored,now=()=>Date.now(),historyLimit=8
}){
 if(!canvas||typeof canvas.addEventListener!=='function'||
    typeof canvas.removeEventListener!=='function'||
    typeof onLost!=='function'||typeof onRestored!=='function')
  throw new TypeError('Graphics health requires a canvas and lifecycle callbacks');

 let state='ready',attached=false,losses=0,restores=0,failures=0;
 let lastError=null,lostSince=null;
 const history=[];
 function record(type,detail){
  const event={type,at:new Date(now()).toISOString()};
  if(detail)event.detail=String(detail).slice(0,240);
  history.push(event);
  if(history.length>historyLimit)history.shift();
 }
 function recordFailure(error){
  failures++;
  lastError=String(error?.message||error).slice(0,240);
  record('render-error',lastError);
  if(state==='recovering')state='failed';
 }
 function contextLost(event){
  // Calling preventDefault is required by WebGL to allow restoration.
  event?.preventDefault?.();
  if(state==='lost')return;
  losses++;state='lost';lostSince=now();
  record('context-lost');
  try{onLost();}catch(error){recordFailure(error);}
 }
 function contextRestored(){
  if(state!=='lost')return;
  restores++;state='recovering';lostSince=null;
  record('context-restored');
  try{onRestored();}catch(error){
   recordFailure(error);
  }
 }
 function rendered(){
  if(state!=='recovering')return false;
  state='ready';record('frame-recovered');
  return true;
 }
 function attach(){
  if(attached)return false;
  canvas.addEventListener('webglcontextlost',contextLost,false);
  canvas.addEventListener('webglcontextrestored',contextRestored,false);
  attached=true;return true;
 }
 function detach(){
  if(!attached)return false;
  canvas.removeEventListener('webglcontextlost',contextLost,false);
  canvas.removeEventListener('webglcontextrestored',contextRestored,false);
  attached=false;return true;
 }
 function snapshot(){
  return {
   status:state,losses,restores,renderFailures:failures,
   lastError,lossDurationMs:state==='lost'&&lostSince!==null?
    Math.max(0,now()-lostSince):null,
   history:history.map(event=>({...event}))
  };
 }
 return Object.freeze({
  attach,detach,rendered,recordFailure,snapshot,
  get canRender(){return state==='ready'||state==='recovering';},
  get status(){return state;}
 });
}



/* One renderer-owned resource registry: every canvas, GPU texture and scene plane.
 * Resource order, material parameters, render order and shaders are preserved.
 */
function createVisualScene({document,window,screen,fatal,onControlsFallback=()=>{}}){
const input=document.createElement('canvas'),baseContext=input.getContext('2d',{alpha:false});
const boardCanvas=document.createElement('canvas');
const boardContext=boardCanvas.getContext('2d',{alpha:false});
// A tiny board-local luminance stencil, not another scene plane or image pass.
const pieceBloomMaskCanvas=document.createElement('canvas');
pieceBloomMaskCanvas.width=1;pieceBloomMaskCanvas.height=1;
const pieceBloomMaskContext=pieceBloomMaskCanvas.getContext('2d',{alpha:false});
const sidebarCanvas=document.createElement('canvas');
const sidebarContext=sidebarCanvas.getContext('2d',{alpha:false});
const controlsCanvas=document.createElement('canvas');
const controlsContext=controlsCanvas.getContext('2d',{alpha:false});
// The tiny operation log is independent of the deck's six control buttons.
// It shares their grayscale source and all downstream CRT postprocessing.
const terminalCanvas=document.createElement('canvas');
const terminalContext=terminalCanvas.getContext('2d',{alpha:false});
const g=baseContext; // Validate the initial Canvas2D drawing target.
const modalCanvas=document.createElement('canvas'),modalContext=modalCanvas.getContext('2d',{alpha:true});
const pickerCanvas=document.createElement('canvas'),pickerContext=pickerCanvas.getContext('2d',{alpha:true});
pickerCanvas.width=pickerCanvas.height=1;
// Sharp board popup UI is a separate grayscale layer composed after GPU blur.
const boardPopupCanvas=document.createElement('canvas');
const boardPopupContext=boardPopupCanvas.getContext('2d',{alpha:true});
if(!g||!boardContext||!pieceBloomMaskContext||!sidebarContext||!controlsContext||!terminalContext||!modalContext||!pickerContext||!boardPopupContext){fatal.hidden=false;fatal.textContent='Canvas2D missing';throw Error('Canvas2D missing');}
const texture=new THREE.CanvasTexture(input);
texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
const boardTexture=new THREE.CanvasTexture(boardCanvas);
boardTexture.colorSpace=THREE.SRGBColorSpace;
boardTexture.minFilter=THREE.LinearFilter;boardTexture.magFilter=THREE.LinearFilter;
boardTexture.generateMipmaps=false;
const pieceBloomMaskTexture=new THREE.CanvasTexture(pieceBloomMaskCanvas);
pieceBloomMaskTexture.minFilter=THREE.LinearFilter;
pieceBloomMaskTexture.magFilter=THREE.LinearFilter;
pieceBloomMaskTexture.generateMipmaps=false;
const sidebarTexture=new THREE.CanvasTexture(sidebarCanvas);
const controlsTexture=new THREE.CanvasTexture(controlsCanvas);
const terminalTexture=new THREE.CanvasTexture(terminalCanvas);
for(const t of [sidebarTexture,controlsTexture,terminalTexture]){
 t.colorSpace=THREE.SRGBColorSpace;
 t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;
 t.generateMipmaps=false;
}
const boardPopupTexture=new THREE.CanvasTexture(boardPopupCanvas);
boardPopupTexture.colorSpace=THREE.SRGBColorSpace;boardPopupTexture.minFilter=THREE.LinearFilter;
boardPopupTexture.magFilter=THREE.LinearFilter;boardPopupTexture.generateMipmaps=false;
// All scene meshes are fullscreen textured planes; MSAA cannot smooth a
// geometry silhouette that doesn't exist. Avoid an unused AA backbuffer.
const renderer=new THREE.WebGLRenderer({canvas:screen,antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
// The composer invokes WebGLRenderer.render repeatedly. Preserve draw-call
// counters across passes, resetting them once per completed game image.
renderer.info.autoReset=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x080808);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
const surface=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
surface.frustumCulled=false;scene.add(surface);
// Cropped board overlays the unchanged full-screen interface before CRT FX.
const boardPlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({map:boardTexture,side:THREE.DoubleSide,
  depthTest:false,depthWrite:false}));
boardPlane.frustumCulled=false;boardPlane.renderOrder=.5;boardPlane.position.z=.01;
scene.add(boardPlane);
// Sidebar and deck are cropped opaque UI layers. Both are composited before
// bloom/phosphor/CRT effects; the full-screen base remains unchanged.
function makeUILayer(texture,order,z){
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
  new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,
   depthTest:false,depthWrite:false}));
 plane.frustumCulled=false;plane.renderOrder=order;plane.position.z=z;
 scene.add(plane);return plane;
}
const sidebarPlane=makeUILayer(sidebarTexture,.6,.011);
const controlsPlane=makeUILayer(controlsTexture,.7,.012);
// Reuse the same control-plane draw call: a GPU shader remaps only the
// button-face/ink luminance. The uploaded CanvasTexture stays at baseline.
// Some WebGL1 implementations expose fewer than 32 fragment uniform
// vectors. Keep the original supported Canvas2D material on those devices.
const controlsFallbackMaterial=controlsPlane.material;
// Explicit comparison switch for visual regression checks, without changing
// any saved settings or the normal GPU rendering mode.
const forceCanvasButtons=new URLSearchParams(window.location.search)
 .get('buttonRenderer')==='canvas';
const controlLighting=!forceCanvasButtons&&renderer.capabilities.maxFragmentUniforms>=32?
 createGpuButtonLighting({THREE,texture:controlsTexture}):null;
let controlsGpuEnabled=Boolean(controlLighting);
if(controlsGpuEnabled)controlsPlane.material=controlLighting.material;
function disableGpuControls(){
 if(!controlsGpuEnabled)return;
 controlsGpuEnabled=false;
 controlsPlane.material=controlsFallbackMaterial;
 onControlsFallback();
}
// Same CRT scene and pass order, with one additional tiny opaque HUD crop.
const terminalPlane=makeUILayer(terminalTexture,.8,.013);
// Three.js composes stationary gameplay, a translucent modal scrim, and a
// smaller transparent modal texture into ONE framebuffer before CRT shaders.
// Dragging a menu no longer repaints or reuploads the fullscreen game texture.
const scrimPlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.77,
  depthTest:false,depthWrite:false}));
scrimPlane.frustumCulled=false;scrimPlane.renderOrder=1;scrimPlane.position.z=.02;
scrimPlane.visible=false;scene.add(scrimPlane);
const modalTexture=new THREE.CanvasTexture(modalCanvas);
const pickerTexture=new THREE.CanvasTexture(pickerCanvas);
for(const texture of [modalTexture,pickerTexture]){
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.generateMipmaps=false;
}
const modalPlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({map:modalTexture,transparent:true,depthTest:false,
  depthWrite:false}));
// The transparent modal texture spans the entire screen. Keeping its image
// dimensions stable across dialog types prevents stale cropped texture data.
modalPlane.frustumCulled=false;modalPlane.renderOrder=2;modalPlane.position.z=.03;
modalPlane.visible=false;scene.add(modalPlane);


 const canvases=Object.freeze([input,boardCanvas,pieceBloomMaskCanvas,sidebarCanvas,controlsCanvas,
  terminalCanvas,modalCanvas,boardPopupCanvas,pickerCanvas]);
 const textures=Object.freeze([texture,boardTexture,pieceBloomMaskTexture,sidebarTexture,controlsTexture,
  terminalTexture,modalTexture,boardPopupTexture,pickerTexture]);
 return Object.freeze({
  input,baseContext,boardCanvas,boardContext,pieceBloomMaskCanvas,pieceBloomMaskContext,sidebarCanvas,sidebarContext,controlsCanvas,controlsContext,terminalCanvas,terminalContext,modalCanvas,modalContext,pickerCanvas,pickerContext,boardPopupCanvas,boardPopupContext,texture,boardTexture,pieceBloomMaskTexture,sidebarTexture,controlsTexture,terminalTexture,boardPopupTexture,renderer,scene,camera,surface,boardPlane,sidebarPlane,controlsPlane,controlsFallbackMaterial,controlLighting,terminalPlane,scrimPlane,modalTexture,pickerTexture,modalPlane,disableGpuControls,
  get controlsGpuEnabled(){return controlsGpuEnabled;},
  canvases,textures
 });
}

return Object.freeze({createGraphicsCleanup,createGraphicsHealth,createVisualScene,estimateCanvasSourceBytes});
})();
export const {createGraphicsCleanup,createGraphicsHealth,createVisualScene,estimateCanvasSourceBytes}=RenderResourceLifecycle;

export default Layout;
