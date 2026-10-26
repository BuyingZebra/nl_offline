/* FIELD ATLAS / TETRIS — V027 screen rebuilt in Canvas2D + THREE.JS.
 * Source remains grayscale; whole-screen GPU processes gameplay, panels and menus.
 * Engine and scores are the unchanged V027 modules, shared with live Tetris.
 */
import * as THREE from 'three';
import {createCompositor} from './compositor.js?v068';
import {createCanvasUI} from './canvas-ui.js?v072';
import {getBuildVersion,parsePublishedBuild,shouldReloadBuild} from './build-version.js?v066';
import {createInputController} from './input-controller.js?v065';
import {createPerfMonitor} from './perf-monitor.js?v062';
import {createTextureUploadProfiler} from './texture-upload-profiler.js?v060';
import {sidebarBounds,controlsBounds,drawCroppedCanvas} from './cropped-ui-layers.js?v062';
import {captureGameVisualState,gameVisualStateChanged,flashPhase} from './game-visual-state.js?v058';
import {formatDebugReport} from './debug-report.js?v062';
import {createDebugClipboard} from './debug-clipboard.js?v055';
import {createModalUI} from './modal-ui.js?v071';
import {createRenderInvalidation} from './render-invalidation.js?v063';
import {createHudDrawing} from './hud-drawing.js?v071';
import {DEFAULT_EFFECTS,DISPLAY_EFFECTS,scanlineChoices,effectSettingValue,effectSettingToStored} from './display-settings-catalog.js?v073';
const Core=window.FieldAtlasBlocks,Scores=window.FieldAtlasScores;
const screen=document.getElementById('screen'),display=document.getElementById('display');
const safeProbe=document.getElementById('safeArea'),initialsInput=document.getElementById('initials');
const fatal=document.getElementById('error');
if(!Core?.Game||!Scores){fatal.hidden=false;fatal.textContent='Tetris core missing';throw Error('Tetris core missing');}
const ScreenLayout=window.FieldAtlasTetrisLayout;
if(!ScreenLayout?.computeLayout){fatal.hidden=false;fatal.textContent='Tetris layout module missing';throw Error('Tetris layout module missing');}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v)),fmt=(n,k=6)=>String(Math.max(0,Math.floor(n))).padStart(k,'0');
const gray=n=>{const v=clamp(Math.round(n),0,255);return 'rgb('+v+','+v+','+v+')'};
// Default/unfilled button faces share the exact near-black background value.
// Lift panels by 3 percentage points of the 0–255 grayscale scale (21 -> 29).
const SCREEN_BLACK='#080808';
const C={bg:SCREEN_BLACK,panel:'#1d1d1d',button:SCREEN_BLACK,solid:'#303030',ink:'#e3e3e3',
 bright:'#cecece',weak:'#aeaeae',border:'#777777',subtleBorder:'#2e2e2e',grid:'#292929',dark:'#060606'};
// Fonts follow Fallout 4's UI/terminal roles; original icons stay intact.
const ICON_FONT='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const FONT='"Roboto Condensed",'+ICON_FONT;
const TERMINAL_FONT='"Share Tech Mono",'+ICON_FONT;
// Persist only user-facing settings; interface treatment is fixed design.
const DEFAULT=DEFAULT_EFFECTS;
const THREE_BUILD_VERSION=getBuildVersion(document);
// The HTML build meta is authoritative; title, accessibility and debug labels derive from it.
document.title='NOMAD — Tetris System V'+THREE_BUILD_VERSION;
display.setAttribute('aria-label','Tetris System — Three.js V'+THREE_BUILD_VERSION);
// Mobile fill-rate guard: 2x reduces a 3x Retina compositor to 4/9 as many pixels.
// Geometry and touch coordinates stay in CSS pixels; the source canvas and GPU
// render target share this cap to avoid uploading unnecessarily large images.
const MAX_RENDER_DPR=2;
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
let W=1,H=1,DPR=1,regions=[],layoutInfo=null,modal=null;
let inputController=null;
let scrollVelocity=0; // logical pixels per millisecond, decays during GPU frames
let queued=false,lastTime=performance.now(),audioCtx=null;
// One owner for layer invalidation, redraw attribution and pending work.
const layers=createRenderInvalidation();
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
let g=baseContext; // UI drawing target: stationary gameplay or small modal canvas.
const modalCanvas=document.createElement('canvas'),modalContext=modalCanvas.getContext('2d',{alpha:true});
// Sharp board popup UI is a separate grayscale layer composed after GPU blur.
const boardPopupCanvas=document.createElement('canvas');
const boardPopupContext=boardPopupCanvas.getContext('2d',{alpha:true});
if(!g||!boardContext||!sidebarContext||!controlsContext||!modalContext||!boardPopupContext){fatal.hidden=false;fatal.textContent='Canvas2D missing';throw Error('Canvas2D missing');}
const texture=new THREE.CanvasTexture(input);
texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
const boardTexture=new THREE.CanvasTexture(boardCanvas);
boardTexture.colorSpace=THREE.SRGBColorSpace;
boardTexture.minFilter=THREE.LinearFilter;boardTexture.magFilter=THREE.LinearFilter;
boardTexture.generateMipmaps=false;
const sidebarTexture=new THREE.CanvasTexture(sidebarCanvas);
const controlsTexture=new THREE.CanvasTexture(controlsCanvas);
for(const t of [sidebarTexture,controlsTexture]){
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

// Upload changed canvases before submitting the composer so that the first
// RenderPass no longer conflates texture transfer and scene rendering.
const textureUploads=createTextureUploadProfiler({renderer,
 onTiming:(kind,elapsed)=>perf.recordUpload(kind,elapsed)});
const compositor=createCompositor({renderer,scene,camera,boardPopupTexture,
 onPassTiming:(name,elapsed)=>perf.recordPass(name,elapsed)});
const {SCANLINE_PRESETS}=compositor;


const brightness={I:.99,J:.8,L:.92,O:.94,S:.76,T:.85,Z:.73};
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
function invalidate(reason='input'){
 layers.reason(reason);requestFrame();
}
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
   layers.mark('board');layers.mark('sidebar');layers.mark('controls');invalidate();
  }
 }
};
function openModal(name){
 const previous=modal;
 modal=name;modalUI.reset();scrollVelocity=0;inputController?.cancel();
 // Repaint the popup when entering or leaving the Top Five view.
 if(previous==='scores'||name==='scores')layers.mark('base');
 if(!modal)regions=baseRegions;
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
 const was=game.status,pieces=game.pieces,lines=game.lines,score=game.score,held=game.hold;
 let ok=false;
 if(type==='left')ok=game.move(-1);
 else if(type==='right')ok=game.move(1);
 else if(type==='cw')ok=game.rotate(1);
 else if(type==='hard')ok=game.hardDrop();
 else if(type==='hold')ok=game.holdPiece();
 else if(type==='pause')ok=game.pause();
 else if(type==='start')ok=game.start();
 if(ok){
  layers.mark('board');layers.mark('controls');
  if(game.pieces!==pieces||game.hold!==held)layers.mark('sidebar');
  if(game.score!==score||game.lines!==lines)layers.mark('controls');
  if(game.status!==was)layers.mark('base'); // refresh READY/PAUSED/OVER popup
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
 game.reset();game.start();layers.mark('board');layers.mark('sidebar');layers.mark('controls');layers.mark('base');overOffered=false;openModal(null);invalidate();
}
function options(){if(game.status==='playing')perform('pause');openModal('options');}
function scores(){if(game.status==='playing')perform('pause');openModal('scores');}
function saveScore(){
 const tag=Scores.initials(initialsInput.value);
 highs=Scores.save(window.localStorage,Scores.add(highs,
  {name:tag,score:game.score,lines:game.lines,level:game.level,at:Date.now()}));
 store('fieldAtlasTetrisInitials',tag);initialsInput.blur();layers.mark('sidebar');openModal('scores');
}
initialsInput.addEventListener('input',()=>{
 initialsInput.value=initialsInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
 invalidate();
});
initialsInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveScore();}});
const {panel,wrapText,text,rect,region,key}=createCanvasUI({
 getContext:()=>g,getRegions:()=>regions,getPressed:()=>inputController?.pressed,
 C,FONT,ICON_FONT,TERMINAL_FONT,LETTER_SPACING_EM,MAIN_ACTION_LABELS,BUTTON_ICON_LABELS,
 MAIN_ACTION_FONT_SIZE,BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE
});
// Do not block first paint on web fonts; redraw once either face loads.
if(document.fonts?.load){
 const specs=['700 20px "Roboto Condensed"','400 20px "Share Tech Mono"'];
 Promise.allSettled(specs.map(spec=>document.fonts.load(spec))).then(results=>{
  if(!results.some(r=>r.status==='fulfilled'&&r.value.length))return;
  layers.mark('base','board','sidebar','controls');
  invalidate('font-ready');
 }).catch(()=>{});
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
function stage(r,drawPieces=true,recordRegion=true){
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
 if(drawPieces){
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
 }
 g.restore();
 if(recordRegion)region(x,y,w,h,'board',{board:true});

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
  // Top Five is composed as a sharp alpha popup AFTER the Gaussian board blur.
  // Do not draw PAUSED/GAME OVER controls beneath the score screen.
  if(modal==='scores'){
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
// Layout calculations are pure, cached, and invalidated on viewport resize.
let cachedInsets=null,cachedLayout=null;
function insets(){
 if(cachedInsets)return cachedInsets;
 const cs=getComputedStyle(safeProbe);
 cachedInsets={
  top:parseFloat(cs.paddingTop)||0,bottom:parseFloat(cs.paddingBottom)||0,
  left:parseFloat(cs.paddingLeft)||0,right:parseFloat(cs.paddingRight)||0
 };
 return cachedInsets;
}
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
 panel,text,rect,key,smallPiece,getGame:()=>game,getHighs:()=>highs,
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
 paintUIRegion(controlsCanvas,controlsContext,controlsPlane,controlsTexture,
  controlsBounds(r,W,H,DPR),'controls',drawControls);
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
 stage(r,false,true);
 drawSidebar(r);
 drawControls(r);
 text('Program: Three.JS',r.off+11,r.footerY,9,C.weak,'left',r.inner*.63,'terminal');
 text('Version: '+THREE_BUILD_VERSION,r.off+r.width-11,r.footerY,9,C.weak,'right',r.inner*.34,'terminal');
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
 if(layers.consume('base')){
  const started=performance.now();
  paintBaseGame();
  perf.recordDuration('base',performance.now()-started);
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
 if(modal&&modal!=='scores'){
  const started=performance.now();
  paintModalOverlay();
  perf.recordDuration('modal',performance.now()-started);
 }
 else{
  surface.visible=true;boardPlane.visible=true;sidebarPlane.visible=true;controlsPlane.visible=true;
  modalPlane.visible=false;scrimPlane.visible=false;
  regions=baseRegions;
 }
}

// NOMAD Display System: one continuous full-width list (no category headings).
// Keep the canonical game effect settings and existing storage keys unchanged.
const SCANLINE_CHOICES=scanlineChoices(SCANLINE_PRESETS);
function settingValue(k){
 return effectSettingValue(k,FX,{ghost:showGhost,sound:soundOn});
}
function setSetting(k,value){
 if(k==='pieceGhost'){
  showGhost=Boolean(value);store('fieldAtlasTetrisGhost',showGhost?'yes':'no');layers.mark('board');
 }else if(k==='sound'){
  soundOn=Boolean(value);store('fieldAtlasTetrisSound',soundOn?'yes':'no');
 }else{
  FX[k]=effectSettingToStored(k,value,clamp);
  persist();
 }
 invalidate();
}
// The menu module owns its scroll, picker and canvas drawing state.
// Only live data and existing Canvas primitives cross this boundary.
const modalUI=createModalUI({
 document,SHAPES:Core.SHAPES,DISPLAY_EFFECTS,SCANLINE_CHOICES,
 getViewport:()=>({W,H,DPR}),layout,insets,
 clearRegions:()=>{regions=[];},getContext:()=>g,
 panel,text,rect,region,key,gray,clamp,fmt,C,UI_SPACE,BUTTON_ICON_FONT_SIZE,
 getFX:()=>FX,activeScanlinePreset:id=>compositor.activeScanlinePreset(id),
 settingValue,persist,invalidate,setScrollVelocity:value=>{scrollVelocity=value;},
 getHighs:()=>highs,getGame:()=>game,getInitialsInput:()=>initialsInput,
 getModal:()=>modal
});
function createDebugReport(){
 const memory=renderer.info.memory;
 const gpu={...compositor.passStats(),textures:memory?.textures,
  geometries:memory?.geometries,programs:renderer.info.programs?.length};
 return formatDebugReport({
  version:THREE_BUILD_VERSION,createdAt:new Date().toISOString(),
  platform:navigator.userAgent,
  viewport:{width:W,height:H,dpr:DPR,deviceDpr:Math.max(1,window.devicePixelRatio||1)},
  game:{status:game.status,level:game.level,score:game.score,lines:game.lines},
  display:{theme,orientation:W>H?'landscape':'portrait',phosphor:FX.phosphor,
   settings:JSON.stringify({...FX,pieceGhost:showGhost,sound:soundOn})},
  gpu,samples:recentPerf,current:perf.currentSnapshot()
 });
}
function copyDebugReport(){
 modalUI.debugCopyState='pending';
 // Clipboard access must start inside the original touch-up user gesture.
 const report=createDebugReport();
 debugClipboard.copyText(report).then(success=>{
  modalUI.debugCopyState=success?'copied':'failed';invalidate();
 },()=>{modalUI.debugCopyState='failed';invalidate();});
}
function paintModalOverlay(){
 // Repaint exactly one active dialog. Always clear the entire backing image
 // so no pixels from a previous modal remain after a menu transition.
 // Options is now its own screen: hide the game rather than darken it.
 const standaloneSettings=modal==='options';
 surface.visible=!standaloneSettings;boardPlane.visible=!standaloneSettings;
 sidebarPlane.visible=!standaloneSettings;controlsPlane.visible=!standaloneSettings;
 const q=modalUI.modalBounds(modal);
 const cw=Math.max(1,Math.round(W*DPR)),ch=Math.max(1,Math.round(H*DPR));
 if(modalCanvas.width!==cw||modalCanvas.height!==ch){
  modalCanvas.width=cw;modalCanvas.height=ch;
 }
 modalContext.setTransform(1,0,0,1,0,0);
 modalContext.clearRect(0,0,cw,ch);
 modalContext.setTransform(DPR,0,0,DPR,0,0);
 modalPlane.visible=true;
 // Don't dim the HUD while the score list occupies the board.
 scrimPlane.visible=!standaloneSettings&&modal!=='scores';
 g=modalContext;
 try{modalUI.paintModal(q);}
 finally{g=baseContext;}
 modalTexture.needsUpdate=true;
 perf.textureChanged('modal');
}
function handleAction(act){
 if(act==='block'||act==='scroll'||act==='board')return;
 if(act==='close'){openModal(null);return;}
 if(act==='copyDebug'){copyDebugReport();return;}
 if(act==='options'){options();return;}
 if(act==='scores'){scores();return;}
 if(act==='theme'){
  theme=theme==='green'?'amber':'green';
  store('fieldAtlasThemeV06',theme);layers.mark('base');invalidate();return;
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
  modalUI.resetSettings();scrollVelocity=0;
  layers.mark('base');invalidate();return;
 }
 if(['start','pause','hold','left','right','cw','hard'].includes(act))perform(act);
}
inputController=createInputController({
 screen,document,window,initialsInput,
 getViewport:()=>({width:W,height:H}),getRegions:()=>regions,
 getModal:()=>modal,getModalView:()=>modalUI.view,
 getOptionsScroll:()=>modalUI.scroll,setOptionsScroll:v=>{modalUI.scroll=v;},
 getOptionsMaxScroll:()=>modalUI.maxScroll,
 setScrollVelocity:v=>{scrollVelocity=v;},
 setBaseDirty:(act)=>{
  if(act==='theme'||act==='options')layers.mark('base');
  else if(act==='board')layers.mark('board');
  else if(act)layers.mark('controls');
 },
 handleAction,perform,setSetting,settingValue,
 toggleScanlineMenu:()=>modalUI.toggleScanlineMenu(),
 chooseScanline:id=>modalUI.chooseScanline(id),openModal,invalidate,clamp
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
  const url=new URL('./three-v027.html?update-check='+now,import.meta.url);
  const reply=await fetch(url,{cache:'no-store'});
  if(!reply.ok)return;
  const published=parsePublishedBuild(await reply.text());
  if(shouldReloadBuild(THREE_BUILD_VERSION,published,{
   hidden:document.hidden,modalOpen:Boolean(modal),gameStatus:game.status})){
   location.reload();
  }
 }catch(e){/* Offline: keep the current playable build. */}
 finally{checkingBuild=false;}
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&game.status==='playing')perform('pause');
 lastTime=performance.now();
 perf.resetPacing();
 if(!document.hidden){invalidate();void checkForNewBuild();}
});
window.addEventListener('pageshow',()=>{void checkForNewBuild();});
window.addEventListener('focus',()=>{void checkForNewBuild();});
// Some standalone sessions never report another foreground transition.
setInterval(()=>{if(!document.hidden)void checkForNewBuild();},60000);
function syncFX(){
 const scoreBounds=modal==='scores'?modalUI.modalBounds('scores'):null;
 const blurredLayout=scoreBounds?.landscapeFallback?{
  ...layoutInfo,boardX:scoreBounds.x,boardY:scoreBounds.y,
  boardW:scoreBounds.w,boardH:scoreBounds.h
 }:layoutInfo;
 compositor.syncFX({fx:FX,theme,width:W,height:H,dpr:DPR,
  boardStatus:game.status,modalOpen:Boolean(modal),
  scoresOverlay:modal==='scores',
  popupStatus:lastPaintedBoardPopupStatus,layoutInfo:blurredLayout});
}
function requestFrame(){
 if(!queued&&!document.hidden){queued=true;requestAnimationFrame(frame);}
}
function frame(now){
 queued=false;
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
   if(game.score!==prior.score||game.lines!==prior.lines||
    game.level!==prior.level)layers.mark('controls');
   if(game.pieces!==prior.pieces||game.hold!==prior.hold||
    game.current!==prior.piece)layers.mark('sidebar');
   if(game.status!==prior.status)layers.mark('base');
   layers.reason('gravity');
   if(game.lines>prior.lines)tone(590,.1);
   else if(game.pieces>prior.pieces)tone(180,.04);
   onOver();
  }
  perf.recordGameChanges({advanced,visualChanged});
  if(modal==='options'&&Math.abs(scrollVelocity)>.015){
   const before=modalUI.scroll;
   modalUI.scroll=clamp(modalUI.scroll+scrollVelocity*dt,0,modalUI.maxScroll);
   scrollVelocity*=Math.exp(-dt/190);
   if(modalUI.scroll===before||modalUI.scroll===0||modalUI.scroll===modalUI.maxScroll)scrollVelocity=0;
   else{layers.reason('scroll');}
  }else scrollVelocity=0;
  if(layers.needsRender()){
   perf.recordRedrawReasons(layers.beginRender());
   paintGame();
   const syncStarted=performance.now();
   syncFX();
   perf.recordDuration('sync',performance.now()-syncStarted);
   // Only initialize canvas textures which will actually be sampled.
   // Each revision is uploaded at most once, with no extra draw commands.
   if(surface.visible)textureUploads.upload(texture,'base');
   if(boardPlane.visible)textureUploads.upload(boardTexture,'board');
   if(sidebarPlane.visible)textureUploads.upload(sidebarTexture,'sidebar');
   if(controlsPlane.visible)textureUploads.upload(controlsTexture,'controls');
   if(modalPlane.visible)textureUploads.upload(modalTexture,'modal');
   if((!modal||modal==='scores')&&game.status!=='playing')
    textureUploads.upload(boardPopupTexture,'popup');
   renderer.info.reset();
   const renderStarted=perf.startRender();
   compositor.render();
   perf.endRender(renderStarted);
   perf.recordWebglCalls(renderer.info.render.calls);
   const memory=renderer.info.memory;
   perf.setGPUStats({...compositor.passStats(),
    textures:memory?.textures,geometries:memory?.geometries,
    programs:renderer.info.programs?.length});
  }
  perf.recordState(game.status);
  perf.endFrame(frameStarted);
  if(game.status==='playing'||layers.needsRender()||Math.abs(scrollVelocity)>.015)requestFrame();
 }catch(e){
  fatal.hidden=false;fatal.textContent='Three.js Tetris frame failed: '+String(e.stack||e);
  console.error(e);
 }
}
function resize(forceLayout=false){
 const b=display.getBoundingClientRect(),w=Math.max(1,Math.round(b.width)),h=Math.max(1,Math.round(b.height));
 const d=Math.min(MAX_RENDER_DPR,Math.max(1,window.devicePixelRatio||1));
 // A pending redraw must never force another allocation at the same size.
 if(w===W&&h===H&&d===DPR){
  if(forceLayout===true){cachedLayout=null;cachedInsets=null;layers.mark('base');layers.mark('board');layers.mark('sidebar');layers.mark('controls');invalidate('resize');}
  return;
 }
 W=w;H=h;DPR=d;cachedLayout=null;cachedInsets=null;
 input.width=Math.round(W*DPR);input.height=Math.round(H*DPR);
 boardPopupCanvas.width=input.width;boardPopupCanvas.height=input.height;
 g.setTransform(DPR,0,0,DPR,0,0);
 renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
 compositor.resize(W,H,DPR);
 perf.setViewport(W,H,DPR);
 layers.mark('base','board','sidebar','controls');invalidate('resize');
}
new ResizeObserver(()=>resize()).observe(display);
window.addEventListener('orientationchange',()=>resize(true));
resize();
requestFrame();
// One check after initialization also covers standalone cold launches.
void checkForNewBuild();

