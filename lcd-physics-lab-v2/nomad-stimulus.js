/* NOMAD LCD laboratory v2 — a single scene-geometry pipeline.
 * Visible artwork and coverage come from precisely the same draw calls.
 * The mask is not an independently reconstructed scene. */
const COLOUR={
 background:'#d9d9d9',panel:'#e7e7e7',ink:'#202020',
 bright:'#222222',weak:'#424242',border:'#363636',grid:'#858585'
};
const paths={
 logo:'../lcd-physics-lab/assets/nomad-mark.svg',
 preview:'../lcd-physics-lab/assets/I.svg',
 piece:'../lcd-physics-lab/assets/O.svg',
 square:'../lcd-physics-lab/assets/T.svg'
};
const images={};
export async function loadNomadAssets(){
 await Promise.all(Object.entries(paths).map(([name,url])=>new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>{images[name]=image;resolve();};
  image.onerror=()=>reject(Error('NOMAD source asset missing: '+url));
  image.src=url;
 })));
 await document.fonts.ready;
}
function paint(ctx,{lit=true,motion=false,frameNumber=0,scale=4,mask=false}={}){
 const g=ctx;g.setTransform(scale,0,0,scale,0,0);
 g.globalCompositeOperation='source-over';g.filter='none';
 // Paint classes distinguish active physical graphics from passive backings.
 function block(x,y,w,h,color,active=false){
  g.fillStyle=mask?(active?'#fff':'#000'):color;g.fillRect(x,y,w,h);
 }
 function stroke(x,y,w,h,color,width=0.5){
  g.strokeStyle=mask?'#fff':color;g.lineWidth=width;
  g.strokeRect(x,y,w,h);
 }
 function label(text,x,y,size=7,color=COLOUR.ink,align='left',active=true){
  g.fillStyle=mask?(active?'#fff':'#000'):color;
  g.font='700 '+size+'px "Roboto Condensed", sans-serif';
  g.textAlign=align;g.textBaseline='middle';
  g.fillText(text,x,y);
 }
 function sprite(name,x,y,w,h,{multiply=false}={}){
  g.save();
  if(mask){g.filter='brightness(0) invert(1)';g.globalCompositeOperation='source-over';}
  else if(multiply)g.globalCompositeOperation='multiply';
  g.drawImage(images[name],x,y,w,h);g.restore();
 }
 function frame(x,y,w,h){
  block(x,y,w,h,COLOUR.panel,false);
  stroke(x+0.25,y+0.25,w-0.5,h-0.5,COLOUR.border,.5);
 }
 block(0,0,160,144,COLOUR.background,false);
 frame(2,1,156,23);
 sprite('logo',6,4,28,14,{multiply:true});
 label('NOMAD',40,10,13,COLOUR.ink);
 label('TETRIS SYSTEM',41,19,5.6,COLOUR.weak);
 block(6,30,108,98,'#c8c8c8',false);
 block(8,32,104,94,COLOUR.panel,false);
 stroke(7.6,31.6,104.8,94.8,'#989898',.8);
 for(let y=32;y<125;y+=4.2){
  const color=y%3?'#747474':'#999999';
  block(2,y,3,3,color,true);block(116,y,3,3,color,true);
 }
 label('TETRIS',60,59,16,COLOUR.bright,'center');
 if(lit){
  block(14,72,92,17,COLOUR.ink,true);
  // True knockouts: reverse text and play symbol cut through the mask.
  g.fillStyle=mask?'#000':COLOUR.panel;
  g.beginPath();g.moveTo(18,77);g.lineTo(18,84);g.lineTo(24,80.5);
  g.closePath();g.fill();
  label('START GAME',66,80.5,9,COLOUR.panel,'center',false);
 }
 label('SURVIVE THE SOVIET CHALLENGE',60,99,5.1,COLOUR.weak,'center');
 label('NEXT',123,30,5,COLOUR.weak);
 frame(122,34,35,30);
 sprite('preview',126,43,26,7);
 label('SCORE',123,69,5,COLOUR.weak);
 frame(122,73,35,12);
 label('000000',139,79,8,COLOUR.ink,'center');
 label('LEVEL',123,89,5,COLOUR.weak);
 frame(122,93,35,11);label('00',139,99,7,COLOUR.ink,'center');
 label('HOLD',123,110,5,COLOUR.weak);
 frame(122,114,35,13);
 if(motion){
  const py=33+((frameNumber/4|0)%15)*5.5;
  sprite('piece',45,py,15,15);sprite('square',60,py,15,15);
 }
 frame(2,132,156,10);
 label('◀',11,137,7,COLOUR.weak);
 label('DROP',57,137,7,COLOUR.ink,'center');
 label('▶',100,137,7,COLOUR.weak);
 label('HOLD',131,137,6,COLOUR.weak,'center');
 g.filter='none';g.globalCompositeOperation='source-over';
 g.setTransform(1,0,0,1,0,0);
}
export function drawNomadReady(ctx,opts={}){paint(ctx,{...opts,mask:false});}
export function drawNomadCoverage(ctx,opts={}){paint(ctx,{...opts,mask:true});}
