/* Reflective TN screen test: the real NOMAD Tetris game and its actual tile
 * SVGs, shown through the physically computed reflective TN profile. */
import {createPhysicalLCD,loadProfile,PHYSICAL_LCD_VERSION} from './physical-lcd.js';
import {Core} from '../tetris/game.js';
import {renderIFragmentSVG} from '../tetris/assets/tiles/smooth-geometry.mjs';

export const APP_VERSION='0.4.0';
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
const modeButtons=[...document.querySelectorAll('[data-mode]')];
function setMode(mode){lcd.setMode(mode);modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 $('modeNote').textContent=mode==='static'?
  'As the datasheet panel: every point is fully on (3.0 V) or off. Art grays darker than 50% switch on.':
  'Digital compromise: each point gets its own voltage, so grays become partial twist. Not a VI-402 feature.';}
modeButtons.forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
setMode('static');

const LIGHT=[
 ['angleDeg','Light angle',0,60,1,v=>v+'° from straight on'],
 ['azimuthDeg','Light from',0,359,1,v=>['top','top right','right','bottom right','bottom','bottom left','left','top left'][Math.round(v/45)%8]+' ('+v+'°)'],
 ['sourceDeg','Light size',0,40,1,v=>v===0?'point':v+'° across'],
 ['exposure','Room brightness',.5,2,.05,v=>Math.round(v*100)+'%']
];
const lightBox=$('lighting');
for(const [key,label,min,max,step,format] of LIGHT){
 const row=document.createElement('label');row.className='row';
 const name=document.createElement('span');name.textContent=label;
 const input=Object.assign(document.createElement('input'),{type:'range',min,max,step,value:lcd.lighting[key]});
 const out=document.createElement('output');out.textContent=format(Number(input.value));
 input.addEventListener('input',()=>{lcd.setLighting({[key]:Number(input.value)});out.textContent=format(Number(input.value));});
 row.append(name,input,out);lightBox.append(row);
}
const DIRECTION=v=>['top','top right','right','bottom right','bottom','bottom left','left','top left'][Math.round(v/45)%8]+' ('+Math.round(v)+'°)';
function sliderRows(box,rows,get,set){
 const outputs={};
 for(const [key,label,min,max,step,format] of rows){
  const row=document.createElement('label');row.className='row';
  const name=document.createElement('span');name.textContent=label;
  const input=Object.assign(document.createElement('input'),{type:'range',min,max,step,value:get()[key]});
  const out=document.createElement('output');out.textContent=format(Number(input.value));
  input.addEventListener('input',()=>{set({[key]:Number(input.value)});out.textContent=format(Number(input.value));});
  row.append(name,input,out);box.append(row);outputs[key]={input,out,format};
 }
 return outputs;
}
const viewControls=sliderRows($('viewing'),[
 ['polarDeg','Your viewing angle',0,80,1,v=>v+'° from straight on'],
 ['azimuthDeg','Viewing from',0,359,1,DIRECTION],
 ['distanceMm','Eye distance',150,600,10,v=>v+' mm']
],()=>lcd.viewing,next=>lcd.setViewing(next));
sliderRows($('environment'),[
 ['celsius','Panel temperature',15,40,1,v=>v+' °C']
],()=>({celsius:lcd.temperature}),next=>lcd.setTemperature(next.celsius));

/* Phone tilt: the eye and the room light stay fixed in the room while the panel
 * turns, so both directions change relative to the glass. */
function rotation(alpha,beta,gamma){
 const r=Math.PI/180,[a,b,g]=[alpha*r,beta*r,gamma*r];
 const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cg=Math.cos(g),sg=Math.sin(g);
 // W3C device orientation: R = Rz(alpha) Rx(beta) Ry(gamma), device -> earth.
 return [[ca*cg-sa*sb*sg,-cb*sa,ca*sg+cg*sa*sb],[cg*sa+ca*sb*sg,ca*cb,sa*sg-ca*cg*sb],[-cb*sg,sb,cb*cg]];
}
const mul=(m,v)=>m.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]);
const transpose=m=>m[0].map((_,i)=>m.map(row=>row[i]));
const screenToDevice=([x,y,z])=>[x,-y,z],deviceToScreen=([x,y,z])=>[x,-y,z];
const toVector=(polar,azimuth)=>{const t=polar*Math.PI/180,a=azimuth*Math.PI/180;return [Math.sin(t)*Math.sin(a),-Math.sin(t)*Math.cos(a),Math.cos(t)];};
const toAngles=([x,y,z])=>({polarDeg:Math.acos(Math.max(-1,Math.min(1,z)))*180/Math.PI,azimuthDeg:((Math.atan2(x,-y)*180/Math.PI)+360)%360});
let tilt=null;
function onOrientation(e){
 if(e.alpha===null||e.beta===null||e.gamma===null)return;
 const R=rotation(e.alpha,e.beta,e.gamma);
 if(!tilt.reference){
  tilt.reference=R;
  tilt.eye=mul(R,screenToDevice(toVector(lcd.viewing.polarDeg,lcd.viewing.azimuthDeg)));
  tilt.light=mul(R,screenToDevice(toVector(lcd.lighting.angleDeg,lcd.lighting.azimuthDeg)));
 }
 const back=transpose(R);
 const eye=toAngles(deviceToScreen(mul(back,tilt.eye))),light=toAngles(deviceToScreen(mul(back,tilt.light)));
 // Light from behind the panel cannot reach the front: hold it at grazing.
 lcd.setViewing({polarDeg:Math.min(80,eye.polarDeg),azimuthDeg:eye.azimuthDeg});
 lcd.setLighting({angleDeg:Math.min(80,light.polarDeg),azimuthDeg:light.azimuthDeg});
 $('tiltNote').textContent='Eye '+Math.round(eye.polarDeg)+'° from '+DIRECTION(eye.azimuthDeg)+
  ' · light '+Math.round(light.polarDeg)+'° from '+DIRECTION(light.azimuthDeg);
}
$('tilt').addEventListener('click',async e=>{
 const button=e.currentTarget;
 if(tilt){window.removeEventListener('deviceorientation',onOrientation);tilt=null;
  button.setAttribute('aria-pressed','false');button.textContent='Use phone tilt';$('tiltNote').textContent='';return;}
 try{
  if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
   if(await DeviceOrientationEvent.requestPermission()!=='granted')throw new Error('Motion access was not allowed.');
  }
  if(typeof DeviceOrientationEvent==='undefined')throw new Error('This device does not report its tilt.');
  tilt={reference:null};
  window.addEventListener('deviceorientation',onOrientation);
  button.setAttribute('aria-pressed','true');button.textContent='Stop phone tilt';
  $('tiltNote').textContent='Hold the phone where you like and tilt it. The starting position counts as the sliders above.';
 }catch(error){$('tiltNote').textContent=error.message;}
});

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
 ['Drive (datasheet)',src.panel.Vop_typ+' V, static'],
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
 ['Temperature','15–40 °C from measured E7 viscosity (Merck) and refractive indices (Li, Wu et al.)']
];
const dl=$('facts');
for(const [k,v] of facts){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;dl.append(dt,dd);}
$('version').textContent='v'+APP_VERSION;
setInterval(()=>{const i=lcd.info();$('status').textContent=i.fps+' fps · '+i.width+'×'+i.height+' px · '+i.pxPerMm.toFixed(1)+' px/mm · '+i.stateFormat+' state · renderer '+PHYSICAL_LCD_VERSION;},1000);

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.__tnScreen=Object.freeze({lcd,game,PANEL,BOARD,CELL});
start();
