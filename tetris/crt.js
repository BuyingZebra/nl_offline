/* CRT passes, button lighting and render invalidation. */
import * as THREE from './vendor/three/three.bundle.js';
import {instrumentCompositorPasses} from './diagnostics.js?v180';

const {Pass,FullScreenQuad,EffectComposer,RenderPass,UnrealBloomPass,ShaderPass,OutputPass}=THREE;

/* NOMAD V104 — whole-display phosphor envelope.
 * No raster beam or refresh coupling. Rise is fast; falling light follows a
 * continuously adjustable exponential time constant. GPU uses the same model.
 * This is a neutral luminance approximation, not calibrated tube physics.
 */
export const PHOSPHOR_BOUNDS=Object.freeze({
 minPersistenceMs:10,maxPersistenceMs:120,
 stepPersistenceMs:10,defaultPersistenceMs:120,
 riseMs:12
});
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
export function normalizePersistenceMs(value){
 const n=Number(value);
 return Number.isFinite(n)?
  clamp(Math.round(n/PHOSPHOR_BOUNDS.stepPersistenceMs)*
   PHOSPHOR_BOUNDS.stepPersistenceMs,
   PHOSPHOR_BOUNDS.minPersistenceMs,PHOSPHOR_BOUNDS.maxPersistenceMs):
  PHOSPHOR_BOUNDS.defaultPersistenceMs;
}
// Fast excitation plus a slower fall after the incoming video loses light.
// No artificial reset is needed for a menu, pause, or gameplay transition.
export function integratePhosphorResponse(
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

/* Tetris System V051 — independent GPU compositor.
 * The exact V050 pass order and GLSL are intentionally preserved.
 * Source canvases belong to the caller; internal CRT textures belong here.
 */

// Fixed V049 optical constants; unchanged by modularization.
const MENU_BLUR_PERCENT=47,BOARD_POPUP_FADE=.87;
const VIGNETTE_FADE_SPREAD=.57,CRT_PATTERN_SCALE=1;
function boardBlurParams(){
 const p=MENU_BLUR_PERCENT/100;
 return {sigma:13*Math.pow(p,1.25),step:1+2*Math.pow(p,6)};
}

export function createCompositor({renderer,scene,camera,boardPopupTexture,onPassTiming=()=>{}}){
 const composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 // Extract bloom from grayscale luminance before colourization.
const glow=new UnrealBloomPass(new THREE.Vector2(1,1),1.5,.42,.55);
glow.threshold=0;
// Avoid degenerate smoothstep(0,0,x) without a visible brightness cutoff.
if(glow.highPassUniforms?.smoothWidth)glow.highPassUniforms.smoothWidth.value=.0001;

 const passVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';

 // A Gaussian is separable: horizontal + vertical convolution gives a
 // genuinely smooth 2D Gaussian, without the widely spaced 7x7 samples that
 // caused tiled duplicates at stronger blur settings. Edge Softness uses
 // the same normalized Gaussian weighting in a single 2D pass.
 const boardGaussianShader=`
   varying vec2 vUv;uniform sampler2D tDiffuse,uPopup;
   uniform vec4 uRect;uniform vec2 uSize,uAxis;
   uniform float uSigma,uStep,uComposite,uFade;
   uniform vec3 uFadeTo;
   void main(){
    vec3 backdrop=texture2D(tDiffuse,vUv).rgb;
    float inside=step(uRect.x,vUv.x)*step(vUv.x,uRect.z)*
                 step(uRect.y,vUv.y)*step(vUv.y,uRect.w);
    if(inside>.5&&uSigma>.01){
     vec3 sum=vec3(0.0);float weights=0.0;
     vec2 texel=uAxis*(uStep/max(vec2(1.0),uSize));
     for(int i=-12;i<=12;i++){
      float offset=float(i);
      float weight=exp(-offset*offset/(2.0*uSigma*uSigma));
      vec2 uv=clamp(vUv+offset*texel,uRect.xy,uRect.zw);
      sum+=texture2D(tDiffuse,uv).rgb*weight;
      weights+=weight;
     }
     backdrop=sum/max(.001,weights);
    }
    if(uComposite>.5){
     if(inside>.5)backdrop=mix(backdrop,uFadeTo,uFade);
     vec4 popup=texture2D(uPopup,vUv);
     backdrop=mix(backdrop,popup.rgb,popup.a);
    }
    gl_FragColor=vec4(backdrop,1.0);
   }`;
 function createBoardGaussianPass(axis,composite){
  return new ShaderPass({
   uniforms:{
    tDiffuse:{value:null},uPopup:{value:boardPopupTexture},
    uRect:{value:new THREE.Vector4(0,0,0,0)},
    uSize:{value:new THREE.Vector2(1,1)},
    uAxis:{value:new THREE.Vector2(axis,1-axis)},
    uSigma:{value:0},uStep:{value:1},
    uComposite:{value:composite?1:0},
    uFade:{value:.87},uFadeTo:{value:new THREE.Color(0x101010)}
   },
   vertexShader:passVertex,fragmentShader:boardGaussianShader
  });
 }
 const boardBlurHorizontal=createBoardGaussianPass(1,false);
 const boardPopupPass=createBoardGaussianPass(0,true);
 // ShaderPass clones input uniforms, including texture objects. Reattach
 // the ORIGINAL live CanvasTexture so every PAUSED/READY/OVER redraw reaches
 // the GPU, rather than displaying an old START GAME snapshot.
 boardPopupPass.uniforms.uPopup.value=boardPopupTexture;
 boardBlurHorizontal.enabled=false;boardPopupPass.enabled=false;
 composer.addPass(boardBlurHorizontal);
 composer.addPass(boardPopupPass);

 // Buttons are drawn into source textures at their current brightness.
 // No postprocessing pass manipulates their geometric bounds.
 // Experimental phosphor time history: grayscale, before optical glow/tint.
 // Disabled when users toggle PHOSPHOR HISTORY off (V096 baseline).
 const persistencePass=createPhosphorPersistencePass();
 composer.addPass(persistencePass);

 // Analog ghost is a displaced image sample, not a duplicate HTML element.
 const ghostPass=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uX:{value:8},uY:{value:0},uStrength:{value:.22},uSize:{value:new THREE.Vector2(1,1)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uX,uY,uStrength;uniform vec2 uSize;
   void main(){
    vec3 currentImage=texture2D(tDiffuse,vUv).rgb;
    vec2 uv2=vUv+vec2(-uX/max(1.0,uSize.x),uY/max(1.0,uSize.y));
    float mask=step(0.0,uv2.x)*step(uv2.x,1.0)*step(0.0,uv2.y)*step(uv2.y,1.0);
    vec3 echo=texture2D(tDiffuse,clamp(uv2,vec2(0.0),vec2(1.0))).rgb;
    gl_FragColor=vec4(clamp(currentImage+echo*uStrength*mask,0.0,1.0),1.0);
   }`
 });
 ghostPass.enabled=false;
 composer.addPass(ghostPass);

 const tint=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uEnabled:{value:0},uVoltage:{value:1},uTint:{value:new THREE.Vector3(.2,1,.2)}},
  vertexShader:passVertex,
  fragmentShader:'varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uEnabled,uVoltage;uniform vec3 uTint;void main(){vec3 rgb=texture2D(tDiffuse,vUv).rgb*clamp(uVoltage,1.0,1.2);float lum=dot(rgb,vec3(.2126,.7152,.0722));gl_FragColor=vec4(mix(rgb,vec3(lum)*uTint,clamp(uEnabled,0.0,1.0)),1.);}'
 });

 // Lens blur: normalized 7x7 Gaussian convolution, not shifted copies.
 const edgeSoftness=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.65},uRadius:{value:4},uSize:{value:new THREE.Vector2(1,1)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uRadius;uniform vec2 uSize;
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
    vec4 sum=vec4(0.0);float weights=0.0;
    for(int y=-3;y<=3;y++){
     float wy=gaussianWeight(y);
     for(int x=-3;x<=3;x++){
      vec2 offset=vec2(float(x),float(y));
      float weight=gaussianWeight(x)*wy;
      sum+=texture2D(tDiffuse,clamp(vUv+offset*interval*pixel,vec2(0.0),vec2(1.0)))*weight;
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
 function makeScanlineTexture(rows){
  const height=rows.length,width=rows[0].length;
  if(!rows.every(row=>row.length===width))throw Error('Invalid CRT mask tile');
  const tile=document.createElement('canvas');
  tile.width=width;tile.height=height;
  const ctx=tile.getContext('2d',{alpha:false});
  if(!ctx)throw Error('CRT mask texture canvas missing');
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
  texture.magFilter=THREE.NearestFilter;
  texture.minFilter=THREE.NearestFilter;
  texture.generateMipmaps=false;
  return texture;
 }
 const scanlineTextures=Object.fromEntries(
  SCANLINE_PRESETS.map(p=>[p.id,makeScanlineTexture(p.rows)])
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
  'Scene + uploads','Board blur H','Board popup','Phosphor history','Ghost','Bloom',
  'Phosphor','Edge softness','Vignette','CRT mask','Boot roll','Output'
 ],onPassTiming);
 // Restore the original fixed green and amber phosphor ratios;
 // the blue experiment is removed without changing luminance or bloom.
 const hues={green:new THREE.Vector3(.2,1,.2),
  amber:new THREE.Vector3(185/255,79/255,9/255)};
 let persistenceWasEnabled=false;
 // Immutable popup blur parameters and pass references need no per-frame allocation.
 const popupBlur=boardBlurParams();
 const popupPasses=[boardBlurHorizontal,boardPopupPass];
function syncFX({fx,theme,width:W,height:H,dpr:DPR,boardStatus,modalOpen,scoresOverlay=false,popupStatus,layoutInfo,phosphorStrength=1,voltage=1,glitch=0,signalTime=0,contentLuminance=1}){
 const historyEnabled=fx.persistence===true;
 if(historyEnabled!==persistenceWasEnabled)persistencePass.reset();
 persistenceWasEnabled=historyEnabled;
 persistencePass.enabled=historyEnabled;
 persistencePass.configure(fx.persistenceMs);
 ghostPass.enabled=fx.ghost;
 ghostPass.uniforms.uX.value=fx.ghostX;
 ghostPass.uniforms.uY.value=fx.ghostY;
 ghostPass.uniforms.uStrength.value=fx.ghostStrength/100;
 // Colour strength is bounded to the selected fixed phosphor tint.
 tint.uniforms.uEnabled.value=fx.phosphor?clamp(phosphorStrength,0,1):0;
 // The instant startup voltage spike changes luminance only, never hue.
 tint.uniforms.uVoltage.value=clamp(voltage,1,1.2);
 // Identical artistic hue whether history is on or off; decay is neutral.
 tint.uniforms.uTint.value.copy(hues[theme]||hues.green);
 bootRoll.uniforms.uGlitch.value=clamp(glitch,0,1);
 bootRoll.uniforms.uTime.value=Math.max(0,Number(signalTime)||0)/1000;
 const faded=clamp(Number(contentLuminance),0,1);
 bootRoll.uniforms.uContentLuminance.value=faded;
 bootRoll.enabled=(bootRoll.uniforms.uOffset.value>0.00001&&
  bootRoll.uniforms.uOffset.value<.99999)||bootRoll.uniforms.uGlitch.value>0.00001||faded<1;
 glow.enabled=fx.bloom;
 glow.strength=fx.bloomStrength;
 edgeSoftness.enabled=fx.softness;
 edgeSoftness.uniforms.uAmount.value=fx.softnessStrength;
 edgeSoftness.uniforms.uRadius.value=fx.softnessRadius;
 const boardOverlayActive=boardStatus!=='playing'&&(!modalOpen||scoresOverlay)&&
  popupStatus===boardStatus;
 boardBlurHorizontal.enabled=boardOverlayActive;
 boardPopupPass.enabled=boardOverlayActive;
 for(const pass of popupPasses){
  pass.uniforms.uSigma.value=popupBlur.sigma;
  pass.uniforms.uStep.value=popupBlur.step;
 }
 boardPopupPass.uniforms.uFade.value=BOARD_POPUP_FADE;
 // Keep the live CanvasTexture bound through all update paths.
 boardPopupPass.uniforms.uPopup.value=boardPopupTexture;
 if(layoutInfo){
  const r=layoutInfo,x=r.boardX+2,y=r.boardY+2,w=Math.max(0,r.boardW-4),h=Math.max(0,r.boardH-4);
  for(const pass of popupPasses){
   pass.uniforms.uRect.value.set(x/W,1-(y+h)/H,(x+w)/W,1-y/H);
  }
 }
 edgeVignette.enabled=fx.vignette;
 edgeVignette.uniforms.uAmount.value=fx.vignetteAmount;
 edgeVignette.uniforms.uStart.value=VIGNETTE_FADE_SPREAD;
 // Static CRT scanline artwork is independent of phosphor persistence.
 // A user-enabled mask must remain visible whether history is on or off.
 scanlineOverlay.enabled=fx.scanlines&&fx.scanlineOpacity>0;
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
  boardBlurHorizontal.uniforms.uSize.value.set(W,H);
  boardPopupPass.uniforms.uSize.value.set(W,H);
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
export const MAX_BUTTON_FLASHES=8;
export const BUTTON_BASE_LEVEL=206;
export const BUTTON_PEAK_LEVEL=255;
export const BUTTON_FLASH_PEAK_MS=90;
export const MIN_PRESS_FRAME_MS=34;
export const BUTTON_AFTERGLOW_MS=410;
export const BUTTON_FLASH_TOTAL_MS=BUTTON_FLASH_PEAK_MS+BUTTON_AFTERGLOW_MS;
export const buttonLevel=power=>Math.round(BUTTON_BASE_LEVEL+
 (BUTTON_PEAK_LEVEL-BUTTON_BASE_LEVEL)*Math.max(0,Math.min(1,Number(power)||0)));
export const buttonInkLevel=power=>Math.round(6+24*Math.max(0,Math.min(1,Number(power)||0)));
export function createButtonFeedback({capacity=MAX_BUTTON_FLASHES}={}){
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
  if(!Number.isFinite(now))return [];
  for(let i=hits.length-1;i>=0;i--){
   const a=hits[i];
   if(a.releasedAt!==null&&physicalPersistence&&
    now>=Math.max(a.releasedAt,a.pressedAt+MIN_PRESS_FRAME_MS)){
    hits.splice(i,1);continue;
   }
   if(a.releasedAt!==null&&now-a.releasedAt>=BUTTON_AFTERGLOW_MS)hits.splice(i,1);
  }
  return hits.map(a=>{
   const age=a.releasedAt===null?0:Math.max(0,now-a.releasedAt);
   const fade=physicalPersistence?1:Math.max(0,1-age/BUTTON_AFTERGLOW_MS);
   return Object.freeze({x:a.x,y:a.y,w:a.w,h:a.h,power:fade*fade});
  });
 }
 function clear(){const had=hits.length>0;hits.length=0;return had;}
 return Object.freeze({press,release,sample,clear,get count(){return hits.length;}});
}

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

export const GPU_BUTTON_CAPACITY=8;
export const GPU_BUTTON_SOURCE_LEVELS=Object.freeze({
 solidFace:206,solidInk:6,outlineFace:8,outlineInk:206
});

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

/* NOMAD V166 — isolate button source invalidation by visible HUD layer.
 * The fullscreen base canvas includes the header and the board-status popup.
 * Its duplicated deck artwork is hidden by the opaque cropped controls layer.
 * Game-deck button excitation therefore needs ONLY that cropped texture.
 * Both prior and current silhouettes are considered so the last afterglow
 * frame is always cleared when a released button disappears.
 * Pure CSS-pixel geometry; no Canvas2D, WebGL, or gameplay dependency.
 */
export function buttonFeedbackLayers(previous=[],current=[],layout=null){
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
export function croppedBounds(boxes,width,height,dpr=1,pad=2){
 const scale=Math.max(1,dpr||1);
 const valid=boxes.filter(b=>b&&b.w>0&&b.h>0);
 if(!valid.length)return {x:0,y:0,w:1/scale,h:1/scale};
 const x=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.x))-pad)*scale)/scale);
 const y=Math.max(0,Math.floor((Math.min(...valid.map(b=>b.y))-pad)*scale)/scale);
 const right=Math.min(width,Math.ceil((Math.max(...valid.map(b=>b.x+b.w))+pad)*scale)/scale);
 const bottom=Math.min(height,Math.ceil((Math.max(...valid.map(b=>b.y+b.h))+pad)*scale)/scale);
 return {x,y,w:Math.max(1/scale,right-x),h:Math.max(1/scale,bottom-y)};
}
export function sidebarBounds(r,width,height,dpr){
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
export function controlsBounds(r,width,height,dpr){
 // V168: buttons own only the deck. The operation log has its own
 // independently invalidated, much smaller opaque CanvasTexture.
 return croppedBounds([{x:r.dx,y:r.dy,w:r.dw,h:r.dh}],width,height,dpr);
}
export function drawCroppedCanvas({canvas,context,plane,texture,bounds,dpr,width,height,draw}){
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
export function createRenderInvalidation(initial=['base','board','sidebar','controls','terminal']){
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
export function captureGameVisualState(game){
 const p=game.current;
 return {piece:p,x:p?.x,y:p?.y,rotation:p?.rotation,kind:p?.kind,
  pieces:game.pieces,lines:game.lines,score:game.score,level:game.level,
  hold:game.hold,status:game.status};
}
export function gameVisualStateChanged(before,game){
 const p=game.current;
 return before.piece!==p||before.x!==p?.x||before.y!==p?.y||
  before.rotation!==p?.rotation||before.kind!==p?.kind||
  before.pieces!==game.pieces||before.lines!==game.lines||
  before.score!==game.score||before.level!==game.level||
  before.hold!==game.hold||before.status!==game.status;
}
export function flashPhase(elapsed,interval=72){
 return Math.floor(elapsed/interval)%2;
}
