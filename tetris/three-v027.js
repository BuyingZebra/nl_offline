/* FIELD ATLAS / TETRIS — V027 screen rebuilt in Canvas2D + THREE.JS.
 * Source remains grayscale; whole-screen GPU processes gameplay, panels and menus.
 * Engine and scores are the unchanged V027 modules, shared with live Tetris.
 */
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const Core=window.FieldAtlasBlocks,Scores=window.FieldAtlasScores;
const screen=document.getElementById('screen'),display=document.getElementById('display');
const safeProbe=document.getElementById('safeArea'),initialsInput=document.getElementById('initials');
const fatal=document.getElementById('error');
if(!Core?.Game||!Scores){fatal.hidden=false;fatal.textContent='Tetris core missing';throw Error('Tetris core missing');}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v)),fmt=(n,k=6)=>String(Math.max(0,Math.floor(n))).padStart(k,'0');
const gray=n=>{const v=clamp(Math.round(n),0,255);return 'rgb('+v+','+v+','+v+')'};
// Default/unfilled button faces share the exact near-black background value.
// Lift panels by 3 percentage points of the 0–255 grayscale scale (21 -> 29).
const SCREEN_BLACK='#080808';
const C={bg:SCREEN_BLACK,panel:'#1d1d1d',button:SCREEN_BLACK,solid:'#303030',ink:'#e3e3e3',
 bright:'#cecece',weak:'#aeaeae',border:'#6a6a6a',grid:'#292929',dark:'#060606'};
const FONT='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
// Persist only user-facing settings; interface treatment is fixed design.
const DEFAULT=Object.freeze({phosphor:true,bloom:true,bloomStrength:.30,
 ghost:true,ghostX:2,ghostY:0,ghostStrength:22,
 scanlines:true,scanlinePreset:'original',scanlineOpacity:20,
 softness:true,softnessStrength:.64,softnessRadius:3,
 vignette:true,vignetteAmount:.39});
const MENU_BLUR_PERCENT=47,BOARD_POPUP_FADE=.87;
const VIGNETTE_FADE_SPREAD=.57,CRT_PATTERN_SCALE=1;
const BLOOM_LUMINANCE_THRESHOLD=0;
const THREE_BUILD_VERSION='045'; // Increment per approved layout/render test.
// Use one spacing unit for adjacent containers and buttons inside panels.
// Vertically centered header buttons and flexible sidebar space preserve V027.
const UI_GAP=6;
// Font sizes remain 14px for standard buttons and 16px for primary actions;
// all button icons remain 18px. Every label uses the same 0.13em tracking.
const LETTER_SPACING_EM=.13; // Global 13%-of-font-size tracking; no exceptions.
const BUTTON_FONT_SIZE=14,MAIN_ACTION_FONT_SIZE=16;
const BUTTON_ICON_FONT_SIZE=18;
const MAIN_ACTION_LABELS=new Set(['START GAME','RESUME','PLAY AGAIN']);
const BUTTON_ICON_LABELS=new Set(['◀','▶','↻','◐','☷']);
const UI_SPACE=Object.freeze({
 unit:UI_GAP,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,padX:11,stackGap:UI_GAP,side:93,sideGap:UI_GAP,
 headHeight:80,headIcons:46,headIconGap:UI_GAP,headRightPad:UI_GAP,
 headTitleInset:17,
 deckBottom:30,deckPad:UI_GAP,scoreHeight:45,deckGap:UI_GAP,
 padGap:UI_GAP,padHeight:53,extrasHeight:44,extrasGap:UI_GAP,
 holdHeight:88,nextHeight:162,statsHeight:92
});
const PREF='fieldAtlasThreeV027FX01';
const load=(key,fallback)=>{try{return localStorage.getItem(key)??fallback}catch(e){return fallback}};
const store=(key,value)=>{try{localStorage.setItem(key,String(value))}catch(e){}};
let FX={...DEFAULT};
try{const s=JSON.parse(load(PREF,'null'));if(s&&typeof s==='object')for(const [k,v] of Object.entries(DEFAULT))if(typeof s[k]===typeof v)FX[k]=s[k];}catch(e){}
// Older saved bloom values may exceed the new slider upper bound.
FX.bloomStrength=clamp(Number(FX.bloomStrength)||0,0,1);
const persist=()=>store(PREF,JSON.stringify(FX));
const game=new Core.Game();
let highs=Scores.read(window.localStorage),overOffered=false;
let showGhost=load('fieldAtlasTetrisGhost','yes')!=='no';
let soundOn=load('fieldAtlasTetrisSound','yes')!=='no';
let theme=load('fieldAtlasThemeV06','green')==='amber'?'amber':'green';
let W=1,H=1,DPR=1,regions=[],layoutInfo=null,modal=null,modalView=null;
let optionsScroll=0,optionsMaxScroll=0,pressed=null,repeatDelay=null,repeatInterval=null;
let scrollVelocity=0; // logical pixels per millisecond, decays during GPU frames
let dirty=true,baseDirty=true,queued=false,lastTime=performance.now(),audioCtx=null;
let baseRegions=[]; // Cached layout hitboxes when menus cover the board.
// Snapshot a just-completed board before Core removes its rows, then flash it.
const LINE_FLASH_MS=430,LINE_FLASH_TOGGLE_MS=72;
let lineClearFX=null,lastPaintedBoardPopupStatus=null;
const input=document.createElement('canvas'),baseContext=input.getContext('2d',{alpha:false});
let g=baseContext; // UI drawing target: stationary gameplay or small modal canvas.
const modalCanvas=document.createElement('canvas'),modalContext=modalCanvas.getContext('2d',{alpha:true});
// Sharp board popup UI is a separate grayscale layer composed after GPU blur.
const boardPopupCanvas=document.createElement('canvas');
const boardPopupContext=boardPopupCanvas.getContext('2d',{alpha:true});
if(!g||!modalContext||!boardPopupContext){fatal.hidden=false;fatal.textContent='Canvas2D missing';throw Error('Canvas2D missing');}
const texture=new THREE.CanvasTexture(input);
texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
const boardPopupTexture=new THREE.CanvasTexture(boardPopupCanvas);
boardPopupTexture.colorSpace=THREE.SRGBColorSpace;boardPopupTexture.minFilter=THREE.LinearFilter;
boardPopupTexture.magFilter=THREE.LinearFilter;boardPopupTexture.generateMipmaps=false;
const renderer=new THREE.WebGLRenderer({canvas:screen,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x080808);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
const surface=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
surface.frustumCulled=false;scene.add(surface);
// Three.js composes stationary gameplay, a translucent modal scrim, and a
// smaller transparent modal texture into ONE framebuffer before CRT shaders.
// Dragging a menu no longer repaints or reuploads the fullscreen game texture.
const scrimPlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.77,
  depthTest:false,depthWrite:false}));
scrimPlane.frustumCulled=false;scrimPlane.renderOrder=1;scrimPlane.position.z=.02;
scrimPlane.visible=false;scene.add(scrimPlane);
const modalTexture=new THREE.CanvasTexture(modalCanvas);
modalTexture.colorSpace=THREE.SRGBColorSpace;
modalTexture.minFilter=THREE.LinearFilter;modalTexture.magFilter=THREE.LinearFilter;
modalTexture.generateMipmaps=false;
const modalPlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),
 new THREE.MeshBasicMaterial({map:modalTexture,transparent:true,depthTest:false,
  depthWrite:false}));
// The transparent modal texture spans the entire screen. Keeping its image
// dimensions stable across dialog types prevents stale cropped texture data.
modalPlane.frustumCulled=false;modalPlane.renderOrder=2;modalPlane.position.z=.03;
modalPlane.visible=false;scene.add(modalPlane);

 const composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 // Extract bloom from grayscale luminance before colourization.
const glow=new UnrealBloomPass(new THREE.Vector2(1,1),1.5,.42,.55);
glow.threshold=BLOOM_LUMINANCE_THRESHOLD;
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
  uniforms:{tDiffuse:{value:null},uEnabled:{value:0},uTint:{value:new THREE.Vector3(.2,1,.2)}},
  vertexShader:passVertex,
  fragmentShader:'varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uEnabled;uniform vec3 uTint;void main(){vec3 rgb=texture2D(tDiffuse,vUv).rgb;float lum=dot(rgb,vec3(.2126,.7152,.0722));gl_FragColor=vec4(mix(rgb,vec3(lum)*uTint,uEnabled),1.);}'
 });

 // Lens blur: normalized 7x7 Gaussian convolution, not shifted copies.
 const edgeSoftness=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uAmount:{value:.65},uRadius:{value:4},uSize:{value:new THREE.Vector2(1,1)}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;
   uniform float uAmount,uRadius;uniform vec2 uSize;
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
     for(int x=-3;x<=3;x++){
      vec2 offset=vec2(float(x),float(y));
      float weight=exp(-dot(offset,offset)/(2.0*1.25*1.25));
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
 function activeScanlinePreset(){
  return SCANLINE_PRESETS.find(p=>p.id===FX.scanlinePreset)||SCANLINE_PRESETS[0];
 }
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
 composer.addPass(new OutputPass());


// Green phosphor is unchanged. Amber is display-compensated to reproduce the
// darker Pip-Boy orange-gold mockup (#D69334 in bright rendered UI regions).
// These are GPU tint multipliers of grayscale luminance, not UI source colours.
const hues={green:new THREE.Vector3(.2,1,.2),amber:new THREE.Vector3(185/255,79/255,9/255)};
const brightness={I:.99,J:.8,L:.92,O:.94,S:.76,T:.85,Z:.73};
// Pause/ready/game-over overlay is a fixed 47% blur and 87% fade.
function boardBlurParams(){
 const p=MENU_BLUR_PERCENT/100;
 return {sigma:13*Math.pow(p,1.25),step:1+2*Math.pow(p,6)};
}
function tone(freq=240,len=.04){
 if(!soundOn)return;
 try{const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;if(!audioCtx)audioCtx=new AC();
  if(audioCtx.state==='suspended')void audioCtx.resume();
  const osc=audioCtx.createOscillator(),vol=audioCtx.createGain();
  osc.type='square';osc.frequency.value=freq;
  vol.gain.setValueAtTime(.014,audioCtx.currentTime);
  vol.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+len);
  osc.connect(vol).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+len);
 }catch(e){}
}
function invalidate(){dirty=true;requestFrame();}
// Core synchronously removes rows on lock; this renderer-only observer
// captures the exact filled squares before deletion for the short animation.
const coreLockPiece=game.lockPiece.bind(game);
game.lockPiece=function(){
 const beforeLines=game.lines;
 const snapshot=game.board.map(row=>row.slice());
 const p=game.current;
 if(p){
  p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{
   const x=p.x+rx,y=p.y+ry;
   if(kind&&x>=0&&x<Core.COLS&&y>=0&&y<Core.ROWS)snapshot[y][x]=kind;
  }));
 }
 coreLockPiece();
 if(game.lines>beforeLines&&game.status==='playing'){
  const rows=[];
  snapshot.forEach((row,y)=>{if(row.every(Boolean))rows.push(y);});
  if(rows.length){
   lineClearFX={board:snapshot,rows:new Set(rows),elapsed:0};
   baseDirty=true;invalidate();
  }
 }
};
function openModal(name){
 modal=name;modalView=null;optionsScroll=0;scrollVelocity=0;scanlineMenuOpen=false;stopRepeat();pressed=null;
 if(!modal)regions=baseRegions.slice();
 invalidate();
}
function onOver(){
 if(game.status!=='over'||overOffered)return;
 overOffered=true;
 if(Scores.qualifies(highs,game.score)){
  initialsInput.value=load('fieldAtlasTetrisInitials','AAA');
  openModal('entry');
 }
}
function perform(type){
 // Allow pause during the line-clear animation; block gameplay moves.
 if(lineClearFX&&game.status==='playing'&&['left','right','cw','hard','hold'].includes(type))return false;
 const was=game.status,pieces=game.pieces,lines=game.lines;
 let ok=false;
 if(type==='left')ok=game.move(-1);
 else if(type==='right')ok=game.move(1);
 else if(type==='cw')ok=game.rotate(1);
 else if(type==='hard')ok=game.hardDrop();
 else if(type==='hold')ok=game.holdPiece();
 else if(type==='pause')ok=game.pause();
 else if(type==='start')ok=game.start();
 if(ok){
  baseDirty=true;
  if(was==='over'&&game.status==='playing')overOffered=false;
  if(game.lines>lines)tone(610,.14);
  else if(game.pieces>pieces)tone(175);
  else if(type==='cw')tone(305);
  else if(type==='hard')tone(185);
  else if(type==='hold')tone(265);
  onOver();invalidate();
 }
 return ok;
}
function restart(){
 lineClearFX=null;
 game.reset();game.start();baseDirty=true;overOffered=false;openModal(null);invalidate();
}
function options(){if(game.status==='playing')perform('pause');openModal('options');}
function scores(){if(game.status==='playing')perform('pause');openModal('scores');}
function saveScore(){
 const tag=Scores.initials(initialsInput.value);
 highs=Scores.save(window.localStorage,Scores.add(highs,
  {name:tag,score:game.score,lines:game.lines,level:game.level,at:Date.now()}));
 store('fieldAtlasTetrisInitials',tag);initialsInput.blur();baseDirty=true;openModal('scores');
}
initialsInput.addEventListener('input',()=>{
 initialsInput.value=initialsInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
 invalidate();
});
initialsInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveScore();}});
function panel(x,y,w,h,r=8,fill=C.panel,border=C.border){
 if(w<=0||h<=0)return;
 g.beginPath();g.roundRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1),Math.min(r,w/2,h/2));
 if(fill){g.fillStyle=fill;g.fill();}
 if(border){g.strokeStyle=border;g.lineWidth=1;g.stroke();}
}
// No per-label overrides. Canvas fillText(maxWidth) compresses glyph widths,
// so measure naturally and wrap only text that exceeds a caller's available width.
function wrapText(source,maxWidth){
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
function text(str,x,y,size=12,color=C.ink,align='left',maxWidth=Infinity){
 g.font='700 '+size+'px '+FONT;g.textAlign=align;g.textBaseline='middle';
 g.letterSpacing=(size*LETTER_SPACING_EM).toFixed(3)+'px';
 g.fillStyle=color;
 const lines=wrapText(str,maxWidth),step=size*1.2;
 for(let i=0;i<lines.length;i++)
  g.fillText(lines[i],x,y+(i-(lines.length-1)/2)*step);
 g.letterSpacing='0px';
}
function rect(x,y,w,h,color){g.fillStyle=color;g.fillRect(x,y,w,h);}
function region(x,y,w,h,act,opts={}){regions.push({x,y,w,h,act,...opts});}
function key(label,x,y,w,h,act,{light=false,repeat=false,arrow=false,modalControl=false}={}){
 const size=MAIN_ACTION_LABELS.has(String(label))?MAIN_ACTION_FONT_SIZE:
  BUTTON_ICON_LABELS.has(String(label))?BUTTON_ICON_FONT_SIZE:BUTTON_FONT_SIZE;
 const down=pressed?.action===act&&pressed?.box?.x===x;
 panel(x,y,w,h,8,down?C.solid:(light?C.bright:C.button),light?C.bright:C.border);
 text(label,x+w/2,y+h/2,size,light?C.dark:C.ink,'center',Math.max(10,w-14));
 if(arrow)text('▶',x+17,y+h/2,BUTTON_ICON_FONT_SIZE,light?C.dark:C.ink,'center');
 region(x,y,w,h,act,{repeat,modalControl});
}
// V027 drew miniatures on 120x90 (hold) and 120x75 (queue) canvases,
// displayed as 80x60 and 80x44 CSS pixels. Match their real visual sizes,
// instead of drawing 20px cells directly in CSS pixels.
// Fresh grayscale tile styling for both the board and miniature previews:
// thin bevel rim, darker inset cap, luminous upper edge and lower shadow.
function tileFace(x,y,w,h,kind){
 const side=Math.min(w,h),gap=Math.max(.6,Math.min(1.3,side*.055));
 const level=28+190*(brightness[kind]||.8);
 const xx=x+gap,yy=y+gap,ww=Math.max(1,w-2*gap),hh=Math.max(1,h-2*gap);
 const rim=Math.max(.65,Math.min(1.35,side*.08));
 rect(xx,yy,ww,hh,gray(level-26));
 rect(xx,yy,ww,rim,gray(level+18));
 rect(xx,yy,rim,hh,gray(level+12));
 rect(xx,yy+hh-rim,ww,rim,gray(level-38));
 rect(xx+ww-rim,yy,rim,hh,gray(level-32));
 const inset=Math.min(3.2,Math.max(1.7,side*.145));
 const fx=xx+inset,fy=yy+inset,fw=Math.max(1,ww-2*inset),fh=Math.max(1,hh-2*inset);
 rect(fx,fy,fw,fh,gray(level-10));
 rect(fx,fy,fw,Math.max(.65,Math.min(1.15,side*.055)),gray(level+20));
 rect(fx,fy+fh-Math.max(.65,Math.min(1,side*.045)),fw,
  Math.max(.65,Math.min(1,side*.045)),gray(level-27));
}
function smallPiece(kind,x,y,w,h,role='next'){
 if(!kind)return;
 const m=Core.SHAPES[kind],pts=[];
 for(let row=0;row<m.length;row++)for(let col=0;col<m[row].length;col++)
  if(m[row][col])pts.push([col,row]);
 if(!pts.length)return;
 const loX=Math.min(...pts.map(p=>p[0])),hiX=Math.max(...pts.map(p=>p[0]));
 const loY=Math.min(...pts.map(p=>p[1])),hiY=Math.max(...pts.map(p=>p[1]));
 const cols=hiX-loX+1,rows=hiY-loY+1;
 const sourceH=role==='hold'?90:75;
 const sourceCell=Math.min(21,(120-12)/cols,(sourceH-10)/rows);
 const stepX=sourceCell*w/120,stepY=sourceCell*h/sourceH;
 const sx=x+(w-stepX*cols)/2,sy=y+(h-stepY*rows)/2;
 for(const [col,row] of pts){
  const xx=sx+(col-loX)*stepX,yy=sy+(row-loY)*stepY;
  tileFace(xx,yy,stepX,stepY,kind);
 }
}
function cell(x,y,col,row,size,kind,isGhost=false){
 if(!kind||col<0||row<0||col>=10||row>=20)return;
 const px=x+col*size,py=y+row*size;
 if(isGhost){
  g.setLineDash([3,3]);g.strokeStyle='#777';g.lineWidth=1;
  g.strokeRect(px+3,py+3,size-6,size-6);g.setLineDash([]);return;
 }
 tileFace(px,py,size,size,kind);
}
function stage(r){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 panel(x,y,w,h,7,C.panel);
 const offX=x+2,offY=y+2,tile=(w-4)/10;
 g.save();g.beginPath();g.rect(offX,offY,w-4,h-4);g.clip();
 rect(offX,offY,w-4,h-4,'#101010');
 g.globalAlpha=.42;g.strokeStyle=C.grid;g.lineWidth=.6;g.beginPath();
 for(let c=0;c<=10;c++){g.moveTo(offX+c*tile,offY);g.lineTo(offX+c*tile,offY+20*tile);}
 for(let row=0;row<=20;row++){g.moveTo(offX,offY+row*tile);g.lineTo(offX+10*tile,offY+row*tile);}
 g.stroke();g.globalAlpha=1;
 // Blink freshly completed rows between the detailed tiles and empty
 // outlined cubes before revealing the core's already-cleared board.
 const displayBoard=lineClearFX?.board||game.board;
 const clearIsEmpty=lineClearFX&&Math.floor(lineClearFX.elapsed/LINE_FLASH_TOGGLE_MS)%2===1;
 displayBoard.forEach((row,ry)=>row.forEach((kind,rx)=>{
  if(!kind)return;
  if(clearIsEmpty&&lineClearFX.rows.has(ry)){
   const px=offX+rx*tile,py=offY+ry*tile;
   g.save();g.strokeStyle=C.border;g.globalAlpha=.42;g.lineWidth=.7;
   g.strokeRect(px+2,py+2,tile-4,tile-4);g.restore();
  }else cell(offX,offY,rx,ry,tile,kind);
 }));
 if(!lineClearFX&&game.current&&game.status!=='over'){
  const p=game.current;
  if(showGhost&&(game.status==='playing'||game.status==='paused')){
   const target=game.ghostY();
   p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{if(kind)cell(offX,offY,p.x+rx,target+ry,tile,kind,true);}));
  }
  p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{if(kind)cell(offX,offY,p.x+rx,p.y+ry,tile,kind);}));
 }
 g.restore();
 region(x,y,w,h,'board',{board:true});

}
function paintBoardPopup(r){
 // A freshly rendered status snapshot prevents START GAME from persisting
 // when the engine transitions to PAUSED or GAME OVER.
 const status=game.status;
 lastPaintedBoardPopupStatus=status;
 if(status==='playing')return;
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 g=boardPopupContext;
 try{
  const type=status;
  const title=type==='paused'?'PAUSED':type==='over'?'GAME OVER':'TETRIS';
  const caption=type==='paused'?'RESUME':type==='over'?'PLAY AGAIN':'START GAME';
  // Align every primary button's TOP to the play-board midpoint, not its
  // center. On unusually short screens, keep the pause stack in bounds.
  const inset=UI_SPACE.unit,headingGap=2*UI_SPACE.unit;
  const primaryH=r.extraH,secondaryH=r.overlaySecondaryH;
  const bw=w*UI_SPACE.overlayButtonWidthScale,bx=x+(w-bw)/2;
  const midpoint=y+h/2,clusterH=primaryH+2*secondaryH+2*inset;
  const by=type==='paused'?Math.min(midpoint,y+h-inset-clusterH):midpoint;
  const headingSize=Math.min(21,w*.079);
  // A compact 12px gap (twice the standard 6px panel gap) between title
  // and button. The start-screen tagline retains two such compact gaps.
  if(type==='ready'){
   const subSize=Math.min(10,w*.034);
   const subY=by-headingGap-subSize/2;
   const titleY=subY-subSize/2-headingGap-headingSize/2;
   text(title,x+w/2,titleY,headingSize,C.bright,'center',w-18);
   text('SURVIVE THE SOVIET CHALLENGE',x+w/2,subY,subSize,C.weak,'center',w-18);
  }else{
   const titleY=by-headingGap-headingSize/2;
   text(title,x+w/2,titleY,headingSize,C.bright,'center',w-18);
  }
  // Popup buttons retain their approved 85%-width scale and standard 6px
  // spacing between the RESUME, NEW GAME, and HIGH SCORE actions.
  key(caption,bx,by,bw,primaryH,'start',{light:true,arrow:true});
  if(type==='paused'){
   key('NEW GAME',bx,by+primaryH+inset,bw,secondaryH,'restart');
   key('HIGH SCORE',bx,by+primaryH+secondaryH+2*inset,bw,secondaryH,'scores');
  }
  }finally{g=baseContext;}
}
function insets(){
 const cs=getComputedStyle(safeProbe);
 return {top:parseFloat(cs.paddingTop)||0,bottom:parseFloat(cs.paddingBottom)||0};
}
// Flexbox-equivalent sizing based on V027's layout rules, not magic screen coordinates.
function layout(){
 const safe=insets(),landscape=W>H&&H<=600,ui=UI_SPACE;
 const width=landscape?W:Math.min(W,ui.appMax),off=(W-width)/2,pad=ui.padX,inner=width-2*pad;
 const short=H<=730,compact=H<=620,gap=ui.stackGap;
 const deckPad=ui.deckPad,deckGap=ui.deckGap;
 const buttonH=compact?42:short?45:ui.padHeight;
 // Header phosphor/settings, HOLD and PAUSE share one height token at every
 // breakpoint, including landscape: 46 / 42 / 37 logical CSS pixels.
 const headerButtonH=landscape?37:short?42:ui.headIcons;
 const extraH=headerButtonH;
 // Board-only secondary actions keep their approved independent heights.
 const overlaySecondaryH=compact?39:short?40:ui.extrasHeight;
 const headerH=compact?50:short?58:ui.headHeight;
 // Portrait: header + gap + flex:1 stage + gap + measured deck + bottom safe inset.
 let hy=safe.top+(compact?4:short?9:0),hh=headerH;
 let dh=2*deckPad+ui.scoreHeight+2*deckGap+buttonH+extraH;
 let dy=H-safe.bottom-ui.deckBottom-dh;
 let sy=hy+hh+gap,sh=Math.max(0,dy-gap-sy);
 let hx=off+pad,hw=inner,sx=off+pad,sw=inner,dx=off+pad,dw=inner;
 if(landscape){
  const left=clamp(width*.24,145,205),right=clamp(width*.30,195,260);
  hy=8;hh=64;dy=8;dh=H-16;sy=8;sh=H-16;
  hx=off+8;hw=left;sx=off+left+14;sw=Math.max(0,width-left-right-36);
  dx=off+width-right-8;dw=right;
 }
 const bw=Math.max(0,Math.min(305,sw-ui.side-ui.sideGap,sh/2)),bh=bw*2;
 const bx=sx+Math.max(0,(sw-bw-ui.sideGap-ui.side)/2),by=sy+Math.max(0,(sh-bh)/2);
 // Sidebar is a flex-column constrained to the board, so its three
 // panels cannot overlap on shorter portrait or landscape viewports.
 const sxSide=bx+bw+ui.sideGap,swSide=Math.max(0,Math.min(ui.side,sx+sw-sxSide));
 const holdH=Math.min(short?70:ui.holdHeight,Math.max(40,bh*.33));
 const statsH=Math.min(short?73:ui.statsHeight,Math.max(52,bh*.36));
 const queueH=Math.max(0,Math.min(short?136:ui.nextHeight,bh-holdH-statsH-2*ui.unit));
 const holdPanel={x:sxSide,y:by,w:swSide,h:holdH};
 const nextPanel={x:sxSide,y:by+holdH+ui.unit,w:swSide,h:queueH};
 const statsPanel={x:sxSide,y:by+bh-statsH,w:swSide,h:statsH};
 return {safe,landscape,short,compact,width,off,pad,inner,gap,hy,hh,hx,hw,sy,sh,sx,sw,
  boardX:bx,boardY:by,boardW:bw,boardH:bh,
  sideX:sxSide,sideW:swSide,holdPanel,nextPanel,statsPanel,dx,dy,dw,dh,
  deckPad,deckGap,buttonH,headerButtonH,extraH,overlaySecondaryH,footerY:H-safe.bottom-18};
}
function paintBaseGame(){
 regions=[];const r=layout();layoutInfo=r;
 boardPopupContext.setTransform(1,0,0,1,0,0);
 boardPopupContext.clearRect(0,0,boardPopupCanvas.width,boardPopupCanvas.height);
 boardPopupContext.setTransform(DPR,0,0,DPR,0,0);
 g=baseContext;
 rect(0,0,W,H,C.bg);
 panel(r.hx,r.hy,r.hw,r.hh,12,C.panel);
 const titleSize=r.landscape?13:Math.min(21,Math.max(16,W*.05));
 text('TETRIS SYSTEM',r.hx+UI_SPACE.headTitleInset,
  r.hy+r.hh/2,titleSize,
  C.ink,'left',Math.max(10,r.hw-116));
 const th=r.headerButtonH;
 const tx=r.hx+r.hw-UI_SPACE.headRightPad-th*2-UI_SPACE.headIconGap;
 const ty=r.hy+(r.hh-th)/2;
 key('◐',tx,ty,th,th,'theme');
 key('☷',tx+th+UI_SPACE.headIconGap,ty,th,th,'options');
 stage(r);
 const short=r.short;
 const {holdPanel:hold,nextPanel:next,statsPanel:stats}=r;
 const sx=hold.x,sw=hold.w;
 panel(hold.x,hold.y,hold.w,hold.h,9,C.panel);
 text('HOLD',sx+sw/2,hold.y+13,9,C.weak,'center');
 smallPiece(game.hold,sx+(sw-80)/2,hold.y+23,80,Math.min(short?43:60,Math.max(12,hold.h-26)),'hold');
 panel(next.x,next.y,next.w,next.h,9,C.panel);
 text('NEXT',sx+sw/2,next.y+13,9,C.weak,'center');
 const previewH=Math.min(short?36:44,Math.max(9,(next.h-32)/3));
 for(let i=0;i<3;i++){
  smallPiece(game.queue[i],sx+(sw-80)/2,next.y+26+i*(previewH+1),80,previewH,'next');
 }
 panel(stats.x,stats.y,stats.w,stats.h,9,C.panel);
 text('BEST',sx+sw/2,stats.y+12,9,C.weak,'center');
 text(Math.max(highs[0]?.score||0,game.score),sx+sw/2,stats.y+30,13,C.ink,'center');
 text('PIECES',sx+sw/2,stats.y+52,9,C.weak,'center');
 text(game.pieces,sx+sw/2,stats.y+Math.min(70,stats.h-13),13,C.ink,'center');
 panel(r.dx,r.dy,r.dw,r.dh,12,C.panel);
 const px=r.dx+r.deckPad,pw=r.dw-2*r.deckPad,ly=r.dy+r.deckPad+7;
 const s=Math.max(13,Math.min(17,pw*.046));
 text('LEVEL',px+2,ly,9,C.weak,'left');
 text('SCORE',px+pw/2,ly,9,C.weak,'center');
 text('LINES',px+pw-2,ly,9,C.weak,'right');
 text(fmt(game.level,2),px+2,ly+23,s);
 text(fmt(game.score),px+pw/2,ly+23,s,C.ink,'center');
 text(fmt(game.lines,2),px+pw-2,ly+23,s,C.ink,'right');
 rect(px,r.dy+r.deckPad+UI_SPACE.scoreHeight-1,pw,1,C.border);
 const gap=UI_SPACE.padGap,col=(pw-gap*4)/5;
 const cy=r.dy+r.deckPad+UI_SPACE.scoreHeight+r.deckGap,ch=r.buttonH;
 key('◀',px,cy,col,ch,'left',{light:true,repeat:true});
 key('DROP',px+col+gap,cy,col*2+gap,ch,'hard',{light:true});
 key('▶',px+col*3+gap*3,cy,col,ch,'right',{light:true,repeat:true});
 key('↻',px+col*4+gap*4,cy,col,ch,'cw');
 const ey=cy+ch+r.deckGap,extraGap=UI_SPACE.extrasGap;
 // Shrink each secondary control to 75%, then center their group.
 const ew=(pw-extraGap)/2*UI_SPACE.buttonWidthScale;
 const groupW=ew*2+extraGap,groupX=px+(pw-groupW)/2;
 key('HOLD',groupX,ey,ew,r.extraH,'hold');
 key('PAUSE',groupX+ew+extraGap,ey,ew,r.extraH,'pause');
 text('Program: Three.JS',r.off+11,r.footerY,9,C.weak,'left',r.inner*.63);
 text('Version: '+THREE_BUILD_VERSION,r.off+r.width-11,r.footerY,9,C.weak,'right',r.inner*.34);
 // Re-render the sharp popup from the CURRENT status, registering its hitboxes
 // after all other controls so overlays take input priority.
 paintBoardPopup(r);
 baseRegions=regions.slice();
 texture.needsUpdate=true;
 boardPopupTexture.needsUpdate=true;
}
function paintGame(){
 if(game.status!==lastPaintedBoardPopupStatus)baseDirty=true;
 if(baseDirty){paintBaseGame();baseDirty=false;}
 if(modal)paintModalOverlay();
 else{
  modalPlane.visible=false;scrimPlane.visible=false;
  regions=baseRegions.slice();
 }
 dirty=false;
}

// Single data schema defines every settings category, item and value domain.
// A single declarative schema owns the remaining visible settings.
// A group contains independently configurable effects. Their UI layout is
// derived from the same schema, so a toggle, description and sliders never
// become detached by inserting another setting.
// Canonical Display System rows, with each existing control represented once.
// Sections mark purpose but never collapse; all settings remain accessible.
const DISPLAY_EFFECTS=[
 {id:'phosphor',title:'PHOSPHOR COLOR',toggle:'phosphor',
  description:'Enable phosphor tint. Choose green or amber in the viewport.'},
 {id:'scanlines',title:'CRT SCANLINES',toggle:'scanlines',
  description:'A grayscale CRT pattern across the display.',pattern:true,
  sliders:[['INTENSITY','scanlineOpacity',0,100,1,'%']]},
 {id:'vignette',title:'SCREEN VIGNETTE',toggle:'vignette',
  description:'Darkens the outer edges of the screen.',
  sliders:[['VIGNETTE','vignetteAmount',0,100,1,'%']]},
 {id:'bloom',title:'PHOSPHOR BLOOM',toggle:'bloom',
  description:'Glow follows interface luminance and pixel brightness.',
  sliders:[['BLOOM','bloomStrength',0,100,1,'%']]},
 {id:'ghost',title:'SIGNAL GHOSTING',toggle:'ghost',
  description:'Analog signal echoes and shifted image copies.',
  sliders:[['GHOST X','ghostX',-32,32,1,' px'],
   ['GHOST Y','ghostY',-32,32,1,' px'],
   ['STRENGTH','ghostStrength',0,100,1,'%']]},
 {id:'softness',title:'EDGE SOFTNESS',toggle:'softness',
  description:'Softens displayed detail without changing the source.',
  sliders:[['STRENGTH','softnessStrength',0,100,1,'%'],
   ['RADIUS','softnessRadius',0,10,.5,' px']]},
 {id:'piece',title:'GHOST PIECE',toggle:'pieceGhost',section:'GAMEPLAY',
  description:'Display the projected landing location.'},
 {id:'sound',title:'SOUND',toggle:'sound',
  description:'Enable game audio feedback.'}
];
const SCANLINE_CHOICES=[{id:'off',name:'OFF'},
 ...SCANLINE_PRESETS.map(p=>({id:p.id,name:p.name}))];
const PREVIEW_SIZE=96,SETTINGS_SQUARE_SIZE=20;
let scanlineMenuOpen=false;
function settingValue(k){
 if(k==='pieceGhost')return showGhost;
 if(k==='sound')return soundOn;
 if(['softnessStrength','vignetteAmount','bloomStrength'].includes(k))return Math.round(FX[k]*100);
 return FX[k];
}
function setSetting(k,value){
 if(k==='pieceGhost'){
  showGhost=Boolean(value);store('fieldAtlasTetrisGhost',showGhost?'yes':'no');baseDirty=true;
 }else if(k==='sound'){
  soundOn=Boolean(value);store('fieldAtlasTetrisSound',soundOn?'yes':'no');
 }else{
  FX[k]=['softnessStrength','vignetteAmount','bloomStrength'].includes(k)?
   clamp(value/100,0,1):value;
  persist();
 }
 invalidate();
}
function displayValue(value,step,unit){
 const digits=step<.1?2:step<1?1:0;
 return Number(value).toFixed(digits)+unit;
}
// Menu geometry shares the six-pixel unit and the existing 46/42/37px
// phosphor/settings, HOLD and PAUSE button height.
function modalBounds(name){
 const safe=insets(),pad=UI_SPACE.unit,gap=UI_SPACE.unit;
 const buttonH=layout().headerButtonH;
 const usable=Math.max(0,H-safe.top-safe.bottom);
 const wanted=name==='options'?Math.max(0,usable-2*gap):
  name==='scores'?2*pad+2*buttonH+5*54+5*gap+14:
  name==='restart'?2*pad+2*buttonH+2*gap+40:
  2*pad+4*buttonH+4*gap+18;
 const w=Math.max(0,Math.min(410,W-2*UI_SPACE.padX));
 const h=Math.max(0,Math.min(wanted,usable-2*gap));
 return {w,h,x:(W-w)/2,y:safe.top+(usable-h)/2,pad,gap,buttonH};
}
function modalPanel(title,q){
 regions=[];region(0,0,W,H,'block');
 panel(q.x,q.y,q.w,q.h,13,C.panel,C.border);
 text(title,q.x+q.pad,q.y+q.pad+q.buttonH/2,14,C.bright,'left',q.w-2*q.pad);
}
function modalBodyTop(q){return q.y+q.pad+q.buttonH+q.gap;}
function modalActionRow(q,items){
 const x=q.x+q.pad,y=q.y+q.h-q.pad-q.buttonH;
 const width=q.w-2*q.pad,n=items.length;
 const buttonW=(width-(n-1)*q.gap)/n;
 items.forEach(([label,act,light],i)=>
  key(label,x+i*(buttonW+q.gap),y,buttonW,q.buttonH,act,{light:Boolean(light)}));
 return y;
}
// Each monochrome thumbnail is generated once and then coloured by the
// same phosphor shader as the entire screen. No network assets or new passes.
function effectPreview(id){
 const canvas=document.createElement('canvas');
 canvas.width=PREVIEW_SIZE;canvas.height=PREVIEW_SIZE;
 const p=canvas.getContext('2d');
 if(!p)return canvas;
 p.fillStyle='#080808';p.fillRect(0,0,96,96);
 const radial=(radius,bright,edge)=>{
  const v=p.createRadialGradient(48,48,0,48,48,radius);
  v.addColorStop(0,gray(bright));v.addColorStop(1,gray(edge));
  p.fillStyle=v;p.fillRect(0,0,96,96);
 };
 if(id==='phosphor'){
  for(let y=5;y<92;y+=7)for(let x=5;x<92;x+=7){
   const d=Math.hypot(x-48,y-48)/68;
   p.fillStyle=gray(34+185*Math.pow(Math.max(0,1-d),1.6));
   p.fillRect(x,y,4,4);
  }
 }else if(id==='scanlines'){
  radial(72,138,18);
  for(let y=0;y<96;y+=5){p.fillStyle='#101010';p.fillRect(0,y,96,2);}
  for(let x=12;x<83;x+=19){p.fillStyle='#989898';p.fillRect(x,26,9,8);}
 }else if(id==='vignette'){
  radial(68,206,5);p.fillStyle='#383838';
  p.fillRect(22,36,52,3);p.fillRect(22,50,52,3);
 }else if(id==='bloom'){
  radial(52,212,8);p.fillStyle='#f2f2f2';
  p.fillRect(39,40,18,16);p.fillRect(44,35,8,26);
 }else if(id==='ghost'){
  for(const [ofs,v] of [[9,32],[24,85],[40,177],[55,222]]){
   p.fillStyle=gray(v);p.fillRect(ofs,31,26,26);p.fillRect(ofs+8,22,10,44);
  }
 }else if(id==='softness'){
  radial(43,116,8);p.fillStyle='#777777';p.fillRect(23,20,30,30);
  p.fillStyle='#cccccc';p.fillRect(38,41,32,32);
 }else if(id==='piece'){
  p.fillStyle='#bababa';
  for(const [x,y] of [[20,36],[40,36],[60,36],[40,16]])p.fillRect(x,y,18,18);
 }else if(id==='sound'){
  p.fillStyle='#c6c6c6';
  [16,27,43,54,35,23].forEach((h,i)=>p.fillRect(15+i*12,70-h,7,h));
 }
 return canvas;
}
const EFFECT_PREVIEWS=Object.fromEntries(
 DISPLAY_EFFECTS.map(effect=>[effect.id,effectPreview(effect.id)]));
function selectedScanlineChoice(){return FX.scanlines?activeScanlinePreset().id:'off';}
function toggleScanlineMenu(){
 scanlineMenuOpen=!scanlineMenuOpen;scrollVelocity=0;invalidate();
}
function chooseScanline(id){
 if(!SCANLINE_CHOICES.some(choice=>choice.id===id))return;
 FX.scanlines=id!=='off';
 if(id!=='off')FX.scanlinePreset=id;
 scanlineMenuOpen=false;persist();scrollVelocity=0;invalidate();
}
function settingSquare(x,y,size,active){
 g.lineWidth=1;
 if(active){g.fillStyle=C.bright;g.fillRect(x,y,size,size);}
 else{g.strokeStyle=C.bright;g.strokeRect(x+.5,y+.5,size-1,size-1);}
}
function settingsExpandArrow(x,y,expanded,color){
 g.save();g.translate(x,y);if(expanded)g.rotate(Math.PI/2);
 text('▶',0,0,BUTTON_ICON_FONT_SIZE,color,'center');g.restore();
}
// A single model controls the full-width card geometry, scrolling and inputs.
function settingsRows(buttonH,gap){
 const rows=[];let offset=0;
 DISPLAY_EFFECTS.forEach((effect,i)=>{
  let heading=null;
  if(i===0)heading='SCREEN OVERLAYS';
  else if(i===4)heading='EXPERIMENTAL';
  else if(effect.section)heading=effect.section;
  if(heading){
   rows.push({kind:'section',label:heading,offset,height:24});
   offset+=24+gap;
  }
  const n=effect.sliders?.length||0;
  const cardHeight=n===3?164:n===2?134:effect.pattern?145:n?104:88;
  const choiceHeight=Math.max(34,buttonH-8);
  const open=effect.pattern&&scanlineMenuOpen;
  const height=cardHeight+(open?SCANLINE_CHOICES.length*(choiceHeight+gap):0);
  rows.push({kind:'effect',effect,offset,height,cardHeight,choiceHeight});
  offset+=height+gap;
 });
 return {rows,height:Math.max(0,offset-gap)};
}
function drawOptions(q){
 // This header REPLACES TETRIS SYSTEM; it is not nested inside a second header.
 regions=[];region(0,0,W,H,'block');
 const r=layout(),pad=q.pad,gap=q.gap,headH=r.hh;
 panel(q.x,q.y,q.w,q.h,13,C.panel,C.border);
 const titleSize=r.landscape?13:Math.min(21,Math.max(16,W*.05));
 text('DISPLAY SYSTEM',q.x+UI_SPACE.headTitleInset,
  q.y+headH/2,titleSize,C.ink,'left',
  Math.max(10,q.w-UI_SPACE.headTitleInset-q.buttonH-2*gap));
 const closeX=q.x+q.w-UI_SPACE.headRightPad-q.buttonH;
 key('X',closeX,q.y+(headH-q.buttonH)/2,q.buttonH,q.buttonH,'close');
 rect(q.x+UI_SPACE.headTitleInset,q.y+headH-gap,
  Math.max(1,q.w-2*UI_SPACE.headTitleInset),1,C.border);
 // A true START GAME-sized solid action, centred outside the scrolling list.
 const restoreW=Math.min(q.w-2*pad,r.boardW*UI_SPACE.overlayButtonWidthScale);
 const restoreY=q.y+q.h-pad-r.extraH;
 key('RESTORE DEFAULTS',q.x+(q.w-restoreW)/2,restoreY,
  restoreW,r.extraH,'resetFX',{light:true});
 const contentX=q.x+pad,contentW=q.w-2*pad;
 const top=q.y+headH+gap,bottom=restoreY-gap;
 const visibleH=Math.max(0,bottom-top);
 modalView={x:contentX,y:top,w:contentW,h:visibleH};
 const model=settingsRows(q.buttonH,gap);
 optionsMaxScroll=Math.max(0,model.height-visibleH);
 optionsScroll=clamp(optionsScroll,0,optionsMaxScroll);
 g.save();g.beginPath();g.rect(contentX,top,contentW,visibleH);g.clip();
 region(contentX,top,contentW,visibleH,'scroll',{scroll:true});
 for(const row of model.rows){
  const y=top+row.offset-optionsScroll;
  if(y+row.height<top||y>bottom)continue;
  if(row.kind==='section'){
   text(row.label,contentX+pad,y+row.height/2,10,C.weak,
    'left',contentW-2*pad);
   rect(contentX+pad,y+row.height-2,contentW-2*pad,1,C.border);
   continue;
  }
  const effect=row.effect,cardH=row.cardHeight;
  panel(contentX,y,contentW,row.height,10,C.button,C.border);
  const previewSize=Math.min(68,Math.max(42,Math.floor(contentW*.185)));
  const previewX=contentX+gap,previewY=y+gap;
  panel(previewX,previewY,previewSize,previewSize,7,C.button,C.border);
  g.save();g.beginPath();
  g.rect(previewX+2,previewY+2,previewSize-4,previewSize-4);g.clip();
  g.drawImage(EFFECT_PREVIEWS[effect.id],previewX+2,previewY+2,
   previewSize-4,previewSize-4);
  g.restore();
  const descX=previewX+previewSize+gap;
  const rightW=clamp(contentW*.29,96,117);
  const rightX=contentX+contentW-gap-rightW;
  const descW=Math.max(35,rightX-descX-gap);
  text(effect.title,descX,y+21,11,C.bright,'left',descW);
  text(effect.description,descX,y+54,10,C.weak,'left',descW);
  if(effect.toggle){
   settingSquare(rightX+1,y+14,SETTINGS_SQUARE_SIZE,
    Boolean(settingValue(effect.toggle)));
   region(rightX,y+7,36,34,'toggle',
    {field:effect.toggle,modalControl:true});
  }
  if(effect.sliders?.length){
   const count=effect.sliders.length;
   const first=effect.pattern?105:count===3?46:count===2?49:60;
   if(count===1){
    const e=effect.sliders[0];
    text(displayValue(settingValue(e[1]),e[4],e[5]),
     rightX+rightW-2,y+23,11,C.bright,'right',rightW-33);
   }
   effect.sliders.forEach(([label,field,min,max,step,unit],i)=>{
    const ly=y+first+i*37;
    text(label,rightX,ly,8,C.ink,'left',rightW);
    const value=Number(settingValue(field));
    const fraction=clamp((value-min)/(max-min),0,1);
    const trackX=rightX+SETTINGS_SQUARE_SIZE/2;
    const trackW=rightW-SETTINGS_SQUARE_SIZE-2,trackY=ly+16;
    rect(trackX,trackY-2,trackW,4,C.border);
    rect(trackX,trackY-2,trackW*fraction,4,C.bright);
    rect(trackX+trackW*fraction-SETTINGS_SQUARE_SIZE/2,
     trackY-SETTINGS_SQUARE_SIZE/2,
     SETTINGS_SQUARE_SIZE,SETTINGS_SQUARE_SIZE,C.bright);
    region(trackX-SETTINGS_SQUARE_SIZE/2,trackY-15,
     trackW+SETTINGS_SQUARE_SIZE,30,'slider',
     {field,min,max,step,trackX,trackW,modalControl:true});
   });
  }
  if(effect.pattern){
   // CRT mask selector is inside its full-width row, not another accordion.
   const selectY=y+61,selectH=29;
   panel(rightX,selectY,rightW,selectH,5,C.button,C.border);
   const current=SCANLINE_CHOICES.find(o=>o.id===selectedScanlineChoice());
   const shortNames={horizontal:'HORIZONTAL',aperture:'APERTURE',
    slot:'SLOT MASK',dot:'DOT MASK'};
   text(shortNames[current?.id]||current?.name||'ORIGINAL',
    rightX+4,selectY+selectH/2,9,C.ink,'left',rightW-27);
   settingsExpandArrow(rightX+rightW-13,selectY+selectH/2,
    scanlineMenuOpen,C.ink);
   region(rightX,selectY,rightW,selectH,
    'patternSelect',{modalControl:true});
   if(scanlineMenuOpen)SCANLINE_CHOICES.forEach((option,i)=>{
    const cy=y+cardH+i*(row.choiceHeight+gap);
    settingSquare(contentX+3*gap,
     cy+(row.choiceHeight-SETTINGS_SQUARE_SIZE)/2,
     SETTINGS_SQUARE_SIZE,option.id===selectedScanlineChoice());
    text(option.name,contentX+5*gap+SETTINGS_SQUARE_SIZE,
     cy+row.choiceHeight/2,10,C.ink,'left',
     contentW-8*gap-SETTINGS_SQUARE_SIZE);
    region(contentX+2*gap,cy,contentW-4*gap,row.choiceHeight,
     'scanlineChoice',{field:option.id,modalControl:true});
   });
  }
 }
 g.restore();
 if(optionsMaxScroll>0&&visibleH>0){
  const railH=Math.max(0,visibleH-2*gap);
  const thumbH=Math.min(railH,Math.max(28,
   railH*visibleH/(visibleH+optionsMaxScroll)));
  const thumbY=top+gap+(railH-thumbH)*
   clamp(optionsScroll/optionsMaxScroll,0,1);
  rect(q.x+q.w-4,thumbY,2,thumbH,C.weak);
 }
}
function drawScores(q){
 modalPanel('FIELD ATLAS / TOP FIVE',q);
 const {x,w,pad,gap}=q;
 const footerY=modalActionRow(q,[['RETURN','close']]);
 const noteH=14,noteY=footerY-gap-noteH/2;
 text('HIGH SCORES ARE SAVED ON THIS DEVICE',x+w/2,noteY,9,C.weak,'center',w-2*pad);
 const startY=modalBodyTop(q),endY=footerY-gap-noteH-gap;
 const rowH=Math.max(0,(endY-startY-4*gap)/5);
 for(let i=0;i<5;i++){
  const score=highs[i],ry=startY+i*(rowH+gap);
  panel(x+pad,ry,w-2*pad,rowH,8,C.button,C.border);
  text(fmt(i+1,2),x+2*pad,ry+rowH*.32,12,C.bright);
  text(score?.name||'---',x+2*pad+47,ry+rowH*.32,12,C.ink);
  text(score?Number(score.score).toLocaleString('en-CA'):'------',
   x+w-2*pad,ry+rowH*.32,12,C.ink,'right');
  text(score?score.lines+' LINES / LV '+score.level:'NO RECORD',
   x+2*pad+47,ry+rowH*.74,9,C.weak);
 }
}
function drawRestart(q){
 modalPanel('START NEW GAME?',q);
 const footerY=modalActionRow(q,[['CANCEL','close'],['YES, RESTART','restartYes',true]]);
 const bodyTop=modalBodyTop(q);
 text('Your current game and score will be lost.',q.x+q.w/2,
  (bodyTop+footerY-q.gap)/2,10,C.weak,'center',q.w-2*q.pad);
}
function drawEntry(q){
 modalPanel('NEW HIGH SCORE',q);
 const {x,w,pad,gap,buttonH}=q;
 const top=modalBodyTop(q);
 panel(x+pad,top,w-2*pad,buttonH,8,C.button,C.border);
 text('YOUR SCORE: '+game.score.toLocaleString('en-CA'),x+w/2,top+buttonH/2,
  12,C.bright,'center',w-4*pad);
 const labelY=top+buttonH+gap;
 text('INITIALS / UP TO THREE',x+w/2,labelY+9,10,C.weak,'center',w-2*pad);
 const inputY=labelY+18+gap;
 key(initialsInput.value||'TAP TO ENTER',x+pad,inputY,w-2*pad,buttonH,'typeInitials');
 modalActionRow(q,[['SKIP','skipScore'],['SAVE SCORE','saveScore',true]]);
}
function paintModal(q){
 if(modal==='options')drawOptions(q);
 else if(modal==='scores')drawScores(q);
 else if(modal==='restart')drawRestart(q);
 else if(modal==='entry')drawEntry(q);
}
function paintModalOverlay(){
 // Repaint exactly one active dialog. Always clear the entire backing image
 // so no pixels from a previous modal remain after a menu transition.
 const q=modalBounds(modal);
 const cw=Math.max(1,Math.round(W*DPR)),ch=Math.max(1,Math.round(H*DPR));
 if(modalCanvas.width!==cw||modalCanvas.height!==ch){
  modalCanvas.width=cw;modalCanvas.height=ch;
 }
 modalContext.setTransform(1,0,0,1,0,0);
 modalContext.clearRect(0,0,cw,ch);
 modalContext.setTransform(DPR,0,0,DPR,0,0);
 modalPlane.visible=true;scrimPlane.visible=true;
 g=modalContext;
 try{paintModal(q);}
 finally{g=baseContext;}
 modalTexture.needsUpdate=true;
}
function handleAction(act){
 if(act==='block'||act==='scroll'||act==='board')return;
 if(act==='close'){openModal(null);return;}
 if(act==='options'){options();return;}
 if(act==='scores'){scores();return;}
 if(act==='theme'){
  theme=theme==='green'?'amber':'green';
  store('fieldAtlasThemeV06',theme);baseDirty=true;invalidate();return;
 }
 if(act==='restart'){if(game.status==='paused')openModal('restart');return;}
 if(act==='restartYes'){restart();return;}
 if(act==='skipScore'){initialsInput.blur();openModal(null);return;}
 if(act==='saveScore'){saveScore();return;}
 if(act==='typeInitials'){initialsInput.focus();return;}
 if(act==='resetFX'){
  FX={...DEFAULT};persist();
  showGhost=true;soundOn=true;
  store('fieldAtlasTetrisGhost','yes');
  store('fieldAtlasTetrisSound','yes');
  optionsScroll=0;
  scanlineMenuOpen=false;scrollVelocity=0;
  baseDirty=true;invalidate();return;
 }
 if(['start','pause','hold','left','right','cw','hard'].includes(act))perform(act);
}
function stopRepeat(){
 if(repeatDelay!==null){clearTimeout(repeatDelay);repeatDelay=null;}
 if(repeatInterval!==null){clearInterval(repeatInterval);repeatInterval=null;}
}
function eventPoint(e){
 const rect=screen.getBoundingClientRect();
 return {x:(e.clientX-rect.left)*W/rect.width,y:(e.clientY-rect.top)*H/rect.height};
}
function regionAt(p){
 // Search newest to oldest for identical overlay/touch priority without
 // allocating and reversing a copy of the hitbox array on every event.
 for(let i=regions.length-1;i>=0;i--){
  const r=regions[i];
  if(!(p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h))continue;
  if(modal==='options'&&r.modalControl&&modalView&&
    (p.y<modalView.y||p.y>modalView.y+modalView.h))continue;
  return r;
 }
 return undefined;
}
function setSlider(r,x){
 const f=clamp((x-r.trackX)/Math.max(1,r.trackW),0,1);
 const v=r.min+f*(r.max-r.min);
 const stepped=Math.round(v/r.step)*r.step;
 setSetting(r.field,Number(stepped.toFixed(4)));
}
// One pointer recognizer for the entire grayscale display. Menus defer activation
// until touch-up; axis-aware intent makes scroll work from sliders and switches.
const DRAG_DEADZONE=8;
const optionPoint=p=>modal==='options'&&modalView&&
 p.x>=modalView.x&&p.x<=modalView.x+modalView.w&&
 p.y>=modalView.y&&p.y<=modalView.y+modalView.h;
const eventStamp=e=>Number.isFinite(e.timeStamp)?e.timeStamp:performance.now();
screen.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse'&&e.button!==0)return;
 e.preventDefault();
 if(pressed)return; // One active touch: prevents accidental multi-touch changes.
 const p=eventPoint(e),r=regionAt(p),inOptions=optionPoint(p);
 stopRepeat();scrollVelocity=0;
 pressed={
  id:e.pointerId,region:r,start:p,last:p,action:r?.act,
  box:r,scroll:optionsScroll,mode:modal?'pending':'game',
  inOptions,time:eventStamp(e),velocity:0
 };
 try{screen.setPointerCapture(e.pointerId)}catch(err){}
 // Game buttons stay immediate, including auto-repeat movement.
 if(!modal&&r&&!r.board){
  baseDirty=true;
  handleAction(r.act);
  if(r.repeat)repeatDelay=setTimeout(()=>{
   repeatInterval=setInterval(()=>handleAction(r.act),82);
  },210);
 }
 invalidate();
});
screen.addEventListener('pointermove',e=>{
 if(!pressed||pressed.id!==e.pointerId)return;
 const p=eventPoint(e),r=pressed.region,touch=pressed;
 if(!modal)return;
 const dx=p.x-touch.start.x,dy=p.y-touch.start.y;
 const ax=Math.abs(dx),ay=Math.abs(dy);
 if(touch.mode==='pending'&&(ax>DRAG_DEADZONE||ay>DRAG_DEADZONE)){
  if(touch.inOptions&&ay>DRAG_DEADZONE&&ay>ax*.78)touch.mode='scroll';
  else if(r?.act==='slider'&&ax>DRAG_DEADZONE&&ax>=ay*.78)touch.mode='slider';
  else touch.mode='cancelled';
 }
 if(touch.mode==='scroll'){
  optionsScroll=clamp(touch.scroll-dy,0,optionsMaxScroll);
  const dt=Math.max(1,eventStamp(e)-touch.time);
  const v=clamp((touch.last.y-p.y)/dt,-2.3,2.3);
  touch.velocity=touch.velocity*.5+v*.5;
  invalidate();
 }else if(touch.mode==='slider'){
  setSlider(r,p.x);
 }
 touch.last=p;touch.time=eventStamp(e);
});
function releaseTouch(e){
 if(!pressed||pressed.id!==e.pointerId)return;
 stopRepeat();
 const touch=pressed,p=eventPoint(e);pressed=null;
 // Release feedback on game buttons must repaint the stationary base once.
 if(!modal)baseDirty=true;
 try{if(screen.hasPointerCapture(e.pointerId))screen.releasePointerCapture(e.pointerId);}catch(err){}
 if(modal){
  if(e.type==='pointerup'){
   if(touch.mode==='scroll'){
    const elapsed=Math.max(0,eventStamp(e)-touch.time);
    if(elapsed<105&&optionsMaxScroll>0)scrollVelocity=touch.velocity;
   }else if(touch.mode==='pending'&&touch.region){
    const dy=p.y-touch.start.y,dx=p.x-touch.start.x;
    const same=Math.abs(dx)<=DRAG_DEADZONE&&Math.abs(dy)<=DRAG_DEADZONE;
    if(same){
     const r=touch.region;
     if(r.act==='slider')setSlider(r,p.x);
     else if(r.act==='toggle')setSetting(r.field,!settingValue(r.field));
     else if(r.act==='patternSelect'&&optionPoint(p))toggleScanlineMenu();
     else if(r.act==='scanlineChoice'&&optionPoint(p))chooseScanline(r.field);
     else if(!touch.inOptions||optionPoint(p))handleAction(r.act);
    }
   }else if(touch.mode==='slider'&&touch.region?.act==='slider'){
    setSlider(touch.region,p.x);
   }
  }
 }else if(touch.action==='board'&&e.type==='pointerup'){
  baseDirty=true;
  const dx=p.x-touch.start.x,dy=p.y-touch.start.y;
  if(Math.abs(dx)<16&&Math.abs(dy)<16)perform('cw');
  else if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>18){
   for(let i=0;i<clamp(Math.round(Math.abs(dx)/32),1,5);i++)
    perform(dx>0?'right':'left');
  }else if(dy>25)perform('hard');
 }
 invalidate();
}
screen.addEventListener('pointerup',releaseTouch);
screen.addEventListener('pointercancel',releaseTouch);
window.addEventListener('blur',stopRepeat);
screen.addEventListener('wheel',e=>{
 if(modal==='options'){
  e.preventDefault();optionsScroll=clamp(optionsScroll+e.deltaY,0,optionsMaxScroll);invalidate();
 }
},{passive:false});
const KEYS={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'cw',KeyX:'cw',
 ArrowDown:'hard',Space:'hard',KeyC:'hold',ShiftLeft:'hold',
 KeyP:'pause',Escape:'pause'};
document.addEventListener('keydown',e=>{
 if(document.activeElement===initialsInput)return;
 if(modal){
  if(e.code==='Escape'){e.preventDefault();openModal(null);}
  return;
 }
 const a=KEYS[e.code];
 if(!a)return;
 e.preventDefault();
 if(e.repeat&&['hard','hold','pause','start'].includes(a))return;
 perform(a);
});
// iOS Home Screen web apps can resume a suspended page without reloading it.
// Check the running renderer against the published build on reactivation.
// Never interrupt a game or a dialog just to install an update.
let checkingBuild=false,lastBuildCheck=0;
async function checkForNewBuild(){
 if(document.hidden||checkingBuild||modal||game.status!=='ready')return;
 const now=Date.now();
 if(now-lastBuildCheck<15000)return;
 checkingBuild=true;lastBuildCheck=now;
 try{
  const url=new URL('./three-v027.js?update-check='+now,import.meta.url);
  const reply=await fetch(url,{cache:'no-store'});
  if(!reply.ok)return;
  const match=(await reply.text()).match(/const THREE_BUILD_VERSION='([0-9]+)'/);
  if(match&&Number(match[1])>Number(THREE_BUILD_VERSION)&&
    !document.hidden&&!modal&&game.status==='ready'){
   location.reload();
  }
 }catch(e){/* Offline: keep the current playable build. */}
 finally{checkingBuild=false;}
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&game.status==='playing')perform('pause');
 lastTime=performance.now();
 if(!document.hidden){invalidate();void checkForNewBuild();}
});
window.addEventListener('pageshow',()=>{void checkForNewBuild();});
window.addEventListener('focus',()=>{void checkForNewBuild();});
// Some standalone sessions never report another foreground transition.
setInterval(()=>{if(!document.hidden)void checkForNewBuild();},60000);
function syncFX(){
 ghostPass.enabled=FX.ghost;
 ghostPass.uniforms.uX.value=FX.ghostX;
 ghostPass.uniforms.uY.value=FX.ghostY;
 ghostPass.uniforms.uStrength.value=FX.ghostStrength/100;
 tint.uniforms.uEnabled.value=FX.phosphor?1:0;
 tint.uniforms.uTint.value.copy(hues[theme]);
 glow.enabled=FX.bloom;
 glow.strength=FX.bloomStrength;
 edgeSoftness.enabled=FX.softness;
 edgeSoftness.uniforms.uAmount.value=FX.softnessStrength;
 edgeSoftness.uniforms.uRadius.value=FX.softnessRadius;
 const boardOverlayActive=game.status!=='playing'&&!modal&&
  lastPaintedBoardPopupStatus===game.status;
 boardBlurHorizontal.enabled=boardOverlayActive;
 boardPopupPass.enabled=boardOverlayActive;
 const popupBlur=boardBlurParams();
 for(const pass of [boardBlurHorizontal,boardPopupPass]){
  pass.uniforms.uSigma.value=popupBlur.sigma;
  pass.uniforms.uStep.value=popupBlur.step;
 }
 boardPopupPass.uniforms.uFade.value=BOARD_POPUP_FADE;
 // Keep the live CanvasTexture bound through all update paths.
 boardPopupPass.uniforms.uPopup.value=boardPopupTexture;
 if(layoutInfo){
  const r=layoutInfo,x=r.boardX+2,y=r.boardY+2,w=Math.max(0,r.boardW-4),h=Math.max(0,r.boardH-4);
  for(const pass of [boardBlurHorizontal,boardPopupPass]){
   pass.uniforms.uRect.value.set(x/W,1-(y+h)/H,(x+w)/W,1-y/H);
  }
 }
 edgeVignette.enabled=FX.vignette;
 edgeVignette.uniforms.uAmount.value=FX.vignetteAmount;
 edgeVignette.uniforms.uStart.value=VIGNETTE_FADE_SPREAD;
 scanlineOverlay.enabled=FX.scanlines&&FX.scanlineOpacity>0;
 const scanlinePreset=activeScanlinePreset();
 scanlineOverlay.uniforms.uPattern.value=scanlineTextures[scanlinePreset.id];
 scanlineOverlay.uniforms.uPatternSize.value.set(scanlinePreset.rows[0].length,scanlinePreset.rows.length);
 scanlineOverlay.uniforms.uOpacity.value=clamp(FX.scanlineOpacity/100,0,1);
 scanlineOverlay.uniforms.uScale.value=CRT_PATTERN_SCALE;
 scanlineOverlay.uniforms.uDpr.value=DPR;
 scanlineOverlay.uniforms.uScreenHeight.value=H*DPR;
}
function requestFrame(){
 if(!queued&&!document.hidden){queued=true;requestAnimationFrame(frame);}
}
function frame(now){
 queued=false;
 try{
  const dt=clamp(now-lastTime,0,100);lastTime=now;
  const prior=game.pieces,priorLines=game.lines,priorStatus=game.status;
  // Freeze gravity until the completed rows have finished blinking.
  const advanced=lineClearFX?false:game.tick(dt);
  if(lineClearFX&&game.status==='playing'){
   lineClearFX.elapsed+=dt;
   if(lineClearFX.elapsed>=LINE_FLASH_MS)lineClearFX=null;
   dirty=true;baseDirty=true;
  }
  if(advanced||game.pieces!==prior||game.lines!==prior||priorStatus!==game.status){
   dirty=true;baseDirty=true;
   if(game.lines>priorLines)tone(590,.1);
   else if(game.pieces>prior)tone(180,.04);
   onOver();
  }
  if(modal==='options'&&Math.abs(scrollVelocity)>.015){
   const before=optionsScroll;
   optionsScroll=clamp(optionsScroll+scrollVelocity*dt,0,optionsMaxScroll);
   scrollVelocity*=Math.exp(-dt/190);
   if(optionsScroll===before||optionsScroll===0||optionsScroll===optionsMaxScroll)scrollVelocity=0;
   else dirty=true;
  }else scrollVelocity=0;
  if(dirty){
   paintGame();
   syncFX();
   composer.render();
  }
  if(game.status==='playing'||dirty||Math.abs(scrollVelocity)>.015)requestFrame();
 }catch(e){
  fatal.hidden=false;fatal.textContent='Three.js Tetris frame failed: '+String(e.stack||e);
  console.error(e);
 }
}
function resize(){
 const b=display.getBoundingClientRect(),w=Math.max(1,Math.round(b.width)),h=Math.max(1,Math.round(b.height));
 const d=Math.max(1,window.devicePixelRatio||1);
 if(w===W&&h===H&&d===DPR&&!dirty)return;
 W=w;H=h;DPR=d;
 input.width=Math.round(W*DPR);input.height=Math.round(H*DPR);
 boardPopupCanvas.width=input.width;boardPopupCanvas.height=input.height;
 g.setTransform(DPR,0,0,DPR,0,0);
 renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
 composer.setPixelRatio(DPR);composer.setSize(W,H);
 ghostPass.uniforms.uSize.value.set(W,H);
 edgeSoftness.uniforms.uSize.value.set(W,H);
 boardBlurHorizontal.uniforms.uSize.value.set(W,H);
 boardPopupPass.uniforms.uSize.value.set(W,H);
 baseDirty=true;dirty=true;invalidate();
}
new ResizeObserver(resize).observe(display);
window.addEventListener('orientationchange',()=>{dirty=true;resize();});
resize();
requestFrame();
// One check after initialization also covers standalone cold launches.
void checkForNewBuild();

