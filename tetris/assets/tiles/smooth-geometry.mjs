/* NOMAD smooth assets V2 — authored layered geometry, not pixel-contour tracing.
 * Monochrome shapes only. The game compositor owns colour, glow and persistence.
 * Rectangle layers share boundaries with no rounded-edge gaps. O uses a real
 * triangular highlight. Dot positions are deterministic and anchored in the
 * source 4-cell I-piece coordinate system, even after fragmentation.
 */
import {PIECE_LUMINANCE} from '../../piece-luminance.js';

const SIGNATURES=Object.freeze({
 I:'e36b726d',O:'07a1e19f',T:'99c7a755',S:'8e460bc0',
 Z:'daa7d6f1',J:'efca11ff',L:'6134c0ae'
});
export const I_SOURCE_CELLS=4;
const cl=v=>Math.max(0,Math.min(255,Math.round(v)));
const color=v=>{const a=cl(v);return 'rgb('+a+','+a+','+a+')';};
const fmt=v=>Number(v.toFixed(3)).toString();
const rect=(x,y,w,h,v)=>'<rect x="'+fmt(x)+'" y="'+fmt(y)+'" width="'+fmt(w)+
 '" height="'+fmt(h)+'" fill="'+color(v)+'"/>';
const poly=(points,v)=>'<polygon points="'+points.map(p=>p.map(fmt).join(',')).join(' ')+
 '" fill="'+color(v)+'"/>';
const circ=(x,y,r,v)=>'<circle cx="'+fmt(x)+'" cy="'+fmt(y)+
 '" r="'+fmt(r)+'" fill="'+color(v)+'"/>';
const signature=k=>'data-design="nomad-v118" data-kind="'+k+
 '" data-style="vector" data-signature="'+SIGNATURES[k]+'"';
const shell=(kind,w,h,shapes,extra='')=>
 '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+
 '" width="'+w+'" height="'+h+'" shape-rendering="geometricPrecision" '+
 signature(kind)+extra+'>\n<title>NOMAD '+kind+
 ' — layered smooth geometry from approved V118 artwork</title>\n'+
 shapes.join('\n')+'\n</svg>\n';
function frame(w,h,L,fill){
 // One outer face; attached straight-edged rectangular highlight layers.
 // No separately rounded pixel paths and therefore no dark pinholes.
 return [
  rect(1,1,w-2,h-2,fill),
  rect(1,1,w-2,1,L+25),rect(1,1,1,h-2,L+25),
  rect(1,h-2,w-2,1,L-35),rect(w-2,1,1,h-2,L-39)
 ];
}
const J_DOTS=[[3,3],[7,3],[9,4],[5,5],[3,7],[8,7],[5,9],[9,9]];
function jitter(i,axis){
 // Stable subpixel scatter, not randomness during repaint.
 const n=(i*37+axis*19+13)%17;
 return (n-8)*0.026;
}
export function originalJDotCenters(){
 return J_DOTS.map(([x,y],i)=>Object.freeze({
  x:x+.5+jitter(i,0),y:y+.5+jitter(i,1)
 }));
}
// Absolute coordinates of the original 4-cell I tile. Used in every fragment.
export function originalIDotCenters(){
 const a=[];
 for(let y=3;y<10;y+=3)
  for(let x=3+(y%3);x<46;x+=4){
   if((x*7+y*11)%9===0)continue;
   const i=a.length;
   a.push(Object.freeze({
    x:x+.5+jitter(i,0),
    y:y+.5+jitter(i,1)
   }));
  }
 return a;
}
export function renderSmoothTileSVG(kind){
 if(!Object.hasOwn(SIGNATURES,kind))throw new RangeError('Unknown piece: '+kind);
 if(kind==='I')return renderIFragmentSVG({sourceOffset:0,length:4});
 const L=PIECE_LUMINANCE[kind];
 let layers;
 switch(kind){
 case 'O':
  layers=[
   ...frame(12,12,L,L-95),
   rect(2,9,8,1,L-125),
   // This is one true triangle; its hypotenuse is no longer a
   // staircase of little squares.
   poly([[3,3],[8,3],[3,8]],L+5)
  ];
  break;
 case 'T':
  layers=[rect(1,1,10,10,L-5)];break;
 case 'S':
  layers=[rect(1,1,10,10,L+12),rect(1,1,10,1,L+25),
   rect(1,1,1,10,L+25),rect(5,5,2,2,8)];break;
 case 'Z':
  layers=[rect(1,1,10,10,10),rect(1,1,10,1,L+25),
   rect(1,1,1,10,L+25),rect(1,10,10,1,L+5),
   rect(10,1,1,10,L+5),rect(4,4,4,4,L+48),
   rect(5,5,2,2,8)];break;
 case 'J':
  layers=[rect(1,1,10,10,L+17),
   rect(1,1,10,1,L+45),rect(1,1,1,10,L+45),
   rect(1,10,10,1,L+35),rect(10,1,1,10,L+35),
   ...originalJDotCenters().map(p=>circ(p.x,p.y,.39,12))];
  break;
 case 'L':
  layers=[...frame(12,12,L,L-26),
   rect(3,3,7,7,L-54),
   rect(3,3,7,1,L-3),rect(3,3,1,7,L-3),
   rect(4,4,5,5,L-46),
   rect(9,3,1,7,L-108),rect(3,9,7,1,L-108)];
  break;
 }
 return shell(kind,12,12,layers);
}
function validateFragment(sourceOffset,length){
 if(!Number.isInteger(sourceOffset)||!Number.isInteger(length)||
  sourceOffset<0||length<1||sourceOffset+length>I_SOURCE_CELLS)
  throw new RangeError('I fragment must be an original contiguous 1–4-cell span');
}
function chunkParts(sourceOffset,length){
 validateFragment(sourceOffset,length);
 const width=length*12,L=PIECE_LUMINANCE.I;
 const layers=[
  // One uninterrupted strip at every length: never four framed squares.
  rect(1,1,width-2,10,L-55),
  rect(1,1,width-2,1,L+16),rect(1,1,1,10,L+16),
  rect(1,10,width-2,1,L+8),rect(width-2,1,1,10,L+8)
 ];
 const start=sourceOffset*12;
 // Clip fragments at newly exposed edges without relocating any dots.
 const dots=originalIDotCenters().filter(d=>
  d.x>=start+1.45&&d.x<=start+width-1.45
 ).map(d=>circ(d.x-start,d.y,.39,L-167));
 return [...layers,...dots];
}
export function renderIFragmentSVG({
 sourceOffset=0,length=4,orientation='horizontal'
}={}){
 validateFragment(sourceOffset,length);
 if(!['horizontal','vertical'].includes(orientation))
  throw new RangeError('Unknown orientation');
 const width=12*length,vertical=orientation==='vertical';
 const body=vertical?
  ['<g transform="translate(12 0) rotate(90)">',...chunkParts(sourceOffset,length),'</g>']:
  chunkParts(sourceOffset,length);
 return shell('I',vertical?12:width,vertical?width:12,body,
  ' data-source-offset="'+sourceOffset+'" data-source-length="'+length+
  '" data-orientation="'+orientation+'"');
}
export function IFragmentRuns(mask){
 if(!Number.isInteger(mask)||mask<0||mask>15)
  throw new RangeError('I source mask must be 0..15');
 const result=[];
 for(let i=0;i<4;){
  if(!(mask&(1<<i))){i++;continue}
  const start=i;
  while(i<4&&(mask&(1<<i)))i++;
  result.push(Object.freeze({sourceOffset:start,length:i-start}));
 }
 return result;
}
// All 16 masks (including empty), both orientations. Missing source cells
// never cause the surviving dots to be redistributed or re-seeded.
export function renderIStateSVG(mask=15,orientation='horizontal'){
 if(!['horizontal','vertical'].includes(orientation))
  throw new RangeError('Unknown orientation');
 const runs=IFragmentRuns(mask),vertical=orientation==='vertical';
 const body=[];
 for(const run of runs){
  body.push('<g transform="translate('+fmt(run.sourceOffset*12)+' 0)">',
   ...chunkParts(run.sourceOffset,run.length),'</g>');
 }
 const parts=vertical?['<g transform="translate(12 0) rotate(90)">',...body,'</g>']:body;
 return shell('I',vertical?12:48,vertical?48:12,parts,
  ' data-source-mask="'+mask+'" data-orientation="'+orientation+'"');
}
