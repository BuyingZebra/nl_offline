/* NOMAD TETRIS — Canvas2D source, Three.js CRT compositor.
 * Gameplay belongs to core.js; rendering observes immutable game events.
 * Preserve the approved grayscale source, display pipeline and controls.
 */
import * as THREE from 'three';
import {createCompositor} from './compositor.js?v107';
import {createVectorTileRenderer} from './vector-tile-renderer.js?v126';
import {collectPieceShadowGroups,createPieceShadowRenderer} from './piece-drop-shadow.js?v163';
import {collectIFragments} from './i-piece-fragments.js?v119';
import {createButtonFeedback} from './button-feedback.js?v107';
import {buttonFeedbackLayers} from './button-layer-invalidation.js?v166';
import {createGpuButtonLighting} from './gpu-button-lighting.js?v169';
import {createCanvasUI} from './canvas-ui.js?v165';
import {getBuildVersion} from './build-version.js?v066';
import {createPlatformManager} from './platform-manager.js?v176';
import {createAppLifecycle,createGraphicsCleanup,runCleanupTasks} from './app-lifecycle.js?v093';
import {createInputController} from './input-controller.js?v174';
import {createPerfMonitor} from './perf-monitor.js?v168';
import {createTextureUploadProfiler} from './texture-upload-profiler.js?v164';
import {croppedBounds,sidebarBounds,controlsBounds,drawCroppedCanvas} from './cropped-ui-layers.js?v168';
import {captureGameVisualState,gameVisualStateChanged,flashPhase} from './game-visual-state.js?v058';
import {formatDebugReport} from './debug-report.js?v169';
import {createDebugClipboard} from './debug-clipboard.js?v055';
import {createModalUI} from './modal-ui.js?v156';
import {createRenderInvalidation} from './render-invalidation.js?v168';
import {createHudDrawing,fitPreviewCells} from './hud-drawing.js?v156';
import {createTerminalLog,drawTerminalLog,terminalLineBounds} from './terminal-log.js?v155';
import {createBrickFrame} from './assets/frames/brick-pattern.mjs?v137';
import {DISPLAY_EFFECTS,scanlineChoices} from './display-settings-catalog.js?v103';
import {createSettingsManager} from './settings-manager.js?v103';
import {createScreenManager} from './screen-manager.js?v156';
import {createActionController} from './action-controller.js?v175';
import {createGraphicsHealth} from './graphics-health.js?v089';
const Core=window.FieldAtlasBlocks,Scores=window.FieldAtlasScores;
const screen=document.getElementById('screen'),display=document.getElementById('display');
const safeProbe=document.getElementById('safeArea');
const fatal=document.getElementById('error');
const portraitGate=window.matchMedia(document.getElementById('portraitGate')?.media||'not all');
if(!Core?.Game||!Scores){fatal.hidden=false;fatal.textContent='Tetris core missing';throw Error('Tetris core missing');}
const ScreenLayout=window.FieldAtlasTetrisLayout;
if(!ScreenLayout?.computeLayout){fatal.hidden=false;fatal.textContent='Tetris layout module missing';throw Error('Tetris layout module missing');}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v)),fmt=(n,k=6)=>String(Math.max(0,Math.floor(n))).padStart(k,'0');
const gray=n=>{const v=clamp(Math.round(n),0,255);return 'rgb('+v+','+v+','+v+')'};
// Default/unfilled button faces share the exact near-black background value.
// Lift panels by 3 percentage points of the 0–255 grayscale scale (21 -> 29).
const SCREEN_BLACK='#080808';
const C={bg:SCREEN_BLACK,panel:'#1d1d1d',button:SCREEN_BLACK,solid:'#303030',ink:'#e3e3e3',
 bright:'#cecece',weak:'#aeaeae',border:'#777777',subtleBorder:'#2e2e2e',grid:'#2b2b2b',dark:'#060606'};
// Fonts follow Fallout 4's UI/terminal roles; original icons stay intact.
const ICON_FONT='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const FONT='"Roboto Condensed",'+ICON_FONT;
const TERMINAL_FONT='"Share Tech Mono",'+ICON_FONT;
// User preferences are owned by the Settings Manager, independent of rendering.
const THREE_BUILD_VERSION=getBuildVersion(document);
// The HTML build meta is authoritative; title, accessibility and debug labels derive from it.
document.title='NOMAD — Tetris System | version: '+THREE_BUILD_VERSION;
display.setAttribute('aria-label','Tetris System — Three.js version: '+THREE_BUILD_VERSION);
// Viewport measurements and render DPR cap now belong to Platform Manager.
// Use one spacing unit for adjacent containers and buttons inside panels.
// Vertically centered header buttons and flexible sidebar space preserve V027.
const UI_GAP=6;
// Font sizes remain 14px for standard buttons and 16px for primary actions;
// all button icons remain 18px. Every label uses the same 0.13em tracking.
const LETTER_SPACING_EM=.13; // Global 13%-of-font-size tracking; no exceptions.
const BUTTON_FONT_SIZE=14,MAIN_ACTION_FONT_SIZE=16;
const BUTTON_ICON_FONT_SIZE=18;
const MAIN_ACTION_LABELS=new Set(['START GAME','RESUME','PLAY AGAIN']);
const BUTTON_ICON_LABELS=new Set(['◀','▶','↻','◐','☷','X','✓','!']);
const UI_SPACE=Object.freeze({
 unit:UI_GAP,buttonWidthScale:.75,overlayButtonWidthScale:.85,appMax:520,padX:11,stackGap:UI_GAP,side:93,sideGap:UI_GAP,
 headHeight:80,headIcons:46,headIconGap:UI_GAP,headRightPad:UI_GAP,
 headTitleInset:17,
 deckBottom:30,deckPad:UI_GAP,scoreHeight:45,deckGap:UI_GAP,
 padGap:UI_GAP,padHeight:53,extrasHeight:44,extrasGap:UI_GAP,
 holdHeight:88,nextHeight:162,statsHeight:92
});
let storage,scoreDatabase;
try{storage=window.localStorage;}catch(error){/* The storage getter can be disabled. */}
try{scoreDatabase=window.indexedDB;}catch(error){/* Fall back to local storage. */}
const settings=createSettingsManager(storage);
const game=new Core.Game();
let W=1,H=1,DPR=1,regions=[],layoutInfo=null;
let inputController=null;
let scrollVelocity=0; // logical pixels per millisecond, decays during GPU frames
let queued=false,frameHandle=null,lastTime=performance.now(),audioCtx=null;
let appLifecycle=null;
let pageInCache=false;
// One owner for layer invalidation, redraw attribution and pending work.
const layers=createRenderInvalidation();
const terminalLog=createTerminalLog();
// The HTML build marker is authoritative, including when the app is offline.
// Let the boot terminal finish with the exact running build, so the version
// remains on its bright active row until the next gameplay event.
terminalLog.enqueue('BUILD: VERSION V'+THREE_BUILD_VERSION,
 'VER: V'+THREE_BUILD_VERSION);
let terminalTimer=null,lastTerminalCursorVisible=true;
function queueTerminalMessage(full,short=full,priority=false){
 terminalLog.enqueue(full,short,priority);
 layers.mark('terminal');invalidate('terminal-event');
}
// Small rolling history: no overlay, network, persistent storage, or console spam.
const recentPerf=[];
const perf=createPerfMonitor({enabled:true,intervalMs:2000,log:()=>{},
 onSample:sample=>{
  recentPerf.push(sample);
  if(recentPerf.length>8)recentPerf.shift();
 }});
const debugClipboard=createDebugClipboard({navigator,document});
let baseRegions=[]; // Cached layout hitboxes when menus cover the board.
// Snapshot a just-completed board before Core removes its rows, then flash it.
const LINE_FLASH_MS=430,LINE_FLASH_TOGGLE_MS=72;
let lineClearFX=null,lastPaintedBoardPopupStatus=null;
const input=document.createElement('canvas'),baseContext=input.getContext('2d',{alpha:false});
const boardCanvas=document.createElement('canvas');
const boardContext=boardCanvas.getContext('2d',{alpha:false});
const sidebarCanvas=document.createElement('canvas');
const sidebarContext=sidebarCanvas.getContext('2d',{alpha:false});
const controlsCanvas=document.createElement('canvas');
const controlsContext=controlsCanvas.getContext('2d',{alpha:false});
// The tiny operation log is independent of the deck's six control buttons.
// It shares their grayscale source and all downstream CRT postprocessing.
const terminalCanvas=document.createElement('canvas');
const terminalContext=terminalCanvas.getContext('2d',{alpha:false});
let g=baseContext; // UI drawing target: stationary gameplay or small modal canvas.
const modalCanvas=document.createElement('canvas'),modalContext=modalCanvas.getContext('2d',{alpha:true});
// Sharp board popup UI is a separate grayscale layer composed after GPU blur.
const boardPopupCanvas=document.createElement('canvas');
const boardPopupContext=boardPopupCanvas.getContext('2d',{alpha:true});
if(!g||!boardContext||!sidebarContext||!controlsContext||!terminalContext||!modalContext||!boardPopupContext){fatal.hidden=false;fatal.textContent='Canvas2D missing';throw Error('Canvas2D missing');}
const texture=new THREE.CanvasTexture(input);
texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
const boardTexture=new THREE.CanvasTexture(boardCanvas);
boardTexture.colorSpace=THREE.SRGBColorSpace;
boardTexture.minFilter=THREE.LinearFilter;boardTexture.magFilter=THREE.LinearFilter;
boardTexture.generateMipmaps=false;
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
 layers.mark('controls');invalidate('gpu-controls-fallback');
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

// Source-owned button brightness; no fullscreen press overlay or extra glow.
const buttonFeedback=createButtonFeedback();
let buttonSparks=[];
let priorButtonSignature='';
let lastHistoryRender=0;

// Upload changed canvases before submitting the composer so that the first
// RenderPass no longer conflates texture transfer and scene rendering.
const textureUploads=createTextureUploadProfiler({renderer,
 onTiming:(kind,elapsed,source)=>perf.recordUpload(kind,elapsed,source)});
const compositor=createCompositor({renderer,scene,camera,boardPopupTexture,
 onPassTiming:(name,elapsed)=>perf.recordPass(name,elapsed)});
const {SCANLINE_PRESETS}=compositor;
const graphicsHealth=createGraphicsHealth({
 canvas:screen,
 onLost:()=>{
  // An interrupted GPU must never advance unseen gameplay or repeat inputs.
  if(game.status==='playing')actions.perform('pause');
  inputController?.cancel();scrollVelocity=0;
  buttonFeedback.clear();buttonSparks=[];
  compositor.resetPersistence();
  cancelPendingFrame();lastTime=performance.now();perf.resetPacing();
 },
 onRestored:()=>{
  try{
   // Three.js reinitializes its internal WebGL context. Reapply the
   // established viewport and mark all CanvasTextures dirty. Visible planes
   // reupload immediately; hidden planes upload on their next appearance.
   renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
   compositor.resize(W,H,DPR);
   compositor.resetPersistence();
   for(const source of [texture,boardTexture,sidebarTexture,controlsTexture,
    terminalTexture,modalTexture,boardPopupTexture])source.needsUpdate=true;
   lastPaintedBoardPopupStatus=null;cachedLayout=null;
   lastTime=performance.now();perf.resetPacing();
   layers.mark('base','board','sidebar','controls','terminal');
   invalidate('context-restored');
  }catch(error){
   fatal.hidden=false;
   fatal.textContent='WebGL restoration failed: '+String(error.stack||error);
   throw error;
  }
 }
});

// Game and terminal now share precisely the same tile-face renderer.
function tone(freq=240,len=.04){
 if(!settings.soundOn)return;
 try{const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;if(!audioCtx)audioCtx=new AC();
  if(audioCtx.state==='suspended'){
   const wake=audioCtx.resume();
   wake?.catch?.(()=>{}); // Safari may reject an interrupted gesture.
  }
  const osc=audioCtx.createOscillator(),vol=audioCtx.createGain();
  osc.type='square';osc.frequency.value=freq;
  vol.gain.setValueAtTime(.014,audioCtx.currentTime);
  vol.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+len);
  osc.connect(vol).connect(audioCtx.destination);
  osc.onended=()=>{osc.disconnect();vol.disconnect();};
  osc.start();osc.stop(audioCtx.currentTime+len);
 }catch(e){}
}
function invalidate(reason='input'){
 // V167: only events that can alter visible menu pixels should redraw the
 // modal. Terminal typing, gravity and background CRT updates cannot.
 if(screenManager.paintsModalLayer&&
   ['input','button-press','button-release','resize','resume',
    'context-restored','font-ready'].includes(reason))layers.mark('modal');
 layers.reason(reason);requestFrame();
}
// The core owns piece locking and line-clear detection. Its read-only event
// includes the landed board BEFORE row removal, preserving the approved flash.
// No core method is replaced or monkeypatched by rendering code.
const unsubscribeGameEvents=game.onEvent(event=>{
 if(event.type==='lines-cleared'){
  const name=['','SINGLE','DOUBLE','TRIPLE','TETRIS'][event.count]||'LINE';
  const points=[0,40,100,300,1200][event.count]*(event.level+1);
  queueTerminalMessage('CLEAR: '+name+' +'+points,'CLR: '+event.count+'L+'+points);
 }
 if(event.type==='level-changed')queueTerminalMessage(
  'LEVEL: ADVANCED '+fmt(event.to,2),'LVL: '+fmt(event.to,2));
 if(event.type==='game-over')queueTerminalMessage('SESSION: GAME OVER','GM: OVER',true);
 if(event.type!=='lines-cleared'||event.status!=='playing')return;
 if(!event.board||!event.rows.length)return;
 lineClearFX={board:event.board,boardMeta:event.boardMeta,rows:new Set(event.rows),elapsed:0};
 layers.mark('board');layers.mark('sidebar');invalidate();
});
const screenManager=createScreenManager({
 getGameStatus:()=>game.status,
 pauseGame:()=>actions.perform('pause'),
 onChange:(previous,next)=>{
  // Preserve menu-local reset, touch capture and score popup invalidation.
  modalUI.reset();scrollVelocity=0;inputController?.cancel();
  // Buttons release on navigation, but the full-screen afterglow survives.
  buttonFeedback.clear();
  if(previous==='scores'||next==='scores')layers.mark('base');
  // Entering/re-entering Options needs a fresh full menu; leaving it must
  // discard any pending modal dirtiness even if another screen is selected.
  if(previous==='options'||next==='options')layers.mark('modal');
  // Gameplay's base can remain untouched while the full-screen Options
  // view is in front. Refresh it exactly once when becoming visible again.
  if(previous==='options'&&next!=='options')layers.mark('base','controls','terminal');
  if(next===null)regions=baseRegions;
  invalidate();
 }
});
// All game commands, menu actions and personal-best updates are delegated.
// UI and render adapters remain here; the controller never paints.
const actions=createActionController({
 game,scores:Scores,storage,settings,screens:screenManager,
 persistScore:Scores.createPersistence(storage,scoreDatabase),
 getLineClearActive:()=>Boolean(lineClearFX),
 clearLineClear:()=>{lineClearFX=null;},
 // Score, lines and preview content already belong to sidebar/board.
 // The deck itself is static; presses are now uniform-only GPU changes.
 markLayers:(...names)=>{
  const applicable=controlsGpuEnabled?
   names.filter(name=>name!=='controls'):names;
  if(applicable.length)layers.mark(...applicable);
 },
 invalidate:()=>invalidate(),
 tone:(freq,len)=>tone(freq,len),
 onCopyDebug:()=>copyDebugReport(),
 onResetSettingsUI:()=>{modalUI.resetSettings();scrollVelocity=0;},
 onTerminalEvent:queueTerminalMessage,
 canInteract:()=>!portraitGate.matches&&graphicsHealth.status==='ready'&&appLifecycle?.canWork!==false
});
const {panel,wrapText,text,rect,region,key,buttonLight}=createCanvasUI({
 getContext:()=>g,getRegions:()=>regions,
 getButtonPower:r=>(g===controlsContext&&controlsGpuEnabled)?0:buttonSparks.find(
  s=>s.x===r.x&&s.y===r.y&&s.w===r.w&&s.h===r.h)?.power??0,
 C,FONT,ICON_FONT,TERMINAL_FONT,LETTER_SPACING_EM,MAIN_ACTION_LABELS,BUTTON_ICON_LABELS,
 MAIN_ACTION_FONT_SIZE,BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE
});
// The official logo is a standalone, resolution-independent SVG asset.
// This exact-path Canvas fallback keeps the logo visible on first paint and
// offline or while SVG image decoding completes.
const nomadMark=new Image();
let nomadMarkReady=false;
nomadMark.onload=()=>{
 nomadMarkReady=true;
 if(appLifecycle?.status!=='disposed'){
  layers.mark('base');
  invalidate('nomad-mark-ready');
 }
};
nomadMark.onerror=()=>{nomadMarkReady=false;};
nomadMark.src='./nomad-mark.svg?v110';
function paintNomadMark(x,y,w,h){
 if(nomadMarkReady){g.drawImage(nomadMark,x,y,w,h);return;}
 g.save();
 g.translate(x,y);g.scale(w/160,h/64);
 g.strokeStyle=C.bright;g.lineWidth=3.8;
 g.lineCap='round';g.lineJoin='round';
 g.beginPath();
 for(const [xa,ya,xb] of [
  [18,18,56],[104,18,142],[8,32,51],
  [109,32,152],[18,46,56],[104,46,142]
 ]){g.moveTo(xa,ya);g.lineTo(xb,ya);}
 g.stroke();
 g.beginPath();g.arc(80,32,24,0,Math.PI*2);g.stroke();
 g.restore();
}
// Do not block first paint on web fonts; redraw once either face loads.
if(document.fonts?.load){
 const specs=['700 20px "Roboto Condensed"','400 20px "Share Tech Mono"'];
 Promise.allSettled(specs.map(spec=>document.fonts.load(spec))).then(results=>{
  if(appLifecycle?.status==='disposed')return;
  if(!results.some(r=>r.status==='fulfilled'&&r.value.length))return;
  layers.mark('base','board','sidebar','controls','terminal');
  invalidate('font-ready');
 }).catch(()=>{});
}
// V121: higher-contrast smooth SVG sprites, raster-cached at display DPR.
// Approved pixel motifs remain a fallback during SVG loading/errors.
const pieceShadows=createPieceShadowRenderer({pixelRatio:()=>DPR});
const vectorTiles=createVectorTileRenderer({
 pixelRatio:()=>DPR,
 onReady:()=>{
  if(appLifecycle?.status==='disposed')return;
  layers.mark('board','sidebar');
  invalidate('vector-tile-ready');
 }
});
vectorTiles.preload();
const brickFrame=createBrickFrame({
 pixelRatio:()=>DPR,
 onReady:()=>{
  if(appLifecycle?.status==='disposed')return;
  // Once the original SVG is decoded, repaint the static rails from
  // that image instead of keeping the exact-geometry fallback forever.
  layers.mark('base');
  invalidate('brick-svg-ready');
 }
});
// Retain V027-inspired preview tile sizing but use a single uniform scale.
// Tetrominoes are centred and contained in their square preview frames.
// Fresh grayscale tile styling for both the board and miniature previews:
// thin bevel rim, darker inset cap, luminous upper edge and lower shadow.
function tileFace(x,y,w,h,kind){
 vectorTiles.drawTile(g,x,y,w,h,kind);
}
function smallPiece(kind,x,y,w,h,role='next',targetCell=null){
 if(!kind)return;
 // Preview I is a single gravel-textured strip; other pieces repeat the
 // exact approved 12-pixel motif once per occupied square.
 vectorTiles.drawPiece(g,fitPreviewCells(Core.SHAPES[kind],x,y,w,h,role,targetCell),kind);
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
function stage(r,drawPieces=true,recordRegion=true){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 panel(x,y,w,h,7,C.panel);
 const offX=x+2,offY=y+2,tile=(w-4)/10;
 g.save();g.beginPath();g.rect(offX,offY,w-4,h-4);g.clip();
 rect(offX,offY,w-4,h-4,'#181818');
 // V158: increase the visible grid by another ~10%. The board background
 // is 18/255 (up from 16/255); grid opacity is 0.68305068 x 1.10 and
 // its source luminance is 43 (up from 41). Geometry/thickness are unchanged.
 g.globalAlpha=.751355748;g.strokeStyle=C.grid;g.lineWidth=.6;g.beginPath();
 for(let c=0;c<=10;c++){g.moveTo(offX+c*tile,offY);g.lineTo(offX+c*tile,offY+20*tile);}
 for(let row=0;row<=20;row++){g.moveTo(offX,offY+row*tile);g.lineTo(offX+10*tile,offY+row*tile);}
 g.stroke();g.globalAlpha=1;
 // Blink freshly completed rows between the detailed tiles and empty
 // outlined cubes before revealing the core's already-cleared board.
 if(drawPieces){
 const displayBoard=lineClearFX?.board||game.board;
 const clearIsEmpty=lineClearFX&&Math.floor(lineClearFX.elapsed/LINE_FLASH_TOGGLE_MS)%2===1;
 // Join only consecutive original cells from ONE locked piece. Adjacent I
 // pieces keep independent frames; clearing rows never re-seeds the gravel.
 const displayMeta=lineClearFX?.boardMeta||game.boardMeta;
 const iRuns=collectIFragments(displayBoard,displayMeta,{
  hiddenRows:clearIsEmpty?lineClearFX.rows:null
 });
 // V162: cast each locked/active tetromino's own 2-layer shadow onto the
 // grid BEFORE painting its source SVG art. Piece IDs preserve separate
 // shadows for touching stacks, and the current rotated matrix is sampled
 // anew on every paint so even wall kicks change the silhouette correctly.
 const shadowGroups=collectPieceShadowGroups(displayBoard,displayMeta,
  !lineClearFX&&game.status!=='over'?game.current:null,
  clearIsEmpty?lineClearFX.rows:null);
 pieceShadows.draw(g,shadowGroups,offX,offY,tile);
 displayBoard.forEach((row,ry)=>row.forEach((kind,rx)=>{
  if(!kind)return;
  if(clearIsEmpty&&lineClearFX.rows.has(ry)){
   const px=offX+rx*tile,py=offY+ry*tile;
   g.save();g.strokeStyle=C.border;g.globalAlpha=.42;g.lineWidth=.7;
   g.strokeRect(px+2,py+2,tile-4,tile-4);g.restore();
  }else if(kind!=='I')cell(offX,offY,rx,ry,tile,kind);
 }));
 for(const run of iRuns){
  const vertical=(run.rotation&1)===1;
  vectorTiles.drawIFragment(g,offX+run.x*tile,offY+run.y*tile,
   (vertical?1:run.length)*tile,(vertical?run.length:1)*tile,
   {sourceOffset:run.sourceOffset,length:run.length,rotation:run.rotation});
 }
 if(!lineClearFX&&game.current&&game.status!=='over'){
  const p=game.current;
  if(settings.pieceGhost&&(game.status==='playing'||game.status==='paused')){
   const target=game.ghostY();
   p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{if(kind)cell(offX,offY,p.x+rx,target+ry,tile,kind,true);}));
  }
  const activeTiles=[];
  p.matrix.forEach((row,ry)=>row.forEach((kind,rx)=>{
   if(!kind)return;
   if(p.kind==='I')activeTiles.push({
    x:offX+(p.x+rx)*tile,y:offY+(p.y+ry)*tile,size:tile
   });
   else cell(offX,offY,p.x+rx,p.y+ry,tile,kind);
  }));
  if(p.kind==='I')vectorTiles.drawPiece(g,activeTiles,'I',{rotation:p.rotation});
 }
 }
 // V144: a soft, clipped inner drop shadow makes the playfield feel inset.
 // Overlay only the inside edges; board shape, grid geometry and pieces stay put.
 g.save();
 const innerW=w-4,innerH=h-4;
 const depth=Math.min(20,Math.max(8,tile*.8));
 const insetShade=(x0,y0,x1,y1,rx,ry,rw,rh,alpha)=>{
  const fade=g.createLinearGradient(x0,y0,x1,y1);
  fade.addColorStop(0,'rgba(0,0,0,'+alpha+')');
  fade.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=fade;
  g.fillRect(rx,ry,rw,rh);
 };
 insetShade(offX,offY,offX,offY+depth,
  offX,offY,innerW,depth,.58);
 insetShade(offX,offY,offX+depth,offY,
  offX,offY,depth,innerH,.42);
 insetShade(offX,offY+innerH,offX,offY+innerH-depth,
  offX,offY+innerH-depth,innerW,depth,.24);
 insetShade(offX+innerW,offY,offX+innerW-depth,offY,
  offX+innerW-depth,offY,depth,innerH,.24);
 g.restore();
 g.restore();
 if(recordRegion)region(x,y,w,h,'board',{board:true});

}
// The stage's inset shadow is blurred along with gameplay. Redraw a
// restrained copy on the separate popup layer, composed AFTER Gaussian blur.
// Keep the same four-sided 2px inset without touching stage geometry.
function drawSharpBoardInsetShadow(r){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 const offX=x+2,offY=y+2,innerW=w-4,innerH=h-4;
 if(innerW<=0||innerH<=0)return;
 const tile=innerW/10,depth=Math.min(20,Math.max(8,tile*.8));
 g.save();g.beginPath();g.rect(offX,offY,innerW,innerH);g.clip();
 const shade=(x0,y0,x1,y1,rx,ry,rw,rh,alpha)=>{
  const fade=g.createLinearGradient(x0,y0,x1,y1);
  fade.addColorStop(0,'rgba(0,0,0,'+alpha+')');
  fade.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=fade;g.fillRect(rx,ry,rw,rh);
 };
 shade(offX,offY,offX,offY+depth,offX,offY,innerW,depth,.36);
 shade(offX,offY,offX+depth,offY,offX,offY,depth,innerH,.27);
 shade(offX,offY+innerH,offX,offY+innerH-depth,
  offX,offY+innerH-depth,innerW,depth,.15);
 shade(offX+innerW,offY,offX+innerW-depth,offY,
  offX+innerW-depth,offY,depth,innerH,.15);
 g.restore();
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
  // Reapply the inset shadow above the blur, but not above the score screen.
  if(!screenManager.isScores)drawSharpBoardInsetShadow(r);
  // Top Five is composed as a sharp alpha popup AFTER the Gaussian board blur.
  // Do not draw PAUSED/GAME OVER controls beneath the score screen.
  if(screenManager.isScores){
   modalUI.paintModal(modalUI.modalBounds('scores'));
   return;
  }
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
   const subSize=10;
   const subY=by-headingGap-subSize/2;
   const titleY=subY-subSize/2-headingGap-headingSize/2;
   text(title,x+w/2,titleY,headingSize,C.bright,'center',w-18);
   text('SURVIVE THE SOVIET CHALLENGE',x+w/2,subY,subSize,C.weak,'center',w-18);
  }else{
   const titleY=by-headingGap-headingSize/2;
   text(title,x+w/2,titleY,headingSize,C.bright,'center',w-18);
  }
  // Popup buttons retain their approved 85%-width scale and standard 6px
  // spacing between RESUME, RESTART, and HIGH SCORE actions.
  key(caption,bx,by,bw,primaryH,'start',{light:true,arrow:true});
  if(type==='paused'){
   key('RESTART',bx,by+primaryH+inset,bw,secondaryH,'restart');
   key('HIGH SCORE',bx,by+primaryH+secondaryH+2*inset,bw,secondaryH,'scores');
  }
  }finally{g=baseContext;}
}
// Pure layout calculation remains in layout.js; platform owns safe-area measurement.
let cachedLayout=null;
function insets(){return platform.safeInsets();}
function layout(){
 return cachedLayout||(cachedLayout=ScreenLayout.computeLayout(W,H,insets(),UI_SPACE));
}
// Independent cropped CanvasTexture shares CSS layout geometry with base.
function paintBoardLayer(){
 const r=layout(),x=r.boardX,y=r.boardY,w=r.boardW,h=r.boardH;
 const pixelW=Math.max(1,Math.round(w*DPR)),pixelH=Math.max(1,Math.round(h*DPR));
 if(boardCanvas.width!==pixelW||boardCanvas.height!==pixelH){
  boardCanvas.width=pixelW;boardCanvas.height=pixelH;
 }
 boardContext.setTransform(DPR,0,0,DPR,-x*DPR,-y*DPR);
 const previous=g;g=boardContext;
 try{
  rect(x,y,w,h,C.bg);
  stage(r,true,false);
 }finally{g=previous;}
 boardPlane.scale.set(w/W,h/H,1);
 boardPlane.position.set(-1+(2*x+w)/W,1-(2*y+h)/H,.01);
 boardTexture.needsUpdate=true;
 perf.textureChanged('board');
}
// Keep all original drawing commands and labels; only their render target changes.
const {drawSidebar,drawControls}=createHudDrawing({
 panel,text,rect,key,smallPiece,getGame:()=>game,
 C,UI_SPACE,fmt
});
// Cached opaque crops cover stale duplicates on the full-screen base. The
// temporary hitbox list prevents dynamic repaints from changing input priority.
function paintUIRegion(canvas,context,plane,layerTexture,bounds,kind,draw){
 const priorContext=g,priorRegions=regions;
 g=context;regions=[];
 try{
  drawCroppedCanvas({canvas,context,plane,texture:layerTexture,bounds,
   dpr:DPR,width:W,height:H,draw:region=>{
    rect(region.x,region.y,region.w,region.h,C.bg);
    draw(layoutInfo||layout());
   }});
 }finally{g=priorContext;regions=priorRegions;}
 perf.textureChanged(kind);
}
function paintSidebarLayer(){
 const r=layoutInfo||layout();
 paintUIRegion(sidebarCanvas,sidebarContext,sidebarPlane,sidebarTexture,
  sidebarBounds(r,W,H,DPR),'sidebar',drawSidebar);
}
function paintControlsLayer(){
 const r=layoutInfo||layout();
 const bounds=controlsBounds(r,W,H,DPR);
 paintUIRegion(controlsCanvas,controlsContext,controlsPlane,controlsTexture,
  bounds,'controls',r=>{
   drawControls(r);
   // The temporary regions list contains the exact button geometry
   // produced by the same Canvas painter and touch-hitbox model.
   if(controlsGpuEnabled){
    if(!controlLighting.configure(regions,bounds))disableGpuControls();
    else controlLighting.update(buttonSparks);
   }
  });
}
function paintTerminalLayer(){
 const r=layoutInfo||layout();
 // Keep the ORIGINAL terminal renderer: identical glyph metrics, clipping,
 // cursor, history gradient, pixel coordinates and background luminance.
 // Crop only its two unframed rows, leaving the game controls stationary.
 paintUIRegion(terminalCanvas,terminalContext,terminalPlane,terminalTexture,
  croppedBounds([terminalLineBounds(r)],W,H,DPR,0),'terminal',r=>{
   drawTerminalLog(g,terminalLog,r,performance.now(),C.ink,C.bg,FONT);
  });
}
function paintBaseGame(){
 regions=[];const r=layout();layoutInfo=r;
 // The popup isn't sampled while playing. Avoid clearing and uploading
 // an entire full-resolution transparent texture for every falling piece.
 if(game.status!=='playing'){
  boardPopupContext.setTransform(1,0,0,1,0,0);
  boardPopupContext.clearRect(0,0,boardPopupCanvas.width,boardPopupCanvas.height);
  boardPopupContext.setTransform(DPR,0,0,DPR,0,0);
 }
 g=baseContext;
 rect(0,0,W,H,C.bg);
 // The stray shaded sub-footer is removed; the log prints on bare black.
 panel(r.hx,r.hy,r.hw,r.hh,0,C.panel);
 // The logo, wordmark, and subtitle use the EXISTING font and luminance
 // palette. Only the title organization changes; header buttons stay put.
 const th=r.headerButtonH;
 const tx=r.hx+r.hw-UI_SPACE.headRightPad-th*2-UI_SPACE.headIconGap;
 const ty=r.hy+(r.hh-th)/2;
 const markX=r.hx+Math.max(6,UI_SPACE.headTitleInset*.48);
 const available=Math.max(20,tx-markX-5);
 const markW=Math.min(74,Math.max(30,available*.34));
 const markH=markW*.4;
 const markY=r.hy+(r.hh-markH)/2;
 paintNomadMark(markX,markY,markW,markH);
 const titleX=markX+markW+Math.max(6,Math.min(11,available*.05));
 const titleWidth=Math.max(12,tx-titleX-5);
 rect(titleX-5,r.hy+r.hh*.27,1,r.hh*.46,C.bright);
 text('NOMAD',titleX,r.hy+r.hh/2-9,
  r.landscape?14:Math.min(20,Math.max(15,r.hw*.056)),
  C.ink,'left',titleWidth);
 text('TETRIS SYSTEM',titleX,r.hy+r.hh/2+11,
  10,C.weak,'left',titleWidth);
 key('◐',tx,ty,th,th,'theme');
 key('☷',tx+th+UI_SPACE.headIconGap,ty,th,th,'options');
 stage(r,false,true);
 // Static 75%-cell brick rails, exactly one control-gap outside either edge.
 // Draw on the base layer, not inside the cropped board texture.
 brickFrame.draw(g,r);
 drawSidebar(r);
 drawControls(r);
 // Re-render the sharp popup from the CURRENT status, registering its hitboxes
 // after all other controls so overlays take input priority.
 paintBoardPopup(r);
 baseRegions=regions;
 texture.needsUpdate=true;
 perf.textureChanged('base');
 if(game.status!=='playing'){
  boardPopupTexture.needsUpdate=true;
  perf.textureChanged('popup');
 }
}
function paintGame(){
 if(game.status!==lastPaintedBoardPopupStatus)layers.mark('base');
 let paintedBase=false;
 if(layers.consume('base')){
  const started=performance.now();
  paintBaseGame();
  perf.recordDuration('base',performance.now()-started);
  paintedBase=true;
 }
 if(layers.consume('board')){
  const started=performance.now();
  paintBoardLayer();
  perf.recordDuration('board',performance.now()-started);
 }
 if(layers.consume('sidebar')){
  const started=performance.now();
  paintSidebarLayer();
  perf.recordDuration('sidebar',performance.now()-started);
 }
 if(layers.consume('controls')){
  const started=performance.now();
  paintControlsLayer();
  perf.recordDuration('controls',performance.now()-started);
 }
 if(layers.consume('terminal')&&!screenManager.isOptions){
  const started=performance.now();
  paintTerminalLayer();
  perf.recordDuration('terminal',performance.now()-started);
 }
 if(screenManager.paintsModalLayer){
  // paintBaseGame resets hit regions to the base; repaint the modal too so
  // that its hitboxes still receive touch after a font/viewport refresh.
  if(paintedBase)layers.mark('modal');
  // The existing modal plane retains the last texture on terminal typing
  // or button changes behind an unchanged menu. No canvas paint or upload.
  if(layers.consume('modal')||!modalPlane.visible){
   const started=performance.now();
   paintModalOverlay();
   perf.recordDuration('modal',performance.now()-started);
  }
 }
 else{
  layers.consume('modal');
  surface.visible=true;boardPlane.visible=true;sidebarPlane.visible=true;
  controlsPlane.visible=true;terminalPlane.visible=true;
  modalPlane.visible=false;scrimPlane.visible=false;
  regions=baseRegions;
 }
}

// NOMAD Display System: one continuous full-width list (no category headings).
// Keep the canonical game effect settings and existing storage keys unchanged.
const SCANLINE_CHOICES=scanlineChoices(SCANLINE_PRESETS);
function settingValue(k){
 return settings.settingValue(k);
}
// The menu module owns its scroll, picker and canvas drawing state.
// Only live data and existing Canvas primitives cross this boundary.
const modalUI=createModalUI({
 document,SHAPES:Core.SHAPES,DISPLAY_EFFECTS,SCANLINE_CHOICES,
 getViewport:()=>({W,H,DPR}),layout,insets,
 clearRegions:()=>{regions=[];},getContext:()=>g,
 panel,text,rect,region,key,buttonLight,gray,clamp,fmt,C,UI_SPACE,BUTTON_ICON_FONT_SIZE,
 getFX:()=>settings.effects,activeScanlinePreset:id=>compositor.activeScanlinePreset(id),
 settingValue,chooseScanlineSetting:id=>settings.chooseScanline(id),
 invalidate,setScrollVelocity:value=>{scrollVelocity=value;},
 getBest:()=>actions.best,getGame:()=>game,
 getModal:()=>screenManager.active
});
function createDebugReport(){
 const memory=renderer.info.memory;
 const gpu={...compositor.passStats(),textures:memory?.textures,
  geometries:memory?.geometries,programs:renderer.info.programs?.length};
 return formatDebugReport({
  version:THREE_BUILD_VERSION,createdAt:new Date().toISOString(),
  buttonRenderer:controlsGpuEnabled?'GPU uniforms':'Canvas2D fallback',
  platform:navigator.userAgent,
  viewport:{width:W,height:H,dpr:DPR,deviceDpr:Math.max(1,window.devicePixelRatio||1)},
  game:{status:game.status,level:game.level,score:game.score,lines:game.lines},
  display:{theme:settings.theme,orientation:W>H?'landscape':'portrait',phosphor:settings.effects.phosphor,
   settings:JSON.stringify({...settings.effects,pieceGhost:settings.pieceGhost,sound:settings.soundOn})},
  gpu,graphics:graphicsHealth.snapshot(),lifecycle:appLifecycle?.snapshot(),
  offline:{network:navigator.onLine===false?'offline':'online',
   supported:'serviceWorker' in navigator,
   controlled:Boolean(navigator.serviceWorker?.controller)},
  samples:recentPerf,current:perf.currentSnapshot()
 });
}
function copyDebugReport(){
 modalUI.debugCopyState='pending';
 // Clipboard access must start inside the original touch-up user gesture.
 const report=createDebugReport();
 debugClipboard.copyText(report).then(success=>{
  if(appLifecycle?.status==='disposed')return;
  modalUI.debugCopyState=success?'copied':'failed';invalidate();
 },()=>{
  if(appLifecycle?.status==='disposed')return;
  modalUI.debugCopyState='failed';invalidate();
 });
}
function paintModalOverlay(){
 // Repaint exactly one active dialog. Always clear the entire backing image
 // so no pixels from a previous modal remain after a menu transition.
 // Options is now its own screen: hide the game rather than darken it.
 const standaloneSettings=screenManager.isOptions;
 surface.visible=!standaloneSettings;boardPlane.visible=!standaloneSettings;
 sidebarPlane.visible=!standaloneSettings;controlsPlane.visible=!standaloneSettings;
 terminalPlane.visible=!standaloneSettings;
 const q=modalUI.modalBounds(screenManager.active);
 const cw=Math.max(1,Math.round(W*DPR)),ch=Math.max(1,Math.round(H*DPR));
 if(modalCanvas.width!==cw||modalCanvas.height!==ch){
  modalCanvas.width=cw;modalCanvas.height=ch;
 }
 modalContext.setTransform(1,0,0,1,0,0);
 modalContext.clearRect(0,0,cw,ch);
 modalContext.setTransform(DPR,0,0,DPR,0,0);
 modalPlane.visible=true;
 // Don't dim the HUD while the score list occupies the board.
 scrimPlane.visible=!standaloneSettings&&!screenManager.isScores;
 g=modalContext;
 try{modalUI.paintModal(q);}
 finally{g=baseContext;}
 modalTexture.needsUpdate=true;
 perf.textureChanged('modal');
}
inputController=createInputController({
 screen,document,window,
 getViewport:()=>({width:W,height:H}),getRegions:()=>regions,
 getModal:()=>screenManager.active,getModalView:()=>modalUI.view,
 getOptionsScroll:()=>modalUI.scroll,setOptionsScroll:v=>{modalUI.scroll=v;},
 getOptionsMaxScroll:()=>modalUI.maxScroll,
 setScrollVelocity:v=>{scrollVelocity=v;},
 setBaseDirty:(act)=>{
  if(act==='theme'||act==='options')layers.mark('base');
  else if(act==='board')layers.mark('board');
  // GPU button brightness needs only a shader-uniform update. Retain
  // original source painting on devices without sufficient GPU capability.
  else if(act&&!controlsGpuEnabled)layers.mark('controls');
 },
 handleAction:act=>{
  const previous=game.status;
  const result=actions.dispatch(act);
  // PAUSE must retain its active button until release, even though
  // the game status changes immediately. Other transitions can clear it.
  if(game.status!==previous&&act!=='pause')buttonFeedback.clear();
  return result;
 },
 perform:act=>{
  const previous=game.status;
  const result=actions.perform(act);
  // PAUSE must retain its active button until release, even though
  // the game status changes immediately. Other transitions can clear it.
  if(game.status!==previous&&act!=='pause')buttonFeedback.clear();
  return result;
 },
 setSetting:actions.setSetting,settingValue,
 toggleScanlineMenu:()=>modalUI.toggleScanlineMenu(),
 chooseScanline:id=>modalUI.chooseScanline(id),
 openModal:()=>screenManager.close(),invalidate,clamp,
 onButtonPress:(hit,now,held)=>{
  if(buttonFeedback.press(hit,now,held))invalidate('button-press');
 },
 onButtonRelease:(hit,now)=>{
  if(buttonFeedback.release(hit,now))invalidate('button-release');
 },
 canInteract:()=>!portraitGate.matches&&graphicsHealth.status==='ready'&&appLifecycle?.canWork!==false
});
// Browser and installed-app lifecycle, viewport and update polling are delegated
// to Platform Manager. The renderer retains only its drawing responsibilities.
function syncFX(){
 const scoreBounds=screenManager.isScores?modalUI.modalBounds('scores'):null;
 const blurredLayout=scoreBounds?.landscapeFallback?{
  ...layoutInfo,boardX:scoreBounds.x,boardY:scoreBounds.y,
  boardW:scoreBounds.w,boardH:scoreBounds.h
 }:layoutInfo;
 compositor.syncFX({fx:settings.effects,theme:settings.theme,width:W,height:H,dpr:DPR,
  boardStatus:game.status,modalOpen:screenManager.hasModal,
  scoresOverlay:screenManager.isScores,
  popupStatus:lastPaintedBoardPopupStatus,layoutInfo:blurredLayout});
}
function cancelPendingFrame(){
 if(frameHandle!==null){cancelAnimationFrame(frameHandle);frameHandle=null;}
 queued=false;
}
function requestFrame(){
 if(!queued&&!document.hidden&&graphicsHealth.canRender&&
    appLifecycle?.canWork!==false){
  queued=true;frameHandle=requestAnimationFrame(frame);
 }
}
function frame(now){
 queued=false;frameHandle=null;
 if(!graphicsHealth.canRender||appLifecycle?.canWork===false)return;
 perf.recordRaf(now);
 const frameStarted=perf.startFrame();
 try{
  const dt=clamp(now-lastTime,0,100);lastTime=now;
  const prior=captureGameVisualState(game);
  // Only redraw gameplay pixels when the *visible state* really changes.
  // Gravity timers may advance on every RAF tick without moving a piece.
  const tickStarted=performance.now();
  const advanced=lineClearFX?false:game.tick(dt);
  const visualChanged=gameVisualStateChanged(prior,game);
  const terminalChanged=terminalLog.advance(now);
  const cursorVisible=terminalLog.cursorVisible(now);
  if((terminalChanged||cursorVisible!==lastTerminalCursorVisible)&&
      !screenManager.isOptions){
   layers.mark('terminal');layers.reason('terminal-log');
  }
  lastTerminalCursorVisible=cursorVisible;
  perf.recordDuration('logic',performance.now()-tickStarted);
  if(lineClearFX&&game.status==='playing'){
   const previousPhase=flashPhase(lineClearFX.elapsed,LINE_FLASH_TOGGLE_MS);
   lineClearFX.elapsed+=dt;
   const finished=lineClearFX.elapsed>=LINE_FLASH_MS;
   if(finished)lineClearFX=null;
   if(finished||flashPhase(lineClearFX.elapsed,LINE_FLASH_TOGGLE_MS)!==previousPhase){
    layers.mark('board');layers.reason('flash');
   }
  }
  if(visualChanged){
   layers.mark('board');
   // Ordinary gravity shifts only the board, not the surrounding UI.
   if(game.score!==prior.score)actions.observeScore();
   if(game.score!==prior.score||game.lines!==prior.lines||
    game.level!==prior.level)layers.mark('sidebar');
   if(game.pieces!==prior.pieces||game.hold!==prior.hold||
    game.current!==prior.piece)layers.mark('sidebar');
   if(game.status!==prior.status){
    layers.mark('base');
    // Stop the input flash, without clearing photons already on the screen.
    buttonFeedback.clear();
   }
   layers.reason('gravity');
   if(game.lines>prior.lines)tone(590,.1);
   else if(game.pieces>prior.pieces)tone(180,.04);
   actions.onGameOver();
  }
  perf.recordGameChanges({advanced,visualChanged});
  if(screenManager.isOptions&&Math.abs(scrollVelocity)>.015){
   const before=modalUI.scroll;
   modalUI.scroll=clamp(modalUI.scroll+scrollVelocity*dt,0,modalUI.maxScroll);
   scrollVelocity*=Math.exp(-dt/190);
   if(modalUI.scroll===before||modalUI.scroll===0||modalUI.scroll===modalUI.maxScroll)scrollVelocity=0;
   else{layers.mark('modal');layers.reason('scroll');}
  }else scrollVelocity=0;
  // Pressed buttons animate their original grayscale Canvas2D artwork.
  const phosphorOn=settings.effects.persistence===true;
  // Decay continues over the *whole display* while gameplay is paused.
  // This GPU-only update does not repaint stationary source canvases.
  if(phosphorOn&&now-lastHistoryRender>=33)
   layers.reason('phosphor-history');
  // Only repaint when the actual source luminance changes (206..255),
  // including the final return to baseline. Phosphor history owns the fade.
  const previousButtonSparks=buttonSparks;
  buttonSparks=buttonFeedback.sample(now,phosphorOn);
  const buttonSignature=buttonSparks.map(s=>[s.x,s.y,s.w,s.h,
   Math.round(s.power*49)].join(':')).join('|');
  if(buttonSignature!==priorButtonSignature){
   priorButtonSignature=buttonSignature;
   // V166: the opaque, cropped controls plane already hides the base
   // canvas' duplicate deck artwork. Avoid reuploading the entire base
   // texture for deck-only button animations. Header and board-status
   // popup buttons still invalidate base; consider BOTH sets so a
   // completed afterglow repaints the last illuminated pixels.
   if(screenManager.paintsModalLayer){
    // Settings cover the fullscreen source completely. Their buttons
    // illuminate ONLY the modal canvas; the base is refreshed on exit.
    if(buttonSparks.length||previousButtonSparks.length)layers.mark('modal');
   }else{
    const affected=buttonFeedbackLayers(
     previousButtonSparks,buttonSparks,layoutInfo||layout());
    // Game controls now use GPU uniform updates, not CanvasTexture
    // invalidation. Header and board-status popup buttons retain the
    // original source-owned brightness and require base painting.
    const canvasAffected=controlsGpuEnabled?
     affected.filter(name=>name!=='controls'):affected;
    if(canvasAffected.length)layers.mark(...canvasAffected);
   }
   layers.reason('button-luminance');
  }
  // Uniform-only updates still render through the unchanged CRT FX,
  // allowing pressed pixels to contribute to bloom and phosphor naturally.
  if(controlsGpuEnabled)controlLighting.update(buttonSparks);
  if(layers.needsRender()){
   const why=layers.beginRender();
   perf.recordRedrawReasons(why);
   const canvasDirty=['base','board','sidebar','controls','terminal','modal'].some(layer=>layers.needs(layer));
   if(canvasDirty||why.some(reason=>reason!=='phosphor-history'))paintGame();
   // Game remains visible immediately; terminal startup runs only in its own branch.
   surface.material.map=texture;
   const syncStarted=performance.now();
   syncFX();
   perf.recordDuration('sync',performance.now()-syncStarted);
   if(surface.visible)textureUploads.upload(texture,'base');
   if(boardPlane.visible)textureUploads.upload(boardTexture,'board');
   if(sidebarPlane.visible)textureUploads.upload(sidebarTexture,'sidebar');
   if(controlsPlane.visible)textureUploads.upload(controlsTexture,'controls');
   if(terminalPlane.visible)textureUploads.upload(terminalTexture,'terminal');
   if(modalPlane.visible)textureUploads.upload(modalTexture,'modal');
   if((!screenManager.hasModal||screenManager.isScores)&&game.status!=='playing')
    textureUploads.upload(boardPopupTexture,'popup');
   renderer.info.reset();
   const renderStarted=perf.startRender();
   // Use time between actual GPU frames, not every gameplay RAF tick.
   // Display-wide phosphor light integrates at ~30 FPS; no raster scan.
   const elapsedRenderMs=lastHistoryRender>0?now-lastHistoryRender:dt;
   compositor.render(Math.max(1,Math.min(100,elapsedRenderMs))/1000);
   lastHistoryRender=now;
   graphicsHealth.rendered(); // A successful real frame completes recovery.
   perf.endRender(renderStarted);
   perf.recordWebglCalls(renderer.info.render.calls);
   const memory=renderer.info.memory;
   perf.setGPUStats({...compositor.passStats(),
    textures:memory?.textures,geometries:memory?.geometries,
    programs:renderer.info.programs?.length});
  }
  perf.recordState(game.status);
  perf.endFrame(frameStarted);
  if(terminalTimer!==null){window.clearTimeout(terminalTimer);terminalTimer=null;}
  if(game.status!=='playing'&&!document.hidden){
   terminalTimer=window.setTimeout(()=>{
    terminalTimer=null;
    if(!document.hidden)requestFrame();
   },terminalLog.nextDelay(now));
  }
  if(game.status==='playing'||layers.needsRender()||Math.abs(scrollVelocity)>.015||
   buttonSparks.length>0||phosphorOn)requestFrame();
 }catch(e){
  graphicsHealth.recordFailure(e);
  // A WebGL loss can interrupt a frame in progress. Its restoration event
  // owns recovery; never leave a persistent fatal banner for that case.
  if(graphicsHealth.status==='lost')return;
  fatal.hidden=false;fatal.textContent='Three.js Tetris frame failed: '+String(e.stack||e);
  console.error(e);
 }
}
// All GPU and input resources belong to this page. They remain allocated
// during rotation, visibility suspension and Safari back/forward-cache navigation.
// Release only when the browser abandons the page without caching it.
const graphicsCleanup=createGraphicsCleanup({
 renderer,compositor,scene,
 textures:[texture,boardTexture,sidebarTexture,controlsTexture,
  terminalTexture,modalTexture,boardPopupTexture],
 canvases:[input,boardCanvas,sidebarCanvas,controlsCanvas,
  terminalCanvas,modalCanvas,boardPopupCanvas],
 getAudioContext:()=>audioCtx
});
appLifecycle=createAppLifecycle({
 onSuspend:()=>{
  // The lifecycle is already suspended: guarded UI actions are blocked.
  // Pause the rules directly and repaint the paused HUD on foreground return.
  if(game.status==='playing'){
   game.pause();
   layers.mark('base','board','controls');
   queueTerminalMessage('GAME: PAUSED','PAUSED');
  }
  inputController?.cancel();scrollVelocity=0;
  buttonFeedback.clear();buttonSparks=[];
  if(terminalTimer!==null){window.clearTimeout(terminalTimer);terminalTimer=null;}
  compositor.resetPersistence();
  cancelPendingFrame();lastTime=performance.now();perf.resetPacing();
  if(audioCtx?.state==='running'){
   try{void audioCtx.suspend().catch(()=>{});}catch(error){}
  }
 },
 onResume:()=>{
  lastTime=performance.now();perf.resetPacing();
  compositor.resetPersistence();
  // Re-measure the safe area after iOS Home Screen and bfcache returns.
  platform.resize(true);
  invalidate('resume');
 },
 onDispose:()=>runCleanupTasks([
  ['animation',cancelPendingFrame],
  ['terminal-timer',()=>{if(terminalTimer!==null)window.clearTimeout(terminalTimer);}],
  ['game-observer',unsubscribeGameEvents],
  ['input',()=>inputController?.dispose()],
  ['vector-tiles',()=>vectorTiles.dispose()],
  ['piece-shadows',()=>pieceShadows.dispose()],
  ['brick-frame',()=>brickFrame.dispose()],
  ['gpu-button-fallback-material',()=>controlsFallbackMaterial.dispose()],
  ['graphics-health',()=>graphicsHealth.detach()],
  ['portrait-gate',()=>portraitGate.removeEventListener('change',onPortraitGateChange)],
  ['platform',()=>platform.stop()],
  ['graphics',()=>graphicsCleanup.dispose()]
 ])
});
function syncAvailability(reason){
 if(document.hidden||pageInCache||portraitGate.matches)appLifecycle.suspend(reason);
 else appLifecycle.resume(reason);
}
function onPortraitGateChange(){syncAvailability('orientation');}
const platform=createPlatformManager({
 window,document,display,safeProbe,baseModuleURL:import.meta.url,
 buildVersion:THREE_BUILD_VERSION,
 getGameStatus:()=>game.status,
 isScreenOpen:()=>screenManager.hasModal,
 canReloadNewBuild:()=>!navigator.serviceWorker?.controller,
 stageWorkerUpdate:async()=>{
  const registration=await navigator.serviceWorker?.getRegistration?.('./');
  if(registration)await registration.update();
 },
 onViewport:({width,height,dpr})=>{
  if(portraitGate.matches)return;
  const unchanged=width===W&&height===H&&dpr===DPR;
  cachedLayout=null;
  if(!unchanged){
   W=width;H=height;DPR=dpr;
   buttonFeedback.clear();buttonSparks=[];
  compositor.resetPersistence();
   input.width=Math.round(W*DPR);input.height=Math.round(H*DPR);
   boardPopupCanvas.width=input.width;boardPopupCanvas.height=input.height;
   g.setTransform(DPR,0,0,DPR,0,0);
   renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
   compositor.resize(W,H,DPR);
   compositor.resetPersistence();
   perf.setViewport(W,H,DPR);
  }
  layers.mark('base','board','sidebar','controls','terminal');
  invalidate('resize');
 },
 onVisibility:()=>syncAvailability('visibility'),
 onPageHide:persisted=>{
  pageInCache=persisted;
  appLifecycle.pageHide(persisted);
 },
 onPageShow:persisted=>{
  if(!persisted)return;
  pageInCache=false;
  syncAvailability('bfcache');
 }
});
graphicsHealth.attach();
platform.start();
portraitGate.addEventListener('change',onPortraitGateChange);
syncAvailability(portraitGate.matches?'orientation':'visibility');
requestFrame();
// One check after initialization also covers standalone cold launches.
void platform.checkForNewBuild();

