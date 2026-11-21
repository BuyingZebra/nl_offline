/* Screen test: the real NOMAD Tetris game and its actual tile SVGs, shown
 * through each screen model (physically computed reflective TN, the Nintendo
 * DMG-01 STN reconstruction from Retro Display Lab, and an IBM 5151 green
 * phosphor CRT). */
import {createPhysicalLCD,loadProfile,PHYSICAL_LCD_VERSION} from './physical-lcd.js';
import {createDMGLCD,DMG_STN_VERSION} from './dmg-stn.js';
import {createCRT,CRT_VERSION} from './crt.js';
import {fourToneSVG} from './four-tone.js';
import {Core} from '../tetris/game.js';
import {renderIFragmentSVG} from '../tetris/assets/tiles/smooth-geometry.mjs';

export const APP_VERSION='0.10.0';
const CELL=4;                                   // mm per board cell
const BOARD=Object.freeze({x:4,y:6,cols:Core.COLS,rows:Core.ROWS});
const PANEL=Object.freeze({w:BOARD.x*2+BOARD.cols*CELL,h:BOARD.y+BOARD.rows*CELL+6});

const $=id=>document.getElementById(id);
let canvas=$('panel');const stage=$('stage'),bezel=$('bezel'),errorBox=$('error');
const showError=message=>{errorBox.hidden=false;errorBox.textContent=message;};

function loadImage(src){
 return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);
  image.onerror=()=>reject(new Error('Could not load '+src));image.src=src;});
}
const svgImage=svg=>loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
// The game's own tiles: J L O S T Z as authored, I as per-cell fragments from
// the game's generator (source position along the strip, piece rotation).
// Each comes as authored and as its 4-tone version.
async function loadTiles(){
 const tiles={original:{I:[]},fourTone:{I:[]}};
 await Promise.all(['J','L','O','S','T','Z'].map(async k=>{
  const text=await (await fetch('../tetris/assets/tiles/vector/'+k+'.svg')).text();
  [tiles.original[k],tiles.fourTone[k]]=await Promise.all([svgImage(text),svgImage(fourToneSVG(text))]);
 }));
 for(let index=0;index<4;index++){
  tiles.original.I[index]=[];tiles.fourTone.I[index]=[];
  for(let rotation=0;rotation<4;rotation++){
   const svg=renderIFragmentSVG({sourceOffset:index,length:1,rotation});
   [tiles.original.I[index][rotation],tiles.fourTone.I[index][rotation]]=await Promise.all([svgImage(svg),svgImage(fourToneSVG(svg))]);
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

/* Screen models. The TN profiles are computed by tools/reflective_tn.py; the
 * DMG-01 profile is copied from Retro Display Lab by tools/dmg01_profile.mjs;
 * the CRT profile is built by tools/crt_p39.py. */
// family: which switch (LCD or CRT) the screen sits under. short: its button.
// sub: the two lines beside the card title. To add a phosphor, add an entry
// with family 'crt'; its button appears automatically.
export const SCREENS=Object.freeze([
 {id:'reflective-tn',family:'lcd',short:'TN static',sub:['Reflective TN','Static drive · VI-402'],
  file:'./profiles/reflective-tn.json',label:'Reflective TN · static drive (VI-402)'},
 {id:'reflective-tn-mux4',family:'lcd',short:'TN 1/4 mux',sub:['Reflective TN','1/4 mux · Lumex'],
  file:'./profiles/reflective-tn-mux4.json',label:'Reflective TN · multiplexed 1/4 duty (Lumex)'},
 {id:'dmg-01-stn',family:'lcd',short:'DMG-01',sub:['Reflective STN','4 shades · DMG-01'],
  file:'./profiles/dmg-01-stn.json',label:'Reflective STN · Nintendo DMG-01, 4 shades (Retro Display Lab)'},
 {id:'crt-5151-p39',family:'crt',short:'P39 green',sub:['Green phosphor','P39 · IBM 5151'],
  file:'./profiles/crt-5151-p39.json',label:'Green phosphor CRT · IBM 5151, P39'}
]);
export const FAMILIES=Object.freeze({lcd:{title:'LCD',picker:'Panel'},crt:{title:'CRT',picker:'Phosphor'}});
const isDMG=P=>P.model==='dmg01-stn',isCRT=P=>P.model==='crt-raster';
const kind=P=>isDMG(P)?'dmg':isCRT(P)?'crt':'tn';
// Four drive levels: draw the 4-tone tiles. TN screens switch on or off: the art as authored.
const tileSet=P=>kind(P)==='tn'?tiles.original:tiles.fourTone;
const profiles=new Map();
async function profileFor(id){
 const screen=SCREENS.find(s=>s.id===id)||SCREENS[0];
 if(!profiles.has(screen.id))profiles.set(screen.id,await loadProfile(screen.file));
 return profiles.get(screen.id);
}
let savedScreen=null;
try{savedScreen=localStorage.getItem('vector-lcd-screen');}catch(error){}

// Each kind of screen has its own renderer; switching kind gives it a fresh canvas.
function createRenderer(profile){
 const options={profile,widthMm:PANEL.w,heightMm:PANEL.h};
 return {dmg:createDMGLCD,crt:createCRT,tn:createPhysicalLCD}[kind(profile)](canvas,options);
}
let lcd,tiles,game;
try{
 const [profile,loaded]=await Promise.all([profileFor(savedScreen||SCREENS[0].id),loadTiles()]);
 tiles=loaded;
 lcd=createRenderer(profile);
}catch(error){showError(error.message);throw error;}

/* ---------- Electrodes: where the glass can switch ----------
 * A point is an electrode if any tile design can switch it on there (darker
 * than 50%, the static drive threshold), or it belongs to the frame or to any
 * digit the counters can show. Multiplexed screens drive every electrode, lit
 * or not, which is what makes unlit segments faintly visible. */
function cellElectrode(size=144){
 const out=document.createElement('canvas');out.width=out.height=size;
 const octx=out.getContext('2d'),mask=octx.createImageData(size,size);
 const temp=document.createElement('canvas');temp.width=temp.height=size;
 const t=temp.getContext('2d',{willReadFrequently:true});
 const designs=[...['J','L','O','S','T','Z'].map(k=>tiles.original[k]),...tiles.original.I.flat()];
 for(const image of designs){
  t.fillStyle='#fff';t.fillRect(0,0,size,size);t.drawImage(image,0,0,size,size);
  const d=t.getImageData(0,0,size,size).data;
  for(let i=0;i<d.length;i+=4)if(d[i]<188){mask.data[i]=mask.data[i+1]=mask.data[i+2]=255;mask.data[i+3]=255;}
 }
 octx.putImageData(mask,0,0);
 return out;
}
const CELL_ELECTRODE=cellElectrode();
const COUNTER_FONT='700 3.2px ui-monospace,Menlo,Consolas,monospace';
function drawElectrodes(ctx){
 ctx.lineWidth=.35;
 ctx.strokeRect(BOARD.x-.6,BOARD.y-.6,BOARD.cols*CELL+1.2,BOARD.rows*CELL+1.2);
 for(let r=0;r<BOARD.rows;r++)for(let c=0;c<BOARD.cols;c++)
  ctx.drawImage(CELL_ELECTRODE,BOARD.x+c*CELL,BOARD.y+r*CELL,CELL,CELL);
 ctx.font=COUNTER_FONT;ctx.textBaseline='alphabetic';
 for(let d=0;d<10;d++){
  ctx.fillText('LINES '+String(d).repeat(3),BOARD.x,PANEL.h-2.2);
  const score=String(d).repeat(6);
  ctx.fillText(score,BOARD.x+BOARD.cols*CELL-ctx.measureText(score).width,PANEL.h-2.2);
 }
}
lcd.setElectrodes(drawElectrodes);

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
 const set=tileSet(lcd.profile);
 const image=kind==='I'?set.I[meta?.sourceIndex??0]?.[meta?.rotation??0]:set[kind];
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
 ctx.fillStyle='#000';ctx.font=COUNTER_FONT;ctx.textBaseline='alphabetic';
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
let infoOpen=false;
const start=()=>{if(!running&&!infoOpen){running=true;lastNow=null;requestAnimationFrame(tick);}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)running=false;else start();});
function fit(){
 if(!stage.clientWidth||!stage.clientHeight)return;   // hidden (Info view): keep the last size
 const s=getComputedStyle(bezel);
 const px=parseFloat(s.paddingLeft)+parseFloat(s.paddingRight),py=parseFloat(s.paddingTop)+parseFloat(s.paddingBottom);
 lcd.resize(Math.max(40,stage.clientWidth-24-px),Math.max(40,stage.clientHeight-24-py),window.devicePixelRatio||1);
}
new ResizeObserver(fit).observe(stage);fit();

/* ---------- Controls: drive mode and the room's lighting ---------- */
// Default room light: 45 degrees from straight on, from the top-left corner.
// Device knobs are kept per screen: each is a different piece of hardware.
// Only controls the real device has appear here (see deviceControls).
const settings={lighting:{angleDeg:45,azimuthDeg:315,sourceDeg:15,exposure:1},celsius:25,knobs:{}};
function knobsFor(P){
 const id=P.profile;
 if(!settings.knobs[id])settings.knobs[id]=
  kind(P)==='dmg'?{contrast:1}:kind(P)==='crt'?{contrast:1,brightness:0}:
  P.drive.uses_electrode_map?{vlcd:P.derived.vlcd_V}:{};
 return settings.knobs[id];
}
function configure(){
 // One ink colour on TN: the datasheet panel switches each point fully on or off.
 lcd.setMode?.('static');
 lcd.setLighting(settings.lighting);
 const [lo,hi]=lcd.profile.temperature?.range_C??[15,40];
 lcd.setTemperature?.(Math.min(hi,Math.max(lo,settings.celsius)));
 const k=knobsFor(lcd.profile);
 if('contrast' in k)lcd.setContrast(k.contrast);
 if('brightness' in k)lcd.setBrightness(k.brightness);
 // VLCD trim: every drive voltage scales with the supply. Other TN panels run at the profile's drive.
 lcd.setDriveGain?.('vlcd' in k?k.vlcd/lcd.profile.derived.vlcd_V:1);
}
configure();

const DIRECTION=v=>['top','top right','right','bottom right','bottom','bottom left','left','top left'][Math.round(v/45)%8]+' ('+Math.round(v)+'°)';
function sliderRows(box,rows,get,set){
 for(const [key,label,min,max,step,format] of rows){
  const row=document.createElement('label');row.className='row';
  const name=document.createElement('span');name.textContent=label;
  const input=Object.assign(document.createElement('input'),{type:'range',min,max,step,value:get()[key]});
  const out=document.createElement('output');
  const show=()=>{out.textContent=format(Number(input.value));
   input.style.setProperty('--fill',((input.value-min)/(max-min)*100)+'%');};
  show();
  input.addEventListener('input',()=>{set({[key]:Number(input.value)});show();});
  row.append(name,input,out);box.append(row);
 }
}
sliderRows($('lighting'),[
 ['angleDeg','Light angle',0,75,1,v=>v+'° from straight on'],
 ['azimuthDeg','Light from',0,359,1,DIRECTION]
],()=>settings.lighting,next=>{settings.lighting={...settings.lighting,...next};lcd.setLighting(next);});
// Ranges follow the screen: each model is only valid over its source's range.
function screenControls(P){
 const K=kind(P),knobs=knobsFor(P),mux=K==='tn'&&Boolean(P.drive.uses_electrode_map);
 const env=$('environment');env.replaceChildren();
 // A CRT makes its own light; the phosphor's decay does not depend on room temperature here.
 $('envNote').hidden=K==='crt';
 if(K!=='crt'){
  const [lo,hi]=P.temperature?.range_C??[15,40];
  sliderRows(env,[['celsius','Panel temperature',lo,hi,1,v=>v+' °C']],()=>({celsius:lcd.temperature}),
   next=>{settings.celsius=next.celsius;lcd.setTemperature(next.celsius);});
 }
 /* ---- On the device: only the controls the real hardware has ---- */
 const dev=$('device');dev.replaceChildren();
 if(K==='dmg')sliderRows(dev,[['contrast','Contrast wheel',P.contrast.min,P.contrast.max,.01,v=>'×'+v.toFixed(2)+' drive']],
  ()=>({contrast:lcd.contrast}),next=>{knobs.contrast=next.contrast;lcd.setContrast(next.contrast);});
 if(K==='crt'){const C=P.controls;sliderRows(dev,[
  ['brightness','Brightness knob',C.brightness.min,C.brightness.max,.005,v=>v===0?'raster off':Math.round(v*100)+'% beam'],
  ['contrast','Contrast knob',C.contrast.min,C.contrast.max,.01,v=>Math.round(v*100)+'% video']
 ],()=>({contrast:lcd.contrast,brightness:lcd.brightness}),next=>{Object.assign(knobs,next);
  if('contrast' in next)lcd.setContrast(next.contrast);if('brightness' in next)lcd.setBrightness(next.brightness);});}
 if(mux){
  // Both rms voltages are fixed fractions of VLCD (1/4 duty, 1/3 bias), so the
  // trim scales the whole drive; the cell, crystal and optics stay as profiled.
  const d=P.derived,kOn=d.on_rms_V/d.vlcd_V,kOff=d.off_rms_V/d.vlcd_V;
  sliderRows(dev,[['vlcd','Contrast trim (VLCD)',2.6,4.2,.01,v=>v.toFixed(2)+' V · '+(v*kOn).toFixed(2)+' / '+(v*kOff).toFixed(2)+' V rms']],
   ()=>({vlcd:knobs.vlcd}),next=>{knobs.vlcd=next.vlcd;lcd.setDriveGain(next.vlcd/d.vlcd_V);});
 }
 $('deviceNote').textContent=K==='dmg'?
  'The DMG-01\'s only picture control: its contrast wheel sets the LCD drive voltage.':
  K==='crt'?'The IBM 5151\'s two front knobs. Brightness lights the whole raster; contrast sets the video signal.':
  mux?'Multiplexed panels run from one supply, VLCD, which products expose as a contrast trimmer. On and off voltages both scale with it ('+
   (d=>(d.on_rms_V/d.vlcd_V).toFixed(3)+' and '+(d.off_rms_V/d.vlcd_V).toFixed(3))(P.derived)+' × VLCD). Default '+P.derived.vlcd_V.toFixed(2)+' V, this cell\'s contrast optimum.':
  'The VI-402 is bare glass on a fixed 3.0 V static drive. It has no controls of its own.';
 $('envNote').textContent=K==='dmg'?
  'Cold crystal is slower and smears more; warm crystal is faster. Valid 10–30 °C, the range of the source model.':
  'Cold liquid crystal is slower; warm crystal is faster and shifts the panel\'s colour.';
 $('lightNote').textContent={
  dmg:'The light moves the bezel shadow and the glare. The DMG\'s reflector shadow keeps its measured offset (light from the upper left).',
  crt:'The screen makes its own light. The room light only greys the glass and the phosphor behind it, and the bezel shades the edges that face it.',
  tn:'Light at an angle enters the glass at one point and leaves at another, casting a shadow under each shape. The bezel frame above the glass also shades the edges that face the light.'}[K];
}

$('pause').addEventListener('click',e=>{paused=!paused;const b=e.currentTarget;
 b.setAttribute('aria-checked',String(!paused));b.lastElementChild.textContent=paused?'Paused':'Running';});
$('reset').addEventListener('click',()=>lcd.reset());
// Demo / Info. The screen stops drawing while Info covers it.
for(const [tab,open] of [[$('tabDemo'),false],[$('tabInfo'),true]])tab.addEventListener('click',()=>{
 infoOpen=open;
 $('tabDemo').setAttribute('aria-selected',String(!open));$('tabInfo').setAttribute('aria-selected',String(open));
 $('demoView').hidden=open;$('infoView').hidden=!open;
 if(open)running=false;else{fit();start();}
});

/* ---------- Where every number comes from ---------- */
function dmgFacts(P){
 const off=P.shadow.offset_dots,R=P.retention,A=P.attribution;
 const facts=[
  ['Model',P.name],
  ['Data','Retro Display Lab ('+A.license+', '+A.copyright+'); used without changing any value'],
  ['Shades','4 drive levels; art is quantized by brightness (white, light, dark, black)'],
  ['Palette (measured)','BGB DMG reality samples: '+P.palette.srgb8.shades.map(c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')).join(', ')],
  ['Drive','1/'+P.panel.dots[1]+' duty passive matrix, '+P.panel.refresh_hz+' Hz frames; rms reconstruction ('+P.drive.nonselect_rms_V+' V nonselect, nominal)'],
  ['Response','STN director drift per frame from a Frank–Oseen/Ericksen–Leslie reduction; about '+Math.round(P.stn.t90_s.darkening*1000)+' ms to 90% at 20 °C'],
  ['Contrast wheel','×'+P.contrast.min+' to ×'+P.contrast.max+' drive; the source tabulates '+P.contrast.conditions.join(', ')],
  ['Temperature',P.temperature.range_C.join('–')+' °C; viscosity activation '+P.temperature.activation_K+' K'],
  ['Sticking','ions charge under dark drive (~'+Math.round(1/(R.charge_per_frame*P.panel.refresh_hz))+' s) and release slowly (~'+Math.round(1/(R.release_per_frame*P.panel.refresh_hz)/60)+' min), leaving a faint image'+(lcd.info().retention?'':' (off: needs 32-bit float targets)')],
  ['Reflector shadow (measured)',Math.round(P.shadow.strength*100)+'% strength, offset '+off[0]+' × '+off[1]+' dot = '+(off[0]*P.panel.active_mm[0]/P.panel.dots[0]*1000).toFixed(0)+' × '+(off[1]*P.panel.active_mm[1]/P.panel.dots[1]*1000).toFixed(0)+' µm'],
  ['Not used','the 160×144 dot grid, its row/column crosstalk and row-latch timing (they need the grid)'],
  ['Glare','glossy front surface, Fresnel n = '+P.oblique.front_index+' (assumed)'],
  ['Bezel (assumed)',lcd.bezelLipMm+' mm lip; front glass '+P.sources.geometry.glass_mm+' mm (DMG value not published)'],
  ['Limits',P.limitations[0]]
 ];
 $('driveNote').textContent='Four shades on one STN panel. Moving pieces smear and fade as the crystal catches up, like the original screen. The contrast wheel changes the drive voltage.';
 return facts;
}
function crtFacts(P){
 const T=P.timing,ph=P.phosphor,d=ph.derived,F=P.faceplate,R=P.raster;
 const facts=[
  ['Monitor','IBM 5151: 11.5 in, 90° CRT, P39 phosphor, etched anti-glare face, brightness and contrast knobs'],
  ['Scan (MDA)',(T.horizontal_hz/1000).toFixed(3)+' kHz lines, '+T.refresh_hz.toFixed(2)+' Hz frames, '+T.lines_visible+' of '+T.lines_total+' lines shown; the panel height is the 350 lines'],
  ['Signal','TTL: video 2/3 + intensity 1/3 of the luminance, 4 levels; free to switch anywhere along a line (no pixels)'],
  ['Phosphor colour','P39 (Zn₂SiO₄:Mn,As), 525 nm, x '+ph.cie_xy[0]+' y '+ph.cie_xy[1]+' (Philips). Outside sRGB: shown on the display\'s green primary'],
  ['Afterglow (derived)','builds up for '+Math.round(d.peak_after_s*1000)+' ms, 10% after '+Math.round(d.t10_s*1000)+' ms, 1% after '+Math.round(d.t1_s*1000)+' ms; JEDEC class long (100 ms–1 s)'],
  ['Afterglow model','Mn²⁺ decay from P1 (20 ms to 10%) fed by bimolecular trap release (IBM, 1985), its time solved from P39\'s measured 30 Hz flicker ratio (US 4,315,190)'],
  ['Spot (measured, similar tube)','σ '+(P.spot.sigma_mm*1000).toFixed(0)+' µm from 1300-line resolution of Philips 31 cm 90° tubes; scanlines '+(R.pitch_mm*1000).toFixed(0)+' µm apart'],
  ['Picture (assumed)',R.height_mm+' mm tall raster (Philips 31 cm useful height); the 5151\'s own size is not published'],
  ['Faceplate','~50% transmission (Philips); n '+F.n+'; '+F.thickness_mm+' mm thick (assumed); halation returns '+(F.halation.total*100).toFixed(1)+'% of the light 18 mm and more away'],
  ['Room light','screen reflectance '+F.screen_reflectance+' (assumed) through the glass twice, plus the etched surface: '+Math.round(F.ambient_reflectance*100)+'% of a white card'],
  ['Brightness (assumed)',P.luminance.full_drive_cd_m2+' cd/m² at full drive (20 fL, the level the Philips and P39 measurements use); room '+P.luminance.room_lux+' lux'],
  ['Exposure','set so the brightest line core at full drive just reaches the display\'s maximum green, as your eye adapts to a lit screen; all brightness ratios are kept'],
  ['Not modelled','screen curvature and geometry, focus and spot growth with beam current, retrace, burn-in']
 ];
 $('driveNote').textContent='The beam sweeps 350 lines 50 times a second. P39 glows long after the beam passes, so moving pieces leave fading trails. Brightness lights the whole raster; contrast sets the signal.';
 return facts;
}
function factsFor(P){
 const facts={dmg:dmgFacts,crt:crtFacts,tn:tnFacts}[kind(P)](P);
 const dl=$('facts');dl.replaceChildren();
 for(const [k,v] of facts){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;dl.append(dt,dd);}
 screenControls(P);
}
function tnFacts(P){
 const src=P.sources,der=P.derived,mux=Boolean(P.drive.uses_electrode_map);
 const facts=[
  ['Panel',mux?src.panel_multiplexed.part+'; cell and response from the '+src.panel.part.split(' (')[0]:src.panel.part],
  ['Response (datasheet)',src.panel.rise_ms_typ+' ms on, '+src.panel.decay_ms_typ+' ms off'+(mux?' (static drive)':'')],
  ['Contrast',mux?der.contrast_final.toFixed(1)+':1 (computed for this drive)':src.panel.contrast_typ+':1 (datasheet)'],
  ['Drive',mux?'1/4 duty, 1/3 bias (Lumex datasheet), '+der.vlcd_V.toFixed(2)+' V AC: '+der.on_rms_V.toFixed(2)+' V rms on, '+der.off_rms_V.toFixed(2)+' V rms off (computed)'
   :src.panel.Vop_typ+' V, static: one ink colour, each point on or off (datasheet)'],
  ['Liquid crystal',src.liquid_crystal.material],
  ['Cell gap (derived)',der.cell_gap_um+' µm, first transmission maximum'],
  ['Threshold (derived)',der.Vth_theory_V.toFixed(2)+' V'],
  ['Polarizer',src.polarizer.part],
  ['Reflectance (computed)',Math.round(der.luminance_off*100)+'% unlit, '+(der.luminance_on*100).toFixed(1)+'% driven'+
   (mux?', '+(der.luminance_off_segment*100).toFixed(1)+'% unlit segment':'')],
  ['Unlit colour (computed)',der.color_off_hex],
  ['Front-surface reflection',(der.front_surface_reflectance*100).toFixed(1)+'%, solved to match the datasheet contrast'],
  ['Rear glass',src.geometry.glass_mm+' mm'+(mux?', confirmed by the Lumex drawing':', inferred from panel depth')],
  ['Pretilt (assumed)',src.geometry.pretilt_deg+'°, typical value'],
  ['Viewing cone (computed)',(()=>{const c=P.oblique.viewing_cone_CR2_deg;return 'contrast ≥ 2 to '+c.bottom+'° below, '+c.top+'° above, '+c.left+'° sides';})()],
  ['Viewing cone (datasheet)','70° below, 35° above, 70° sides'],
  ['Glare','glossy front surface, Fresnel n = '+P.oblique.front_index+' (assumed untreated polarizer)'],
  ['Temperature','15–40 °C from measured E7 viscosity (Merck) and refractive indices (Li, Wu et al.)'],
  ['Room light (fixed)','15° wide, as a typical lamp; normal room brightness'],
  ['Viewing (fixed)','straight on, eye 300 mm away'],
  ['Bezel (assumed)',lcd.bezelLipMm+' mm above the front polarizer; front glass '+src.geometry.glass_mm+' mm']
 ];
 if(mux)facts.splice(4,0,['Drive sources',src.drive.refs.join('; ')],
  ['Supply (computed)',der.vlcd_V.toFixed(2)+' V, the contrast optimum for this cell. The Lumex part\'s '+der.vlcd_datasheet_V.toFixed(1)+' V suits its own crystal; on this one it under-drives the ink (bluish, contrast '+der.contrast_at_datasheet_V.toFixed(1)+':1)']);
 $('driveNote').textContent=mux?
  'One ink colour, multiplexed: every electrode point gets '+der.on_rms_V.toFixed(2)+' V rms when on and '+der.off_rms_V.toFixed(2)+
  ' V rms when off, so unlit segments stay faintly visible. Areas with no electrode get no voltage.':
  'One ink colour, as on the datasheet panel: every point is fully on (3.0 V) or off. Art darker than 50% switches on.';
 return facts;
}
factsFor(lcd.profile);

/* ---------- Screen choice: LCD or CRT, then the panel or phosphor ---------- */
const screenOf=id=>SCREENS.find(sc=>sc.id===id)||SCREENS[0];
const lastOf={};
try{for(const f in FAMILIES)lastOf[f]=localStorage.getItem('vector-lcd-last-'+f);}catch(error){}
function showScreen(sc){
 const F=FAMILIES[sc.family];
 document.body.className=sc.family;
 for(const b of document.querySelectorAll('[data-family]'))b.setAttribute('aria-pressed',String(b.dataset.family===sc.family));
 $('title').textContent=F.title;
 $('subtitle').replaceChildren(...sc.sub.flatMap((line,i)=>i?[document.createElement('br'),line]:[line]));
 // SVG elements have no .hidden property: toggle the attribute.
 $('iconLcd').toggleAttribute('hidden',sc.family!=='lcd');$('iconCrt').toggleAttribute('hidden',sc.family!=='crt');
 $('profileLabel').textContent=F.picker;
 $('infoTitle').textContent=sc.label;
 const box=$('profiles');box.replaceChildren();
 for(const other of SCREENS.filter(o=>o.family===sc.family)){
  const b=Object.assign(document.createElement('button'),{type:'button',textContent:other.short,title:other.label});
  b.setAttribute('aria-pressed',String(other.id===sc.id));
  b.addEventListener('click',()=>selectScreen(other.id));
  box.append(b);
 }
}
let switching=Promise.resolve();
function selectScreen(id){
 switching=switching.then(async()=>{
  const sc=screenOf(id);
  if(sc.id===lcd.profile.profile){showScreen(sc);return;}
  try{
   const p=await profileFor(sc.id);
   if(kind(p)===kind(lcd.profile)){lcd.setProfile(p);configure();}
   else{
    lcd.dispose();
    const next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;
    lcd=createRenderer(p);lcd.setElectrodes(drawElectrodes);configure();fit();
   }
   factsFor(p);showScreen(sc);
   lastOf[sc.family]=sc.id;
   try{localStorage.setItem('vector-lcd-screen',sc.id);localStorage.setItem('vector-lcd-last-'+sc.family,sc.id);}catch(error){}
  }catch(error){showError(error.message);}
 });
 return switching;
}
for(const b of document.querySelectorAll('[data-family]'))b.addEventListener('click',()=>{
 const f=b.dataset.family;
 selectScreen(lastOf[f]&&screenOf(lastOf[f]).family===f?lastOf[f]:SCREENS.find(sc=>sc.family===f).id);
});
showScreen(screenOf(lcd.profile.profile));
$('version').textContent='v'+APP_VERSION;
setInterval(()=>{const i=lcd.info();$('status').textContent=i.fps+' fps · '+i.width+'×'+i.height+' px · '+i.pxPerMm.toFixed(1)+' px/mm · '+i.stateFormat+' state · renderer '+{dmg:'dmg-stn '+DMG_STN_VERSION,crt:'crt '+CRT_VERSION,tn:PHYSICAL_LCD_VERSION}[kind(lcd.profile)];},1000);

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.__tnScreen=Object.freeze({get lcd(){return lcd;},get canvas(){return canvas;},game,PANEL,BOARD,CELL,selectScreen});
start();
