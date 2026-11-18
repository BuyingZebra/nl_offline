/* Reflective TN screen test: the real NOMAD Tetris game and its actual tile
 * SVGs, shown through the physically computed reflective TN profile. */
import {createPhysicalLCD,loadProfile,PHYSICAL_LCD_VERSION} from './physical-lcd.js';
import {Core} from '../tetris/game.js';
import {renderIFragmentSVG} from '../tetris/assets/tiles/smooth-geometry.mjs';

export const APP_VERSION='0.5.0';
const CELL=4;                                   // mm per board cell
const BOARD=Object.freeze({x:4,y:6,cols:Core.COLS,rows:Core.ROWS});
const PANEL=Object.freeze({w:BOARD.x*2+BOARD.cols*CELL,h:BOARD.y+BOARD.rows*CELL+6});

const $=id=>document.getElementById(id);
const canvas=$('panel'),stage=$('stage'),bezel=$('bezel'),errorBox=$('error');
const showError=message=>{errorBox.hidden=false;errorBox.textContent=message;};

function loadImage(src){
 return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);
  image.onerror=()=>reject(new Error('Could not load '+src));image.src=src;});
}
// The game's own tiles: J L O S T Z as authored, I as per-cell fragments from
// the game's generator (source position along the strip, piece rotation).
async function loadTiles(){
 const tiles={};
 await Promise.all(['J','L','O','S','T','Z'].map(async k=>{tiles[k]=await loadImage('../tetris/assets/tiles/vector/'+k+'.svg');}));
 tiles.I=[];
 for(let index=0;index<4;index++){
  tiles.I[index]=[];
  for(let rotation=0;rotation<4;rotation++){
   const svg=renderIFragmentSVG({sourceOffset:index,length:1,rotation});
   tiles.I[index][rotation]=await loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
  }
 }
 return tiles;
}
// Same mapping the game uses when it locks an I piece (game.js iSourceIndex).
function iSourceIndex(rotation,x,y){
 if(rotation===0)return y===1?x:null;
 if(rotation===1)return x===2?y:null;
 if(rotation===2)return y===2?3-x:null;
 if(rotation===3)return x===1?3-y:null;
 return null;
}

let lcd,tiles,game;
try{
 const [profile,loaded]=await Promise.all([loadProfile('./profiles/reflective-tn.json'),loadTiles()]);
 tiles=loaded;
 lcd=createPhysicalLCD(canvas,{profile,widthMm:PANEL.w,heightMm:PANEL.h});
}catch(error){showError(error.message);throw error;}

/* ---------- Game: real rules, simple autoplay ---------- */
let seed=20261118;
const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
game=new Core.Game(rng);game.start();
let plan=null,actClock=0;
function choosePlan(){plan={piece:game.current?.id,rotation:Math.floor(rng()*4),x:Math.floor(rng()*(BOARD.cols-2))};}
function autoplay(dt){
 if(game.status==='over'){game.reset();game.start();plan=null;}
 if(game.status!=='playing'||!game.current)return;
 if(!plan||plan.piece!==game.current.id)choosePlan();
 actClock+=dt;
 while(actClock>=70){
  actClock-=70;
  const p=game.current;
  if(!p)break;
  if(p.rotation!==plan.rotation&&p.kind!=='O'){if(!game.rotate(1))plan.rotation=p.rotation;}
  else if(p.x!==plan.x){if(!game.move(Math.sign(plan.x-p.x)))plan.x=p.x;}
  else game.softDrop();
 }
 game.tick(dt);
}

/* ---------- Content: what the controller asks the glass to show ---------- */
function drawCell(ctx,col,row,kind,meta){
 const x=BOARD.x+col*CELL,y=BOARD.y+row*CELL;
 const image=kind==='I'?tiles.I[meta?.sourceIndex??0]?.[meta?.rotation??0]:tiles[kind];
 if(image)ctx.drawImage(image,x,y,CELL,CELL);
}
function drawContent(){
 const ctx=lcd.beginContent();
 ctx.strokeStyle='#000';ctx.lineWidth=.35;
 ctx.strokeRect(BOARD.x-.6,BOARD.y-.6,BOARD.cols*CELL+1.2,BOARD.rows*CELL+1.2);
 for(let r=0;r<BOARD.rows;r++)for(let c=0;c<BOARD.cols;c++){
  const kind=game.board[r][c];
  if(kind)drawCell(ctx,c,r,kind,game.boardMeta[r][c]);
 }
 const p=game.current;
 if(p)for(let iy=0;iy<p.matrix.length;iy++)for(let ix=0;ix<p.matrix[iy].length;ix++){
  const kind=p.matrix[iy][ix],r=p.y+iy,c=p.x+ix;
  if(!kind||r<0||r>=BOARD.rows||c<0||c>=BOARD.cols)continue;
  drawCell(ctx,c,r,kind,kind==='I'?{sourceIndex:iSourceIndex(p.rotation,ix,iy),rotation:p.rotation}:null);
 }
 ctx.fillStyle='#000';ctx.font='700 3.2px ui-monospace,Menlo,Consolas,monospace';ctx.textBaseline='alphabetic';
 ctx.fillText('LINES '+String(game.lines).padStart(3,'0'),BOARD.x,PANEL.h-2.2);
 const score=String(game.score).padStart(6,'0');
 ctx.fillText(score,BOARD.x+BOARD.cols*CELL-ctx.measureText(score).width,PANEL.h-2.2);
}

/* ---------- Loop ---------- */
let running=false,paused=false,lastNow=null,lastFrame=0;
function tick(now){
 if(!running)return;
 const dt=lastNow===null?16:Math.min(100,now-lastNow);lastNow=now;
 // While paused, time stands still (dt = 0) but the panel is still drawn,
 // so a resize or rotation never leaves it blank.
 if(!paused){autoplay(dt);drawContent();lcd.frame(now);lastFrame=now;}
 else{drawContent();lcd.frame(lastFrame);}
 requestAnimationFrame(tick);
}
const start=()=>{if(!running){running=true;lastNow=null;requestAnimationFrame(tick);}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)running=false;else start();});
function fit(){
 const s=getComputedStyle(bezel);
 const px=parseFloat(s.paddingLeft)+parseFloat(s.paddingRight),py=parseFloat(s.paddingTop)+parseFloat(s.paddingBottom);
 lcd.resize(Math.max(40,stage.clientWidth-24-px),Math.max(40,stage.clientHeight-24-py),window.devicePixelRatio||1);
}
new ResizeObserver(fit).observe(stage);fit();

/* ---------- Controls: drive mode and the room's lighting ---------- */
// One ink colour: the datasheet panel switches each point fully on or off.
lcd.setMode('static');
// Default room light: 45 degrees from straight on, from the top-left corner.
lcd.setLighting({angleDeg:45,azimuthDeg:315,sourceDeg:15,exposure:1});

const DIRECTION=v=>['top','top right','right','bottom right','bottom','bottom left','left','top left'][Math.round(v/45)%8]+' ('+Math.round(v)+'°)';
function sliderRows(box,rows,get,set){
 for(const [key,label,min,max,step,format] of rows){
  const row=document.createElement('label');row.className='row';
  const name=document.createElement('span');name.textContent=label;
  const input=Object.assign(document.createElement('input'),{type:'range',min,max,step,value:get()[key]});
  const out=document.createElement('output');out.textContent=format(Number(input.value));
  input.addEventListener('input',()=>{set({[key]:Number(input.value)});out.textContent=format(Number(input.value));});
  row.append(name,input,out);box.append(row);
 }
}
sliderRows($('lighting'),[
 ['angleDeg','Light angle',0,75,1,v=>v+'° from straight on'],
 ['azimuthDeg','Light from',0,359,1,DIRECTION]
],()=>lcd.lighting,next=>lcd.setLighting(next));
sliderRows($('environment'),[
 ['celsius','Panel temperature',15,40,1,v=>v+' °C']
],()=>({celsius:lcd.temperature}),next=>lcd.setTemperature(next.celsius));

$('pause').addEventListener('click',e=>{paused=!paused;e.currentTarget.textContent=paused?'Resume':'Pause';});
$('reset').addEventListener('click',()=>lcd.reset());
$('toggleControls').addEventListener('click',e=>{
 const open=document.body.classList.toggle('controls-closed')===false;e.currentTarget.setAttribute('aria-expanded',String(open));});

/* ---------- Where every number comes from ---------- */
const P=lcd.profile,src=P.sources,der=P.derived;
const facts=[
 ['Panel',src.panel.part],
 ['Response (datasheet)',src.panel.rise_ms_typ+' ms on, '+src.panel.decay_ms_typ+' ms off'],
 ['Contrast (datasheet)',src.panel.contrast_typ+':1'],
 ['Drive (datasheet)',src.panel.Vop_typ+' V, static: one ink colour, each point on or off'],
 ['Liquid crystal',src.liquid_crystal.material],
 ['Cell gap (derived)',der.cell_gap_um+' µm, first transmission maximum'],
 ['Threshold (derived)',der.Vth_theory_V.toFixed(2)+' V'],
 ['Polarizer',src.polarizer.part],
 ['Reflectance (computed)',Math.round(der.luminance_off*100)+'% unlit, '+(der.luminance_on*100).toFixed(1)+'% driven'],
 ['Unlit colour (computed)',der.color_off_hex],
 ['Front-surface reflection',(der.front_surface_reflectance*100).toFixed(1)+'%, solved to match the datasheet contrast'],
 ['Rear glass',src.geometry.glass_mm+' mm, inferred from panel depth'],
 ['Pretilt (assumed)',src.geometry.pretilt_deg+'°, typical value'],
 ['Viewing cone (computed)',(()=>{const c=P.oblique.viewing_cone_CR2_deg;return 'contrast ≥ 2 to '+c.bottom+'° below, '+c.top+'° above, '+c.left+'° sides';})()],
 ['Viewing cone (datasheet)','70° below, 35° above, 70° sides'],
 ['Glare','glossy front surface, Fresnel n = '+P.oblique.front_index+' (assumed untreated polarizer)'],
 ['Temperature','15–40 °C from measured E7 viscosity (Merck) and refractive indices (Li, Wu et al.)'],
 ['Room light (fixed)','15° wide, as a typical lamp; normal room brightness'],
 ['Viewing (fixed)','straight on, eye 300 mm away'],
 ['Bezel (assumed)',lcd.bezelLipMm+' mm above the front polarizer; front glass '+src.geometry.glass_mm+' mm']
];
const dl=$('facts');
for(const [k,v] of facts){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;dl.append(dt,dd);}
$('version').textContent='v'+APP_VERSION;
setInterval(()=>{const i=lcd.info();$('status').textContent=i.fps+' fps · '+i.width+'×'+i.height+' px · '+i.pxPerMm.toFixed(1)+' px/mm · '+i.stateFormat+' state · renderer '+PHYSICAL_LCD_VERSION;},1000);

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.__tnScreen=Object.freeze({lcd,game,PANEL,BOARD,CELL});
start();
