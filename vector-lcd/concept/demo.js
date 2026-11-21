/* Vector LCD demo: a segment clock, hopping electrodes, an art electrode and a
 * fine-matrix zone where the same art moves freely. Everything is in mm. */
import {createVectorLCD,DEFAULT_PARAMS,ENGINE_VERSION} from './vector-lcd.js';

export const APP_VERSION='0.1.0';
const PANEL=Object.freeze({w:64,h:100});
const ZONE=Object.freeze({x:3,y:60,w:58,h:37});
const ART_SLOT=Object.freeze({x:39,y:31,w:22,h:22});
const STORAGE_KEY='vector-lcd-demo-params-v1';

const $=id=>document.getElementById(id);
const canvas=$('panel'),stage=$('stage'),bezel=$('bezel'),errorBox=$('error');

function showError(message){errorBox.hidden=false;errorBox.textContent=message;}

function loadParams(){
 try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');}catch(error){return {};}
}
let saveTimer=null;
function saveParams(params){
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(params));}catch(error){}},250);
}

let lcd;
try{lcd=createVectorLCD(canvas,{widthMm:PANEL.w,heightMm:PANEL.h,params:loadParams()});}
catch(error){showError(error.message);throw error;}

/* ---------- Scene geometry (millimetres) ---------- */
function capsule(x1,y1,x2,y2,r){
 const p=new Path2D(),a=Math.atan2(y2-y1,x2-x1);
 p.arc(x1,y1,r,a+Math.PI/2,a+Math.PI*1.5);
 p.arc(x2,y2,r,a-Math.PI/2,a+Math.PI/2);
 p.closePath();
 return p;
}
function circle(x,y,r){const p=new Path2D();p.arc(x,y,r,0,Math.PI*2);return p;}

const DIGIT_SEGMENTS={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgedc',7:'abc',8:'abcdefg',9:'abcdfg'};
function addDigit(index,x,y){
 const w=11,h=20,t=2.4,r=t/2,g=.55;
 const segments={
  a:[x+r+g,y+r,x+w-r-g,y+r],
  g:[x+r+g,y+h/2,x+w-r-g,y+h/2],
  d:[x+r+g,y+h-r,x+w-r-g,y+h-r],
  f:[x+r,y+r+g,x+r,y+h/2-g],
  b:[x+w-r,y+r+g,x+w-r,y+h/2-g],
  e:[x+r,y+h/2+g,x+r,y+h-r-g],
  c:[x+w-r,y+h/2+g,x+w-r,y+h-r-g]
 };
 // Segment lines are shared across digits, as in a multiplexed segment LCD.
 for(const [name,[x1,y1,x2,y2]] of Object.entries(segments))
  lcd.addElectrode({id:'d'+index+name,line:'seg-'+name,path:capsule(x1,y1,x2,y2,r)});
}
const CLOCK_Y=6;
[3.5,16.5,36.5,49.5].forEach((x,i)=>addDigit(i,x,CLOCK_Y));
lcd.addElectrode({id:'colon-top',line:'colon',path:circle(32,CLOCK_Y+6.5,1.25)});
lcd.addElectrode({id:'colon-bottom',line:'colon',path:circle(32,CLOCK_Y+13.5,1.25)});

const HOPS=7;
for(let i=0;i<HOPS;i++){
 const u=i/(HOPS-1),x=6+u*28,y=52-18*(1-(2*u-1)**2);
 lcd.addElectrode({id:'hop'+i,line:i%2?'hop-odd':'hop-even',path:circle(x,y,2.4)});
}

/* Default art: an original four-point spark with a hole and a mid-gray ring. */
function sparkArt(ctx,w,h){
 const s=Math.min(w,h);
 ctx.save();ctx.translate(w/2,h/2);ctx.scale(s/2,s/2);
 ctx.beginPath();
 const k=.2;
 ctx.moveTo(0,-.96);ctx.quadraticCurveTo(k,-k,.96,0);ctx.quadraticCurveTo(k,k,0,.96);
 ctx.quadraticCurveTo(-k,k,-.96,0);ctx.quadraticCurveTo(-k,-k,0,-.96);ctx.closePath();
 ctx.moveTo(.17,0);ctx.arc(0,0,.17,0,Math.PI*2,true);
 ctx.fillStyle='#000';ctx.fill('evenodd');
 ctx.beginPath();ctx.arc(0,0,.62,0,Math.PI*2);ctx.lineWidth=.07;ctx.strokeStyle='#9a9a9a';ctx.stroke();
 ctx.restore();
}
let art=sparkArt;
function setArtElectrode(){
 lcd.addElectrode({id:'art',line:'art',art:{source:art,...ART_SLOT}});
}
setArtElectrode();

let hold=false,paused=false,pausedAt=0,timeOffset=0;
function drawZone(ctx,t,tools){
 const size=16;
 let x,y,rotation;
 if(hold){x=ZONE.x+(ZONE.w-size)/2;y=ZONE.y+3;rotation=0;}
 else{
  x=ZONE.x+(ZONE.w-size)*(.5+.5*Math.sin(t*.9));
  y=ZONE.y+1+(ZONE.h-size-9)*(.5+.5*Math.sin(t*1.7));
  rotation=t*.8;
 }
 ctx.save();ctx.translate(x+size/2,y+size/2);ctx.rotate(rotation);
 ctx.drawImage(tools.art(art,size,size,true),-size/2,-size/2,size,size);
 ctx.restore();
 ctx.fillStyle=tools.level(1);
 ctx.font='700 5px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
 const text=hold?'HOLD':'VECTOR LCD',width=ctx.measureText(text).width;
 const tx=hold?ZONE.x+(ZONE.w-width)/2:ZONE.x+ZONE.w-((t*9)%(ZONE.w+width));
 ctx.fillText(text,tx,ZONE.y+ZONE.h-2.2);
}
lcd.setZone(ZONE,drawZone);

function updateScene(t){
 const now=new Date();
 const digits=hold?'8888':String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0');
 [...digits].forEach((digit,i)=>{
  for(const s of 'abcdefg')lcd.setOn('d'+i+s,DIGIT_SEGMENTS[digit].includes(s));
 });
 const colon=hold||now.getMilliseconds()<500;
 lcd.setOn('colon-top',colon);lcd.setOn('colon-bottom',colon);
 const step=Math.floor(t/.18)%(2*(HOPS-1)),position=step<HOPS?step:2*(HOPS-1)-step;
 for(let i=0;i<HOPS;i++)lcd.setOn('hop'+i,hold||i===position);
 lcd.setOn('art',hold||(t%2)<1.2);
}

/* ---------- Loop ---------- */
let running=false;
function tick(now){
 if(!running)return;
 if(!paused){
  const t=(now-timeOffset)/1000;
  updateScene(t);
  lcd.frame(now);
 }
 requestAnimationFrame(tick);
}
function start(){if(running)return;running=true;requestAnimationFrame(tick);}
function stop(){running=false;}
document.addEventListener('visibilitychange',()=>document.hidden?stop():start());

function fit(){
 const style=getComputedStyle(bezel);
 const padX=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
 const padY=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
 lcd.resize(Math.max(40,stage.clientWidth-24-padX),Math.max(40,stage.clientHeight-24-padY),window.devicePixelRatio||1);
}
new ResizeObserver(fit).observe(stage);
fit();

/* ---------- Controls ---------- */
const EFFECTS=[
 ['response','Response'],['ghost','Ghost segments'],['crosstalk','Crosstalk'],
 ['shadow','Reflector shadow'],['retention','Retention'],['softEdges','Soft edges']
];
const SLIDERS=[
 ['Liquid crystal',[
  ['relaxMs','Relaxation time',20,800,5,v=>v+' ms'],
  ['thresholdV','Threshold',.3,.8,.01,v=>v.toFixed(2)+' Vop'],
  ['steepnessV','Transition width',.02,.2,.005,v=>v.toFixed(3)+' Vop']]],
 ['Drive',[
  ['bias','Bias ratio',0,.5,.01,v=>v.toFixed(2)+(v>0?' (1/'+(1/v).toFixed(1)+')':'')],
  ['crosstalkAmount','Crosstalk',0,.6,.01,v=>Math.round(v*100)+'%']]],
 ['Reflector shadow',[
  ['lightAngleDeg','Light angle',0,75,1,v=>v+'°'],
  ['lightAzimuthDeg','Light from',0,360,1,v=>v+'°'],
  ['glassMm','Rear glass',0,2,.05,v=>v.toFixed(2)+' mm'],
  ['shadowStrength','Shadow strength',0,.9,.01,v=>Math.round(v*100)+'%'],
  ['lightSpread','Light spread',0,1,.01,v=>Math.round(v*100)+'%']]],
 ['Retention',[
  ['retentionStrength','Strength',0,.5,.01,v=>Math.round(v*100)+'%'],
  ['retentionChargeS','Charge time',1,120,1,v=>v+' s'],
  ['retentionReleaseS','Release time',1,120,1,v=>v+' s']]],
 ['Panel',[
  ['edgeSoftnessMm','Edge softness',0,.4,.01,v=>v.toFixed(2)+' mm'],
  ['inkDepth','Contrast',.3,1,.01,v=>Math.round(v*100)+'%']]]
];
const TINTS=[
 ['Gray-green',[164,170,146],[30,36,26]],
 ['Neutral',[176,178,172],[26,26,28]],
 ['Yellow-green',[172,176,122],[34,40,18]],
 ['Blue-gray',[158,168,174],[22,30,46]]
];

const controls=$('controlsBody');
const inputs=new Map();
function el(tag,attrs={},children=[]){
 const node=document.createElement(tag);
 for(const [k,v] of Object.entries(attrs)){if(k==='text')node.textContent=v;else node.setAttribute(k,v);}
 node.append(...children);return node;
}
function apply(change){lcd.setParams(change);saveParams(lcd.params);sync();}

const effectRow=el('div',{class:'chips',role:'group','aria-label':'Effects'});
for(const [key,label] of EFFECTS){
 const box=el('input',{type:'checkbox',id:'fx-'+key});
 box.addEventListener('change',()=>apply({[key]:box.checked}));
 effectRow.append(el('label',{class:'chip',for:'fx-'+key},[box,el('span',{text:label})]));
 inputs.set(key,{box});
}
controls.append(el('h2',{text:'Effects'}),effectRow);

for(const [title,rows] of SLIDERS){
 const group=el('div',{class:'group'});
 for(const [key,label,min,max,step,format] of rows){
  const range=el('input',{type:'range',id:'p-'+key,min,max,step});
  const output=el('output',{for:'p-'+key});
  range.addEventListener('input',()=>apply({[key]:Number(range.value)}));
  group.append(el('label',{class:'row',for:'p-'+key},[el('span',{text:label}),range,output]));
  inputs.set(key,{range,output,format});
 }
 controls.append(el('h2',{text:title}),group);
}

const tint=el('select',{id:'tint','aria-label':'Panel tint'});
TINTS.forEach(([name],i)=>tint.append(el('option',{value:String(i),text:name})));
tint.addEventListener('change',()=>{const [,background,ink]=TINTS[Number(tint.value)];apply({background,ink});});
controls.append(el('label',{class:'row',for:'tint'},[el('span',{text:'Tint'}),tint,el('output')]));

function sync(){
 const p=lcd.params;
 for(const [key,ui] of inputs){
  if(ui.box)ui.box.checked=p[key];
  else{ui.range.value=String(p[key]);ui.output.textContent=ui.format(p[key]);}
 }
 const match=TINTS.findIndex(([,bg])=>bg.every((c,i)=>c===p.background[i]));
 tint.value=String(Math.max(0,match));
}
sync();

/* ---------- Actions ---------- */
const holdButton=$('hold'),pauseButton=$('pause');
holdButton.addEventListener('click',()=>{
 hold=!hold;holdButton.setAttribute('aria-pressed',String(hold));
 holdButton.textContent=hold?'Release hold':'Hold test';
});
pauseButton.addEventListener('click',()=>{
 paused=!paused;
 if(paused)pausedAt=performance.now();else timeOffset+=performance.now()-pausedAt;
 pauseButton.textContent=paused?'Resume':'Pause';
});
$('reset').addEventListener('click',()=>lcd.resetState());
$('defaults').addEventListener('click',()=>apply({...DEFAULT_PARAMS}));
$('toggleControls').addEventListener('click',event=>{
 const open=document.body.classList.toggle('controls-closed')===false;
 event.currentTarget.setAttribute('aria-expanded',String(open));
});

/* SVG art: dark areas are driven, light areas sit at the bias, transparent
 * areas have no electrode. Missing width/height is taken from the viewBox so
 * every browser can size it. */
$('artFile').addEventListener('change',async event=>{
 const file=event.target.files?.[0];
 event.target.value='';
 if(!file)return;
 try{
  let blob=file;
  if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name)){
   const doc=new DOMParser().parseFromString(await file.text(),'image/svg+xml');
   const svg=doc.documentElement;
   if(svg.nodeName.toLowerCase()!=='svg')throw new Error('That file is not an SVG');
   const box=(svg.getAttribute('viewBox')||'').split(/[\s,]+/).map(Number);
   if(!svg.getAttribute('width')||!svg.getAttribute('height')){
    const [w,h]=box.length===4&&box[2]>0&&box[3]>0?[box[2],box[3]]:[512,512];
    svg.setAttribute('width',String(w));svg.setAttribute('height',String(h));
   }
   blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'});
  }
  const url=URL.createObjectURL(blob);
  const image=new Image();
  image.src=url;
  await image.decode();
  art=image;
  setArtElectrode();
  $('artName').textContent=file.name;
 }catch(error){showError('Could not load that art: '+error.message);}
});
$('defaultArt').addEventListener('click',()=>{art=sparkArt;setArtElectrode();$('artName').textContent='Built-in spark';});

/* ---------- Status ---------- */
$('version').textContent='v'+APP_VERSION;
setInterval(()=>{
 const info=lcd.info();
 $('status').textContent=info.fps+' fps · '+info.width+'×'+info.height+' px · '+
  info.pxPerMm.toFixed(1)+' px/mm · '+info.stateFormat+' state · engine '+ENGINE_VERSION;
},1000);

if('serviceWorker' in navigator){
 navigator.serviceWorker.register('../sw.js',{scope:'../'}).catch(()=>{});
}

// Small debugging hook for automated checks.
window.__vectorLCD=Object.freeze({lcd,setHold(v){hold=Boolean(v);},PANEL,ZONE,ART_SLOT});
start();
