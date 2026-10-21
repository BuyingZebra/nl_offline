/* FIELD ATLAS / TETRIS — V027 screen rebuilt in Canvas2D + THREE.JS.
 * Source remains grayscale; whole-screen GPU processes gameplay, panels and menus.
 * Engine and scores are the unchanged V027 modules, shared with live Tetris.
 */
import * as THREE from 'three';
import {createCompositor} from './compositor.js?v051';
import {createCanvasUI} from './canvas-ui.js?v052';
import {createInputController} from './input-controller.js?v052';
import {createPerfMonitor} from './perf-monitor.js?v054';
import {formatDebugReport} from './debug-report.js?v055';
import {createDebugClipboard} from './debug-clipboard.js?v055';
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
 bright:'#cecece',weak:'#aeaeae',border:'#6a6a6a',grid:'#292929',dark:'#060606'};
const FONT='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
// Persist only user-facing settings; interface treatment is fixed design.
const DEFAULT=Object.freeze({phosphor:true,bloom:true,bloomStrength:.30,
 ghost:true,ghostX:2,ghostY:0,ghostStrength:22,
 scanlines:true,scanlinePreset:'original',scanlineOpacity:20,
 softness:true,softnessStrength:.64,softnessRadius:3,
 vignette:true,vignetteAmount:.39});
const THREE_BUILD_VERSION='056'; // Increment per approved layout/render test.
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
let W=1,H=1,DPR=1,regions=[],layoutInfo=null,modal=null,modalView=null;
let optionsScroll=0,optionsMaxScroll=0;
let inputController=null;
let scrollVelocity=0; // logical pixels per millisecond, decays during GPU frames
let dirty=true,baseDirty=true,queued=false,lastTime=performance.now(),audioCtx=null;
// Small rolling history: no overlay, network, persistent storage, or console spam.
const recentPerf=[];
const perf=createPerfMonitor({enabled:true,intervalMs:2000,log:()=>{},
 onSample:sample=>{
  recentPerf.push(sample);
  if(recentPerf.length>8)recentPerf.shift();
 }});
const debugClipboard=createDebugClipboard({navigator,document});
let debugCopyState='idle';
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
// All scene meshes are fullscreen textured planes; MSAA cannot smooth a
// geometry silhouette that doesn't exist. Avoid an unused AA backbuffer.
const renderer=new THREE.WebGLRenderer({canvas:screen,antialias:false,alpha:false,powerPreference:'high-performance'});
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

const compositor=createCompositor({renderer,scene,camera,boardPopupTexture});
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
 modal=name;modalView=null;optionsScroll=0;scrollVelocity=0;scanlineMenuOpen=false;debugCopyState='idle';inputController?.cancel();
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
const {panel,wrapText,text,rect,region,key}=createCanvasUI({
 getContext:()=>g,getRegions:()=>regions,getPressed:()=>inputController?.pressed,
 C,FONT,LETTER_SPACING_EM,MAIN_ACTION_LABELS,BUTTON_ICON_LABELS,
 MAIN_ACTION_FONT_SIZE,BUTTON_FONT_SIZE,BUTTON_ICON_FONT_SIZE
});
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
 const gap=UI_SPACE.padGap;
 const cy=r.dy+r.deckPad+UI_SPACE.scoreHeight+r.deckGap,ch=r.buttonH;
 let ey;
 if(r.compactControls){
  // Narrow landscape: maintain usable touch targets by reflowing controls.
  const third=Math.max(0,(pw-2*gap)/3);
  key('◀',px,cy,third,ch,'left',{light:true,repeat:true});
  key('↻',px+third+gap,cy,third,ch,'cw');
  key('▶',px+2*(third+gap),cy,third,ch,'right',{light:true,repeat:true});
  key('DROP',px,cy+ch+gap,pw,ch,'hard',{light:true});
  ey=cy+2*(ch+gap);
 }else{
  const col=Math.max(0,(pw-gap*4)/5);
  key('◀',px,cy,col,ch,'left',{light:true,repeat:true});
  key('DROP',px+col+gap,cy,col*2+gap,ch,'hard',{light:true});
  key('▶',px+col*3+gap*3,cy,col,ch,'right',{light:true,repeat:true});
  key('↻',px+col*4+gap*4,cy,col,ch,'cw');
  ey=cy+ch+r.deckGap;
 }
 // Keep the secondary controls centered at their approved 75% width.
 const extraGap=UI_SPACE.extrasGap;
 const ew=(pw-extraGap)/2*UI_SPACE.buttonWidthScale;
 const groupW=ew*2+extraGap,groupX=px+(pw-groupW)/2;
 key('HOLD',groupX,ey,ew,r.extraH,'hold');
 key('PAUSE',groupX+ew+extraGap,ey,ew,r.extraH,'pause');
 text('Program: Three.JS',r.off+11,r.footerY,9,C.weak,'left',r.inner*.63);
 text('Version: '+THREE_BUILD_VERSION,r.off+r.width-11,r.footerY,9,C.weak,'right',r.inner*.34);
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
 if(game.status!==lastPaintedBoardPopupStatus)baseDirty=true;
 if(baseDirty){paintBaseGame();baseDirty=false;}
 if(modal)paintModalOverlay();
 else{
  surface.visible=true;
  modalPlane.visible=false;scrimPlane.visible=false;
  regions=baseRegions;
 }
 dirty=false;
}

// NOMAD Display System: one continuous full-width list (no category headings).
// Keep the canonical game effect settings and existing storage keys unchanged.
const DISPLAY_EFFECTS=[
 {id:'phosphor',title:'PHOSPHOR COLOR',toggle:'phosphor'},
 {id:'scanlines',title:'CRT SCANLINES',toggle:'scanlines',pattern:true,
  sliders:[['','scanlineOpacity',0,100,1,'%']]},
 {id:'vignette',title:'SCREEN VIGNETTE',toggle:'vignette',
  sliders:[['','vignetteAmount',0,100,1,'%']]},
 {id:'bloom',title:'PHOSPHOR BLOOM',toggle:'bloom',
  sliders:[['','bloomStrength',0,100,1,'%']]},
 {id:'ghost',title:'SIGNAL GHOSTING',toggle:'ghost',
  sliders:[['X','ghostX',-32,32,1,'px'],
   ['Y','ghostY',-32,32,1,'px'],
   ['','ghostStrength',0,100,1,'%']]},
 {id:'softness',title:'EDGE SOFTNESS',toggle:'softness',
  sliders:[['STRENGTH','softnessStrength',0,100,1,'%'],
   ['RADIUS','softnessRadius',0,10,.5,'px']]},
 {id:'piece',title:'GHOST PIECE',toggle:'pieceGhost'},
 {id:'sound',title:'SOUND',toggle:'sound'}
];
const SCANLINE_CHOICES=[{id:'off',name:'OFF'},
 ...SCANLINE_PRESETS.map(p=>({id:p.id,name:p.name}))];
const PREVIEW_SIZE=96,SETTINGS_SQUARE_SIZE=15;
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
 // Display System is its own full-screen view, not a 410px floating dialog.
 // Its title and fixed bottom control still respect the iPhone safe areas.
 if(name==='options')return {w:W,h:H,x:0,y:0,pad,gap,buttonH,
  safeTop:safe.top,safeBottom:safe.bottom};
 const usable=Math.max(0,H-safe.top-safe.bottom);
 const wanted=name==='scores'?2*pad+2*buttonH+5*54+5*gap+14:
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
// All visual previews share the very same T tetromino matrix and base image
// treatment. Per-effect rendering alters ONLY the effect, not the subject.
// The same real T tetromino and dim grayscale phosphor screen appear in every
// effect preview. These neutral pixels are tinted later by the EXISTING GPU.
function effectPreview(id){
 const canvas=document.createElement('canvas');
 canvas.width=PREVIEW_SIZE;canvas.height=PREVIEW_SIZE;
 const p=canvas.getContext('2d');if(!p)return canvas;
 const n=PREVIEW_SIZE;
 p.fillStyle=gray(26);p.fillRect(0,0,n,n);
 p.fillStyle=gray(31);
 for(let v=8;v<n;v+=8){p.fillRect(v,0,1,n);p.fillRect(0,v,n,1);}
 if(id==='phosphor'){
  // A single fully solid inset square; the edge gap is intentionally empty.
  p.fillStyle=gray(173);p.fillRect(13,13,n-26,n-26);
  return canvas;
 }
 if(id==='sound'){
  p.fillStyle=gray(193);
  [16,27,43,54,35,23].forEach((h,i)=>p.fillRect(15+i*12,70-h,7,h));
  return canvas;
 }
 const matrix=Core.SHAPES.T,cells=[],size=20;
 for(let ry=0;ry<matrix.length;ry++)
  for(let rx=0;rx<matrix[ry].length;rx++)
   if(matrix[ry][rx])cells.push([rx,ry]);
 const drawPiece=(ghost=false)=>{
  p.save();if(ghost)p.globalAlpha=.43;
  for(const [cx,cy] of cells){
   const x=18+cx*size,y=28+cy*size;
   if(ghost){
    p.strokeStyle=gray(222);p.lineWidth=2;
    p.strokeRect(x+2,y+2,size-4,size-4);
    p.fillStyle=gray(58);p.fillRect(x+4,y+4,size-8,size-8);
   }else{
    // Bright outline and dark face emulate the approved Fallout thumbnail.
    p.fillStyle=gray(201);p.fillRect(x+1,y+1,size-2,size-2);
    p.fillStyle=gray(94);p.fillRect(x+3,y+4,size-6,size-7);
    p.fillStyle=gray(229);p.fillRect(x+3,y+2,size-6,2);
    p.fillStyle=gray(165);p.fillRect(x+3,y+4,2,size-7);
   }
  }
  p.restore();
 };
 if(id==='ghost'){
  p.save();p.globalAlpha=.33;p.translate(-8,2);drawPiece();p.restore();
  p.save();p.globalAlpha=.48;p.translate(8,-2);drawPiece();p.restore();
  drawPiece();
 }else if(id==='softness'){
  p.save();p.filter='blur(4.2px)';drawPiece();p.restore();
 }else if(id==='bloom'){
  p.save();p.shadowColor=gray(240);p.shadowBlur=22;drawPiece();p.restore();
  p.save();p.globalAlpha=.24;p.filter='blur(7px)';drawPiece();p.restore();
 }else if(id==='piece'){drawPiece(true);}
 else{
  drawPiece();
  if(id==='scanlines'){
   p.fillStyle='rgba(0,0,0,.68)';
   for(let y=0;y<n;y+=5)p.fillRect(0,y,n,2);
  }else if(id==='vignette'){
   const mask=p.createRadialGradient(48,48,8,48,48,66);
   mask.addColorStop(0,'rgba(0,0,0,0)');
   mask.addColorStop(.45,'rgba(0,0,0,.09)');
   mask.addColorStop(1,'rgba(0,0,0,.98)');
   p.fillStyle=mask;p.fillRect(0,0,n,n);
  }
 }
 return canvas;
}
const EFFECT_PREVIEWS=Object.fromEntries(
 DISPLAY_EFFECTS.map(effect=>[effect.id,effectPreview(effect.id)]));
// Match the existing rounded panel outline around every thumbnail, with a
// subtle 1px light-top/left and dark-bottom/right rim for terminal-style bevel.
function drawEffectThumbnail(id,x,y,size){
 panel(x,y,size,size,9,C.panel,C.border);
 const inset=3,inner=Math.max(1,size-2*inset);
 g.save();
 g.beginPath();
 g.roundRect(x+inset,y+inset,inner,inner,Math.min(6,inner/2));
 g.clip();
 g.drawImage(EFFECT_PREVIEWS[id],x+inset,y+inset,inner,inner);
 g.restore();
 g.save();
 g.lineWidth=1;
 g.strokeStyle=gray(128);
 g.beginPath();
 g.moveTo(x+9,y+1.5);g.lineTo(x+size-9,y+1.5);
 g.moveTo(x+1.5,y+9);g.lineTo(x+1.5,y+size-9);
 g.stroke();
 g.strokeStyle=gray(45);
 g.beginPath();
 g.moveTo(x+9,y+size-1.5);g.lineTo(x+size-9,y+size-1.5);
 g.moveTo(x+size-1.5,y+9);g.lineTo(x+size-1.5,y+size-9);
 g.stroke();
 g.restore();
}
function selectedScanlineChoice(){return FX.scanlines?compositor.activeScanlinePreset(FX.scanlinePreset).id:'off';}
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
// Size EVERY row against the most complex effect, as approved. With
// thumbnails centered, their edge-to-edge black space is identical.
const SETTINGS_ROW_GAP=UI_SPACE.unit; // 6px between equal-height row slots.
const SETTINGS_TITLE_H=20,SETTINGS_CONTROL_H=28,SETTINGS_SELECT_H=30;
function settingsPreviewSize(width){
 return Math.min(68,Math.max(56,Math.round(width*.185)));
}
function settingsContentHeight(effect,gap){
 const controls=effect.id==='ghost'||effect.id==='softness'?2:
  effect.sliders?.length?1:0;
 return SETTINGS_TITLE_H+controls*(SETTINGS_CONTROL_H+gap)+
  (effect.pattern?(SETTINGS_SELECT_H+gap):0);
}
function settingsRows(buttonH,gap,width){
 const image=settingsPreviewSize(width),rows=[];let offset=0;
 const maxContentHeight=Math.max(...DISPLAY_EFFECTS.map(effect=>
  settingsContentHeight(effect,gap)));
 // 102px slots at 6px inner gaps, containing 68px image: 40px between
 // thumbnail edges after including the standard 6px between row slots.
 const rowHeight=Math.max(image,maxContentHeight+2*gap);
 for(const effect of DISPLAY_EFFECTS){
  const contentHeight=settingsContentHeight(effect,gap);
  const choiceHeight=Math.max(34,buttonH-8);
  const expanded=effect.pattern&&scanlineMenuOpen;
  const height=rowHeight+(expanded?SCANLINE_CHOICES.length*(choiceHeight+gap):0);
  rows.push({kind:'effect',effect,offset,height,rowHeight,contentHeight,choiceHeight});
  offset+=height+SETTINGS_ROW_GAP;
 }
 return {rows,height:Math.max(0,offset-SETTINGS_ROW_GAP)};
}
// One uniform slider primitive everywhere: 15px square, 6px gaps, real
// persisted values and full remaining row width from image to right inset.
function drawSettingsSlider(x,y,w,setting){
 const [label,field,min,max,step,unit]=setting;
 const size=SETTINGS_SQUARE_SIZE,gap=UI_SPACE.unit;
 const value=Number(settingValue(field));
 const valueText=displayValue(value,step,unit);
 const labelW=label?(label==='X'||label==='Y'?12:label==='RADIUS'?51:65):0;
 const valueW=Math.max(30,Math.ceil(valueText.length*6.8));
 if(label)text(label,x,y,10,C.ink,'left',labelW);
 const trackX=x+labelW+(label?gap:0)+size/2;
 const trackEnd=x+w-valueW-gap-size/2;
 const trackW=Math.max(1,trackEnd-trackX);
 const fraction=clamp((value-min)/(max-min),0,1);
 rect(trackX,y-1.5,trackW,3,C.border);
 rect(trackX,y-1.5,trackW*fraction,3,C.bright);
 rect(trackX+trackW*fraction-size/2,y-size/2,size,size,C.bright);
 text(valueText,x+w,y,10,C.bright,'right',valueW);
 region(trackX-size/2,y-14,trackW+size,28,'slider',
  {field,min,max,step,trackX,trackW,modalControl:true});
}
// Monochrome 16px bug glyph, so no multicolour system emoji enters our CRT.
function drawDebugBug(cx,cy){
 g.save();
 g.strokeStyle=C.ink;g.lineWidth=1.5;g.lineCap='round';g.lineJoin='round';
 g.beginPath();
 g.ellipse(cx,cy+1.5,4.5,6,0,0,Math.PI*2);
 g.moveTo(cx-3,cy-5);g.lineTo(cx-5,cy-8);
 g.moveTo(cx+3,cy-5);g.lineTo(cx+5,cy-8);
 for(const dy of [-3,1,5]){
  g.moveTo(cx-4.5,cy+dy);g.lineTo(cx-8,cy+dy-2);
  g.moveTo(cx+4.5,cy+dy);g.lineTo(cx+8,cy+dy-2);
 }
 g.moveTo(cx-4,cy);g.lineTo(cx+4,cy);
 g.stroke();g.restore();
}
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
 debugCopyState='pending';
 // Clipboard access must start inside the original touch-up user gesture.
 const report=createDebugReport();
 debugClipboard.copyText(report).then(success=>{
  debugCopyState=success?'copied':'failed';invalidate();
 },()=>{debugCopyState='failed';invalidate();});
}
function drawOptions(q){
 // The whole WebGL surface is a separate black terminal page. No outer
 // rounded panel, no translucent scrim and no game artwork beneath it.
 regions=[];region(0,0,W,H,'block');
 const r=layout(),pad=q.pad,gap=q.gap,headH=r.hh;
 rect(0,0,W,H,C.bg);
 // Centre the same content column (<=520px) in portrait and landscape.
 // On phones its X coordinates are identical to the previous dialog,
 // retaining the approved title, X and Restore Defaults geometry.
 const pageW=Math.max(0,Math.min(r.width-2*UI_SPACE.padX,
  UI_SPACE.appMax-2*UI_SPACE.padX));
 const pageX=r.off+(r.width-pageW)/2,headerY=r.hy;
 // Use the very same panel radius, fill, border, header centre, font size,
 // colour, tracking and title inset as the TETRIS SYSTEM home-screen header.
 panel(pageX,headerY,pageW,headH,12,C.panel);
 const titleSize=r.landscape?13:Math.min(21,Math.max(16,W*.05));
 const closeX=pageX+pageW-UI_SPACE.headRightPad-q.buttonH;
 const debugX=closeX-q.buttonH-UI_SPACE.headIconGap;
 text('DISPLAY SYSTEM',pageX+UI_SPACE.headTitleInset,
  headerY+headH/2,titleSize,C.ink,'left',
  Math.max(10,debugX-pageX-UI_SPACE.headTitleInset-gap));
 const headerButtonY=headerY+(headH-q.buttonH)/2;
 key('',debugX,headerButtonY,q.buttonH,q.buttonH,'copyDebug');
 if(debugCopyState==='copied'||debugCopyState==='failed')
  text(debugCopyState==='copied'?'✓':'!',debugX+q.buttonH/2,
   headerButtonY+q.buttonH/2,BUTTON_ICON_FONT_SIZE,C.ink,'center');
 else drawDebugBug(debugX+q.buttonH/2,headerButtonY+q.buttonH/2);
 key('X',closeX,headerButtonY,q.buttonH,q.buttonH,'close');
 const restoreW=Math.min(pageW-2*pad,
  r.boardW*UI_SPACE.overlayButtonWidthScale);
 const restoreY=H-q.safeBottom-gap-r.extraH;
 key('RESTORE DEFAULTS',pageX+(pageW-restoreW)/2,restoreY,
  restoreW,r.extraH,'resetFX',{light:true});
 const contentX=pageX+pad,contentW=pageW-2*pad;
 const top=headerY+headH+gap,bottom=restoreY-gap;
 const visibleH=Math.max(0,bottom-top);
 modalView={x:contentX,y:top,w:contentW,h:visibleH};
 const model=settingsRows(q.buttonH,gap,contentW);
 optionsMaxScroll=Math.max(0,model.height-visibleH);
 optionsScroll=clamp(optionsScroll,0,optionsMaxScroll);
 g.save();g.beginPath();g.rect(contentX,top,contentW,visibleH);g.clip();
 region(contentX,top,contentW,visibleH,'scroll',{scroll:true});
 for(const row of model.rows){
  const y=top+row.offset-optionsScroll;
  if(y+row.height<top||y>bottom)continue;
  const effect=row.effect,previewSize=settingsPreviewSize(contentW);
  // Centre thumbnail and content block independently in the SAME measured row.
  const previewX=contentX+gap;
  const previewY=y+(row.rowHeight-previewSize)/2;
  drawEffectThumbnail(effect.id,previewX,previewY,previewSize);
  const ctrlX=previewX+previewSize+gap;
  const ctrlW=contentX+contentW-gap-ctrlX;
  const blockTop=y+(row.rowHeight-row.contentHeight)/2;
  const titleY=blockTop+SETTINGS_TITLE_H/2;
  settingSquare(ctrlX,titleY-SETTINGS_SQUARE_SIZE/2,
   SETTINGS_SQUARE_SIZE,Boolean(settingValue(effect.toggle)));
  text(effect.title,ctrlX+SETTINGS_SQUARE_SIZE+gap,titleY,12,C.bright,
   'left',Math.max(10,ctrlW-SETTINGS_SQUARE_SIZE-gap));
  region(ctrlX,titleY-17,ctrlW,34,'toggle',
   {field:effect.toggle,modalControl:true});
  const firstY=blockTop+SETTINGS_TITLE_H+gap+SETTINGS_CONTROL_H/2;
  if(effect.id==='ghost'){
   const half=(ctrlW-2*gap)/2;
   drawSettingsSlider(ctrlX,firstY,half,effect.sliders[0]);
   drawSettingsSlider(ctrlX+half+2*gap,firstY,half,effect.sliders[1]);
   drawSettingsSlider(ctrlX,firstY+SETTINGS_CONTROL_H+gap,
    ctrlW,effect.sliders[2]);
  }else if(effect.id==='softness'){
   drawSettingsSlider(ctrlX,firstY,ctrlW,effect.sliders[0]);
   drawSettingsSlider(ctrlX,firstY+SETTINGS_CONTROL_H+gap,
    ctrlW,effect.sliders[1]);
  }else if(effect.sliders?.length){
   drawSettingsSlider(ctrlX,firstY,ctrlW,effect.sliders[0]);
  }
  if(effect.pattern){
   // Pattern picker belongs to Scanlines; no new category or separate row.
   const selectY=blockTop+SETTINGS_TITLE_H+gap+
    SETTINGS_CONTROL_H+gap,selectH=SETTINGS_SELECT_H;
   panel(ctrlX,selectY,ctrlW,selectH,5,C.button,C.border);
   const current=SCANLINE_CHOICES.find(o=>o.id===selectedScanlineChoice());
   const shortNames={horizontal:'HORIZONTAL',aperture:'APERTURE',
    slot:'SLOT MASK',dot:'DOT MASK'};
   text(shortNames[current?.id]||current?.name||'ORIGINAL',
    ctrlX+gap,selectY+selectH/2,10,C.ink,'left',
    Math.max(10,ctrlW-3*gap-BUTTON_ICON_FONT_SIZE));
   settingsExpandArrow(ctrlX+ctrlW-gap-BUTTON_ICON_FONT_SIZE/2,
    selectY+selectH/2,scanlineMenuOpen,C.ink);
   region(ctrlX,selectY,ctrlW,selectH,'patternSelect',{modalControl:true});
   if(scanlineMenuOpen)SCANLINE_CHOICES.forEach((option,i)=>{
    const cy=y+row.rowHeight+i*(row.choiceHeight+gap);
    const chosen=option.id===selectedScanlineChoice();
    settingSquare(contentX+3*gap,
     cy+(row.choiceHeight-SETTINGS_SQUARE_SIZE)/2,
     SETTINGS_SQUARE_SIZE,chosen);
    text(option.name,contentX+5*gap+SETTINGS_SQUARE_SIZE,
     cy+row.choiceHeight/2,11,chosen?C.bright:C.ink,
     'left',contentW-8*gap-SETTINGS_SQUARE_SIZE);
    region(contentX+2*gap,cy,contentW-4*gap,row.choiceHeight,
     'scanlineChoice',{field:option.id,modalControl:true});
   });
  }
 }
 g.restore();
 // Keep scroll input and momentum; omit decorative scrollbar/row separators.
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
 // Options is now its own screen: hide the game rather than darken it.
 const standaloneSettings=modal==='options';
 surface.visible=!standaloneSettings;
 const q=modalBounds(modal);
 const cw=Math.max(1,Math.round(W*DPR)),ch=Math.max(1,Math.round(H*DPR));
 if(modalCanvas.width!==cw||modalCanvas.height!==ch){
  modalCanvas.width=cw;modalCanvas.height=ch;
 }
 modalContext.setTransform(1,0,0,1,0,0);
 modalContext.clearRect(0,0,cw,ch);
 modalContext.setTransform(DPR,0,0,DPR,0,0);
 modalPlane.visible=true;scrimPlane.visible=!standaloneSettings;
 g=modalContext;
 try{paintModal(q);}
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
inputController=createInputController({
 screen,document,window,initialsInput,
 getViewport:()=>({width:W,height:H}),getRegions:()=>regions,
 getModal:()=>modal,getModalView:()=>modalView,
 getOptionsScroll:()=>optionsScroll,setOptionsScroll:v=>{optionsScroll=v;},
 getOptionsMaxScroll:()=>optionsMaxScroll,
 setScrollVelocity:v=>{scrollVelocity=v;},
 setBaseDirty:()=>{baseDirty=true;},
 handleAction,perform,setSetting,settingValue,toggleScanlineMenu,
 chooseScanline,openModal,invalidate,clamp
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
 perf.resetPacing();
 if(!document.hidden){invalidate();void checkForNewBuild();}
});
window.addEventListener('pageshow',()=>{void checkForNewBuild();});
window.addEventListener('focus',()=>{void checkForNewBuild();});
// Some standalone sessions never report another foreground transition.
setInterval(()=>{if(!document.hidden)void checkForNewBuild();},60000);
function syncFX(){
 compositor.syncFX({fx:FX,theme,width:W,height:H,dpr:DPR,
  boardStatus:game.status,modalOpen:Boolean(modal),
  popupStatus:lastPaintedBoardPopupStatus,layoutInfo});
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
   const renderStarted=perf.startRender();
   compositor.render();
   perf.endRender(renderStarted);
   const memory=renderer.info.memory;
   perf.setGPUStats({...compositor.passStats(),
    textures:memory?.textures,geometries:memory?.geometries,
    programs:renderer.info.programs?.length});
  }
  perf.endFrame(frameStarted);
  if(game.status==='playing'||dirty||Math.abs(scrollVelocity)>.015)requestFrame();
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
  if(forceLayout===true){cachedLayout=null;cachedInsets=null;baseDirty=true;invalidate();}
  return;
 }
 W=w;H=h;DPR=d;cachedLayout=null;cachedInsets=null;
 input.width=Math.round(W*DPR);input.height=Math.round(H*DPR);
 boardPopupCanvas.width=input.width;boardPopupCanvas.height=input.height;
 g.setTransform(DPR,0,0,DPR,0,0);
 renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
 compositor.resize(W,H,DPR);
 perf.setViewport(W,H,DPR);
 baseDirty=true;dirty=true;invalidate();
}
new ResizeObserver(()=>resize()).observe(display);
window.addEventListener('orientationchange',()=>resize(true));
resize();
requestFrame();
// One check after initialization also covers standalone cold launches.
void checkForNewBuild();

