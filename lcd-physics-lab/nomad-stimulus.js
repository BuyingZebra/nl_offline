/* NOMAD v262 LCD-ready visual study.
 * Authentic v262 source strings, grayscale roles, NOMAD logo and SVG tile
 * assets. This fixture is cropped/recomposed for a 160x144 instrument panel;
 * it is NOT a pixel-perfect copy of the complete portrait game layout.
 * Asset SVGs are byte-identical to the original project.
 */
const COLOUR={
 background:'#d9d9d9',panel:'#e7e7e7',ink:'#202020',
 bright:'#222222',weak:'#424242',border:'#363636',grid:'#858585'
};
const paths={
 logo:'./assets/nomad-mark.svg',
 preview:'./assets/I.svg',
 piece:'./assets/O.svg',
 square:'./assets/T.svg'
};
const images={};
export async function loadNomadAssets(){
 await Promise.all(Object.entries(paths).map(([name,url])=>new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>{images[name]=image;resolve();};
  image.onerror=()=>reject(Error('Original NOMAD artwork missing: '+url));
  image.src=url;
 })));
 await document.fonts.ready;
}
function label(ctx,text,x,y,size=7,ink=COLOUR.ink,align='left'){
 ctx.fillStyle=ink;
 ctx.font='700 '+size+'px "Roboto Condensed", sans-serif';
 ctx.textAlign=align;
 ctx.textBaseline='middle';
 ctx.fillText(text,x,y);
}
function frame(ctx,x,y,w,h){
 ctx.fillStyle=COLOUR.panel;ctx.fillRect(x,y,w,h);
 ctx.strokeStyle=COLOUR.border;ctx.lineWidth=.5;ctx.strokeRect(x+.25,y+.25,w-.5,h-.5);
}
export function drawNomadReady(ctx,{lit=true,motion=false,frameNumber=0,scale=4}={}){
 const g=ctx;g.setTransform(scale,0,0,scale,0,0);
 g.fillStyle=COLOUR.background;g.fillRect(0,0,160,144);
 // Reconstructed miniature study crop using NOMAD LCD panel colours.
 frame(g,2,1,156,23);
 g.save();g.globalCompositeOperation='multiply';
 g.drawImage(images.logo,6,4,28,14);g.restore();
 label(g,'NOMAD',40,10,13,COLOUR.ink);
 label(g,'TETRIS SYSTEM',41,19,5.6,COLOUR.weak);
 // inset playfield, guarded by native v262-style brick rails
 g.fillStyle='#c8c8c8';g.fillRect(6,30,108,98);
 g.fillStyle=COLOUR.panel;g.fillRect(8,32,104,94);
 g.strokeStyle='#989898';g.lineWidth=.8;g.strokeRect(7.6,31.6,104.8,94.8);
 for(let y=32;y<125;y+=4.2){
  g.fillStyle=y%3?'#747474':'#999999';
  g.fillRect(2,y,3,3);g.fillRect(116,y,3,3);
 }
 // Actual home-screen menu copy and an app-derived button style.
 label(g,'TETRIS',60,59,16,COLOUR.bright,'center');
 if(lit){
  g.fillStyle=COLOUR.ink;g.fillRect(14,72,92,17);
  g.fillStyle=COLOUR.panel;
  g.beginPath();g.moveTo(18,77);g.lineTo(18,84);g.lineTo(24,80.5);g.closePath();g.fill();
  label(g,'START GAME',66,80.5,9,COLOUR.panel,'center');
 }
 label(g,'SURVIVE THE SOVIET CHALLENGE',60,99,5.1,COLOUR.weak,'center');
 // Authentic tile source: scalable I and O SVGs copied byte-for-byte.
 label(g,'NEXT',123,30,5,COLOUR.weak);
 frame(g,122,34,35,30);
 g.drawImage(images.preview,126,43,26,7);
 label(g,'SCORE',123,69,5,COLOUR.weak);
 frame(g,122,73,35,12);
 label(g,'000000',139,79,8,COLOUR.ink,'center');
 label(g,'LEVEL',123,89,5,COLOUR.weak);
 frame(g,122,93,35,11);label(g,'00',139,99,7,COLOUR.ink,'center');
 label(g,'HOLD',123,110,5,COLOUR.weak);
 frame(g,122,114,35,13);
 // Movement test intentionally changes only real NOMAD source pieces.
 if(motion){
  const py=33+((frameNumber/4|0)%15)*5.5;
  g.drawImage(images.piece,45,py,15,15);
  g.drawImage(images.square,60,py,15,15);
 }
 // Source-like lower controls crop, no functional game input in this lab.
 frame(g,2,132,156,10);
 label(g,'◀',11,137,7,COLOUR.weak);
 label(g,'DROP',57,137,7,COLOUR.ink,'center');
 label(g,'▶',100,137,7,COLOUR.weak);
 label(g,'HOLD',131,137,6,COLOUR.weak,'center');
 g.setTransform(1,0,0,1,0,0);
}


/**
 * Corresponding optical aperture-coverage geometry. Screen-space physical
 * electrodes follow CONTENT, not square Game Boy cells. The mask is drawn
 * with the same original menu coordinates and fonts as drawNomadReady.
 * Black = no driven graphical aperture; white = a driven graphic surface.
 * Canvas antialiasing represents fractional boundary coverage directly.
 */
export function drawNomadCoverage(ctx,{lit=true,motion=false,frameNumber=0,scale=4}={}){
 const g=ctx;
 g.setTransform(scale,0,0,scale,0,0);
 g.fillStyle='#000000';g.fillRect(0,0,160,144);
 // Header branding follows the actual v262 vector mark and lettering.
 g.save();g.globalCompositeOperation='screen';
 g.drawImage(images.logo,6,4,28,14);
 g.restore();
 label(g,'NOMAD',40,10,13,'#ffffff');
 label(g,'TETRIS SYSTEM',41,19,5.6,'#ffffff');
 // Board frame / rails: the panel interior itself is NOT a dark sprite.
 g.strokeStyle='#ffffff';g.lineWidth=.8;g.strokeRect(7.6,31.6,104.8,94.8);
 for(let y=32;y<125;y+=4.2){
   g.fillStyle='#ffffff';
   g.fillRect(2,y,3,3);g.fillRect(116,y,3,3);
 }
 label(g,'TETRIS',60,59,16,'#ffffff','center');
 if(lit){
   g.fillStyle='#ffffff';g.fillRect(14,72,92,17);
   // Negative spaces inside the illuminated button are apertures too:
   // they remain within the continuous shaped surface.
 }
 label(g,'SURVIVE THE SOVIET CHALLENGE',60,99,5.1,'#ffffff','center');
 // The original source SVG is drawn unchanged. Its internal grayscale
 // detailing survives as fractional coverage instead of fake grid cells.
 label(g,'NEXT',123,30,5,'#ffffff');
 g.drawImage(images.preview,126,43,26,7);
 label(g,'SCORE',123,69,5,'#ffffff');
 label(g,'000000',139,79,8,'#ffffff','center');
 label(g,'LEVEL',123,89,5,'#ffffff');
 label(g,'00',139,99,7,'#ffffff','center');
 label(g,'HOLD',123,110,5,'#ffffff');
 if(motion){
   const py=33+((frameNumber/4|0)%15)*5.5;
   g.drawImage(images.piece,45,py,15,15);
   g.drawImage(images.square,60,py,15,15);
 }
 label(g,'◀',11,137,7,'#ffffff');
 label(g,'DROP',57,137,7,'#ffffff','center');
 label(g,'▶',100,137,7,'#ffffff');
 label(g,'HOLD',131,137,6,'#ffffff','center');
 g.setTransform(1,0,0,1,0,0);
}
