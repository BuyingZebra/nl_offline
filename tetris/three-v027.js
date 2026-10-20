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
const DEFAULT=Object.freeze({boardBlur:47,phosphor:true,bloom:true,bloomCutoff:.21,bloomStrength:.30,
 ghost:true,ghostX:2,ghostY:0,ghostStrength:22,noise:false,noiseAmount:20,noiseRate:15,noiseSize:2,
 softness:true,softnessStrength:.64,softnessRadius:3,
 vignette:true,vignetteAmount:.39,vignetteSpread:.57,roll:false,rollSpeed:20,rollOffset:0});
const THREE_BUILD_VERSION='025'; // Increment per approved layout/render test.
// Use one spacing unit for adjacent containers and buttons inside panels.
// Vertically centered header buttons and flexible sidebar space preserve V027.
const UI_GAP=6;
// Text stays 14px on standard buttons and 16px on START/RESUME/PLAY AGAIN.
// All button character icons share one 18px size, independent of their labels.
// Face luminance (solid/default) never changes typography.
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
const persist=()=>store(PREF,JSON.stringify(FX));
// Upgrade popup blur to 47% once; later user adjustments remain persistent.
const BOARD_POPUP_V020='fieldAtlasBoardPopupV020';
if(load(BOARD_POPUP_V020,'')!=='applied'){
 FX.boardBlur=47;persist();store(BOARD_POPUP_V020,'applied');
}
const game=new Core.Game();
let highs=Scores.read(window.localStorage),overOffered=false;
let showGhost=load('fieldAtlasTetrisGhost','yes')!=='no';
let soundOn=load('fieldAtlasTetrisSound','yes')!=='no';
let theme=load('fieldAtlasThemeV06','green')==='amber'?'amber':'green';
let W=1,H=1,DPR=1,regions=[],layoutInfo=null,modal=null,modalView=null;
let optionsScroll=0,optionsMaxScroll=0,pressed=null,repeatDelay=null,repeatInterval=null;
let scrollVelocity=0; // logical pixels per millisecond, decays during GPU frames
let dirty=true,baseDirty=true,queued=false,lastTime=performance.now(),lastDraw=0,rollPhase=0,audioCtx=null,gamepadDrag=null;
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
modalPlane.frustumCulled=false;modalPlane.renderOrder=2;modalPlane.position.z=.03;
modalPlane.visible=false;scene.add(modalPlane);

 const composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 const glow=new UnrealBloomPass(new THREE.Vector2(1,1),1.5,.42,.55);

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

 // Vertical-sync roll: real image sampling with repeated UV coordinates.
 const verticalRoll=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uOffset:{value:0}},
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uOffset;
   void main(){gl_FragColor=texture2D(tDiffuse,vec2(vUv.x,fract(vUv.y+uOffset)));}`
 });
 verticalRoll.enabled=false;
 composer.addPass(verticalRoll);

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

 // Luminance-dependent monochrome noise belongs to the incoming signal.
 const grain=new ShaderPass({
  uniforms:{
   tDiffuse:{value:null},
   uAmount:{value:.20},
   uTick:{value:0},
   uDpr:{value:1},
   uGrainSize:{value:2}
  },
  vertexShader:passVertex,
  fragmentShader:`
   varying vec2 vUv;
   uniform sampler2D tDiffuse;
   uniform float uAmount,uTick,uDpr,uGrainSize;
   float hash12(vec2 p){
    vec3 p3=fract(vec3(p.xyx)*0.1031);
    p3+=dot(p3,p3.yzx+33.33);
    return fract((p3.x+p3.y)*p3.z);
   }
   void main(){
    vec3 sourceColor=texture2D(tDiffuse,vUv).rgb;
    vec2 grainCell=floor(gl_FragCoord.xy/max(1.0,uDpr*uGrainSize));
    vec2 seed=grainCell+vec2(uTick*17.31,uTick*41.83);
    // Derive visibility from the noise-free signal. No external masks.
    float lum=dot(sourceColor,vec3(.2126,.7152,.0722));
    float visibility=smoothstep(.02,.95,lum);
    float mixAmount=clamp(uAmount,0.0,1.0)*visibility;
    float mono=(hash12(seed)+hash12(seed+vec2(31.7,92.3))
               +hash12(seed+vec2(69.4,14.9)))/3.0;
    gl_FragColor=vec4(mix(sourceColor,vec3(mono),mixAmount),1.0);
   }`
 });
 grain.enabled=false;
 composer.addPass(grain);

 const tint=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uEnabled:{value:0},uTint:{value:new THREE.Vector3(.2,1,.2)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying vec2 vUv;uniform sampler2D tDiffuse;uniform float uEnabled;uniform vec3 uTint;void main(){vec3 rgb=texture2D(tDiffuse,vUv).rgb;float lum=dot(rgb,vec3(.2126,.7152,.0722));gl_FragColor=vec4(mix(rgb,vec3(lum)*uTint,uEnabled),1.);}'
 });
 composer.addPass(tint);

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
 // Bloom remains upstream of screen optics, as in the approved test.
 composer.addPass(glow);
 composer.addPass(edgeSoftness);

 composer.addPass(edgeVignette);
 composer.addPass(new OutputPass());


// Green phosphor is unchanged. Amber is display-compensated to reproduce the
// darker Pip-Boy orange-gold mockup (#D69334 in bright rendered UI regions).
// These are GPU tint multipliers of grayscale luminance, not UI source colours.
const hues={green:new THREE.Vector3(.2,1,.2),amber:new THREE.Vector3(185/255,79/255,9/255)};
const brightness={I:.99,J:.8,L:.92,O:.94,S:.76,T:.85,Z:.73};
// Popup blur remains one 0–100% control. Both GPU axes use dense,
// regularly spaced normalized Gaussian samples. At high settings we enlarge
// the sampling footprint, while 47% uses nearly pixel-adjacent taps.
const BOARD_POPUP_FADE=.87;
function boardBlurParams(){
 const p=clamp(Number(FX.boardBlur)||0,0,100)/100;
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
 modal=name;modalView=null;optionsScroll=0;scrollVelocity=0;stopRepeat();pressed=null;
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
function text(str,x,y,size=12,color=C.ink,align='left',maxWidth=Infinity,spacing=0){
 g.font='700 '+size+'px '+FONT;g.textAlign=align;g.textBaseline='middle';
 // Decorative tracking remains for headings and HUD labels; button labels use zero tracking.
 g.letterSpacing=spacing?spacing.toFixed(2)+'px':'0px';
 g.fillStyle=color;
 if(Number.isFinite(maxWidth))g.fillText(String(str),x,y,Math.max(1,maxWidth));
 else g.fillText(String(str),x,y);
 g.letterSpacing='0px';
}
function rect(x,y,w,h,color){g.fillStyle=color;g.fillRect(x,y,w,h);}
function region(x,y,w,h,act,opts={}){regions.push({x,y,w,h,act,...opts});}
function key(label,x,y,w,h,act,{light=false,repeat=false,arrow=false}={}){
 const size=MAIN_ACTION_LABELS.has(String(label))?MAIN_ACTION_FONT_SIZE:
  BUTTON_ICON_LABELS.has(String(label))?BUTTON_ICON_FONT_SIZE:BUTTON_FONT_SIZE;
 const down=pressed?.action===act&&pressed?.box?.x===x;
 panel(x,y,w,h,8,down?C.solid:(light?C.bright:C.button),light?C.bright:C.border);
 text(label,x+w/2,y+h/2,size,light?C.dark:C.ink,'center',Math.max(10,w-14));
 if(arrow)text('▶',x+17,y+h/2,BUTTON_ICON_FONT_SIZE,light?C.dark:C.ink,'center');
 region(x,y,w,h,act,{repeat});
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
  C.ink,'left',Math.max(10,r.hw-116),titleSize*.13);
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
 text('HOLD',sx+sw/2,hold.y+13,9,C.weak,'center',Infinity,1.08);
 smallPiece(game.hold,sx+(sw-80)/2,hold.y+23,80,Math.min(short?43:60,Math.max(12,hold.h-26)),'hold');
 panel(next.x,next.y,next.w,next.h,9,C.panel);
 text('NEXT',sx+sw/2,next.y+13,9,C.weak,'center',Infinity,1.08);
 const previewH=Math.min(short?36:44,Math.max(9,(next.h-32)/3));
 for(let i=0;i<3;i++){
  smallPiece(game.queue[i],sx+(sw-80)/2,next.y+26+i*(previewH+1),80,previewH,'next');
 }
 panel(stats.x,stats.y,stats.w,stats.h,9,C.panel);
 text('BEST',sx+sw/2,stats.y+12,9,C.weak,'center',Infinity,1.08);
 text(Math.max(highs[0]?.score||0,game.score),sx+sw/2,stats.y+30,13,C.ink,'center');
 text('PIECES',sx+sw/2,stats.y+52,9,C.weak,'center',Infinity,1.08);
 text(game.pieces,sx+sw/2,stats.y+Math.min(70,stats.h-13),13,C.ink,'center');
 panel(r.dx,r.dy,r.dw,r.dh,12,C.panel);
 const px=r.dx+r.deckPad,pw=r.dw-2*r.deckPad,ly=r.dy+r.deckPad+7;
 const s=Math.max(13,Math.min(17,pw*.046)),labelSpacing=9*.13;
 text('LEVEL',px+2,ly,9,C.weak,'left',Infinity,labelSpacing);
 text('SCORE',px+pw/2,ly,9,C.weak,'center',Infinity,labelSpacing);
 text('LINES',px+pw-2,ly,9,C.weak,'right',Infinity,labelSpacing);
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
 text('Program: Three.JS',r.off+11,r.footerY,9,C.weak,'left',r.inner*.63,.63);
 text('Version: '+THREE_BUILD_VERSION,r.off+r.width-11,r.footerY,9,C.weak,'right',r.inner*.34,.63);
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

const MENU=[
 ['heading','GAMEPLAY'],
 ['switch','GHOST PIECE','pieceGhost'],['switch','SOUND','sound'],
 ['range','BOARD POPUP BLUR','boardBlur',0,100,1,'%'],
 ['heading','CRT EMISSION'],
 ['switch','PHOSPHOR','phosphor'],['switch','BLOOM','bloom'],
 ['range','BLOOM CUTOFF','bloomCutoff',0,1,.01,''],
 ['range','BLOOM STRENGTH','bloomStrength',0,3,.05,''],
 ['heading','SIGNAL GHOSTING'],
 ['switch','GHOSTING','ghost'],
 ['range','GHOST X','ghostX',-32,32,1,' px'],
 ['range','GHOST Y','ghostY',-32,32,1,' px'],
 ['range','GHOST STRENGTH','ghostStrength',0,100,1,'%'],
 ['heading','SIGNAL NOISE'],
 ['switch','MOVING NOISE','noise'],
 ['range','NOISE AMOUNT','noiseAmount',0,100,1,'%'],
 ['range','NOISE SIZE','noiseSize',.5,8,.5,' px'],
 ['range','NOISE RATE','noiseRate',1,60,1,' Hz'],
 ['heading','DISPLAY OPTICS'],
 ['switch','EDGE SOFTNESS','softness'],
 ['range','BLUR STRENGTH','softnessStrength',0,1,.01,''],
 ['range','BLUR RADIUS','softnessRadius',0,10,.5,' px'],
 ['switch','VIGNETTE','vignette'],
 ['range','EDGE DARKNESS','vignetteAmount',0,1,.01,''],
 ['range','FADE SPREAD','vignetteSpread',.2,.85,.01,''],
 ['heading','VERTICAL SYNCHRONIZATION'],
 ['switch','VERTICAL ROLL','roll'],
 ['range','ROLL SPEED','rollSpeed',-100,100,1,'%/s'],
 ['range','ROLL POSITION','rollOffset',0,100,1,'%'],
 ['heading','DISPLAY PRESET'],
 ['button','RESTORE APPROVED VALUES','resetFX']
];
function settingValue(k){
 if(k==='pieceGhost')return showGhost;
 if(k==='sound')return soundOn;
 return FX[k];
}
function setSetting(k,value){
 if(k==='pieceGhost'){
  showGhost=Boolean(value);store('fieldAtlasTetrisGhost',showGhost?'yes':'no');baseDirty=true;
 }else if(k==='sound'){
  soundOn=Boolean(value);store('fieldAtlasTetrisSound',soundOn?'yes':'no');
 }else{
  FX[k]=value;persist();
  if(k==='boardBlur'&&game.status!=='playing')baseDirty=true;
 }
 invalidate();
}
function displayValue(value,step,unit){
 const digits=step<.1?2:step<1?1:0;
 return Number(value).toFixed(digits)+unit;
}
function modalBounds(height){
 const safe=insets();
 const w=Math.max(190,Math.min(410,W-26));
 const h=Math.min(height,H-safe.top-safe.bottom-22);
 return {w,h,x:(W-w)/2,y:(H-h)/2};
}
function modalPanel(title,height){
 const q=modalBounds(height);
 regions=[];region(0,0,W,H,'block');
 panel(q.x,q.y,q.w,q.h,13,C.panel,C.border);
 text(title,q.x+17,q.y+25,14,C.bright,'left',q.w-34);
 return q;
}
function drawOptions(){
 const q=modalPanel('FIELD ATLAS / DISPLAY SETTINGS',Math.min(680,H*.82));
 const {x,y,w,h}=q;
 key('RETURN TO GAME',x+15,y+43,w-30,43,'close');
 const top=y+97,bottom=y+h-15,vheight=bottom-top;
 modalView={x:x+12,y:top,w:w-24,h:vheight};
 g.save();g.beginPath();g.rect(modalView.x,top,modalView.w,vheight);g.clip();
 region(modalView.x,top,modalView.w,vheight,'scroll',{scroll:true});
 let yy=top+8-optionsScroll;
 for(const item of MENU){
  const [kind,name,k,min,max,step,unit]=item;
  if(kind==='heading'){
   if(yy+22>=top&&yy<=bottom)
    text(name,x+25,yy+11,10,C.weak);
   yy+=34;continue;
  }
  if(kind==='button'){
   if(yy+44>=top&&yy<=bottom)key(name,x+25,yy+3,w-50,38,k);
   yy+=60;continue;
  }
  if(kind==='switch'){
   const value=settingValue(k);
   if(yy+43>=top&&yy<=bottom){
    text(name,x+25,yy+17,11,C.ink);
    const tx=x+w-53,ty=yy+7;
    panel(tx,ty,22,22,3,value?C.bright:C.button,C.border);
    if(value)text('✓',tx+11,ty+11,17,C.dark,'center');
    region(x+18,yy,w-35,41,'toggle',{field:k,modalControl:true});
   }
   yy+=46;continue;
  }
  if(kind==='range'){
   const val=Number(settingValue(k));
   if(yy+60>=top&&yy<=bottom){
    text(name,x+25,yy+12,10,C.ink);
    text(displayValue(val,step,unit),x+w-25,yy+12,10,C.weak,'right');
    const lx=x+27,trackW=w-54,sy=yy+39;
    rect(lx,sy,trackW,5,C.border);
    const fraction=clamp((val-min)/(max-min),0,1),cx=lx+trackW*fraction;
    rect(lx,sy,trackW*fraction,5,C.bright);
    panel(cx-9,sy-7,18,19,6,C.bright,null);
    region(lx,yy+20,trackW,36,'slider',{field:k,min,max,step,trackX:lx,trackW,modalControl:true});
   }
   yy+=66;continue;
  }
 }
 const contentHeight=yy+optionsScroll-top;
 optionsMaxScroll=Math.max(0,contentHeight-vheight+12);
 g.restore();
 // Scroll indicator shows that additional settings are below.
 if(optionsMaxScroll>0){
  const railH=vheight-15,thumbH=Math.max(28,railH*vheight/(vheight+optionsMaxScroll));
  const thumbY=top+7+(railH-thumbH)*clamp(optionsScroll/optionsMaxScroll,0,1);
  rect(x+w-7,thumbY,2,thumbH,C.weak);
 }
 // Buttons/slider regions outside the viewport must never intercept touches.
}
function drawScores(){
 const q=modalPanel('FIELD ATLAS / TOP FIVE',Math.min(430,H*.7));
 const {x,y,w,h}=q;
 for(let i=0;i<5;i++){
  const score=highs[i],ry=y+60+i*54;
  text(fmt(i+1,2),x+20,ry,12,C.bright);
  text(score?.name||'---',x+73,ry,12,C.ink);
  text(score?Number(score.score).toLocaleString('en-CA'):'------',x+w-17,ry,12,C.ink,'right');
  text(score?score.lines+' LINES / LV '+score.level:'NO RECORD',x+74,ry+19,9,C.weak);
  if(i!==4)rect(x+17,ry+29,w-34,1,'#303030');
 }
 text('HIGH SCORES ARE SAVED ON THIS DEVICE',x+w/2,y+h-77,9,C.weak,'center',w-30);
 key('RETURN',x+16,y+h-57,w-32,41,'close');
}
function drawRestart(){
 const q=modalPanel('START NEW GAME?',215);
 const {x,y,w,h}=q;
 text('Your current game and score will be lost.',x+w/2,y+72,10,C.weak,'center',w-25);
 key('CANCEL',x+15,y+h-69,(w-39)/2,46,'close');
 key('YES, RESTART',x+(w-39)/2+24,y+h-69,(w-39)/2,46,'restartYes',{light:true});
}
function drawEntry(){
 const q=modalPanel('NEW HIGH SCORE',275);
 const {x,y,w,h}=q;
 text('YOUR SCORE: '+game.score.toLocaleString('en-CA'),x+w/2,y+69,12,C.bright,'center');
 text('INITIALS / UP TO THREE',x+w/2,y+105,10,C.weak,'center');
 key(initialsInput.value||'TAP TO ENTER',x+35,y+126,w-70,43,'typeInitials');
 key('SKIP',x+15,y+h-65,(w-39)/2,45,'skipScore');
 key('SAVE SCORE',x+24+(w-39)/2,y+h-65,(w-39)/2,45,'saveScore',{light:true});
}
function paintModal(){
 if(modal==='options')drawOptions();
 else if(modal==='scores')drawScores();
 else if(modal==='restart')drawRestart();
 else if(modal==='entry')drawEntry();
}
function paintModalOverlay(){
 const wantedHeight=modal==='options'?Math.min(680,H*.82):
  modal==='scores'?Math.min(430,H*.7):
  modal==='restart'?215:275;
 const q=modalBounds(wantedHeight);
 const cw=Math.max(1,Math.round(q.w*DPR));
 const ch=Math.max(1,Math.round(q.h*DPR));
 if(modalCanvas.width!==cw||modalCanvas.height!==ch){
  modalCanvas.width=cw;modalCanvas.height=ch;
 }
 // Redraw only the modal's physical pixels; its rectangular backing stays
 // transparent so the separate Three.js scrim and game remain visible.
 modalContext.setTransform(1,0,0,1,0,0);
 modalContext.clearRect(0,0,cw,ch);
 modalContext.setTransform(DPR,0,0,DPR,-q.x*DPR,-q.y*DPR);
 modalPlane.position.set((q.x+q.w/2)/W*2-1,1-(q.y+q.h/2)/H*2,.03);
 modalPlane.scale.set(q.w/W,q.h/H,1);
 modalPlane.visible=true;scrimPlane.visible=true;
 g=modalContext;
 try{paintModal();}
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
 if(act==='resetFX'){FX={...DEFAULT};persist();baseDirty=true;invalidate();return;}
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
 return [...regions].reverse().find(r=>{
  if(!(p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h))return false;
  if(modal==='options'&&r.modalControl&&modalView){
   if(p.y<modalView.y||p.y>modalView.y+modalView.h)return false;
  }
  return true;
 });
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
function syncFX(now){
 verticalRoll.enabled=FX.roll;
 if(FX.roll){
  const step=(now-lastDraw)/1000;
  rollPhase=(rollPhase+Math.max(0,Math.min(.1,step))*FX.rollSpeed/100)%1;
  verticalRoll.uniforms.uOffset.value=(rollPhase+FX.rollOffset/100+2)%1;
 }
 ghostPass.enabled=FX.ghost;
 ghostPass.uniforms.uX.value=FX.ghostX;
 ghostPass.uniforms.uY.value=FX.ghostY;
 ghostPass.uniforms.uStrength.value=FX.ghostStrength/100;
 grain.enabled=FX.noise;
 grain.uniforms.uAmount.value=FX.noiseAmount/100;
 grain.uniforms.uTick.value=Math.floor(now/1000*FX.noiseRate);
 grain.uniforms.uGrainSize.value=FX.noiseSize;
 tint.uniforms.uEnabled.value=FX.phosphor?1:0;
 tint.uniforms.uTint.value.copy(hues[theme]);
 glow.enabled=FX.bloom;
 glow.threshold=FX.bloomCutoff;glow.strength=FX.bloomStrength;
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
 edgeVignette.uniforms.uStart.value=FX.vignetteSpread;
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
  const animateNoise=FX.noise&&FX.noiseAmount>0;
  const animateRoll=FX.roll&&FX.rollSpeed!==0;
  const animated=animateNoise||animateRoll;
  const frameInterval=animateNoise?Math.max(16,1000/FX.noiseRate):30;
  if(modal==='options'&&Math.abs(scrollVelocity)>.015){
   const before=optionsScroll;
   optionsScroll=clamp(optionsScroll+scrollVelocity*dt,0,optionsMaxScroll);
   scrollVelocity*=Math.exp(-dt/190);
   if(optionsScroll===before||optionsScroll===0||optionsScroll===optionsMaxScroll)scrollVelocity=0;
   else dirty=true;
  }else scrollVelocity=0;
  const update=dirty||(animated&&now-lastDraw>=frameInterval);
  if(update){
   if(dirty)paintGame();
   syncFX(now);
   composer.render();
   lastDraw=now;
  }
  if(game.status==='playing'||animated||dirty||Math.abs(scrollVelocity)>.015)requestFrame();
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
 grain.uniforms.uDpr.value=DPR;
 baseDirty=true;dirty=true;invalidate();
}
new ResizeObserver(resize).observe(display);
window.addEventListener('orientationchange',()=>{dirty=true;resize();});
resize();
requestFrame();
// One check after initialization also covers standalone cold launches.
void checkForNewBuild();

