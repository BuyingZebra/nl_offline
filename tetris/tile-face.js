/* NOMAD V118 — approved 1989 Game Boy tile motifs.
 * Exactly the seven approved lower-row designs (I/O/T/S/Z/J/L).
 * Pixel-art source is grayscale; the existing phosphor compositor provides
 * green/amber tint, CRT bloom and scanlines. No layout or rules changes.
 */
import {PIECE_LUMINANCE} from './piece-luminance.js?v106';
import {I_GRAVEL_BITS,J_GRAVEL_BITS} from './assets/tiles/gravel-layout.mjs?v119';
export {PIECE_LUMINANCE};

export const PIECE_PATTERNS=Object.freeze({
 I:'continuous-gravel',
 J:'dotted-field',
 L:'recessed-square',
 O:'corner-highlight',
 S:'small-center',
 T:'solid-fill',
 Z:'centered-square'
});
const SIZE=12;
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
const gray=v=>{const n=clamp(v);return 'rgb('+n+','+n+','+n+')';};
const matrix=(w,h)=>Array.from({length:h},()=>Array(w).fill(-1));
function box(m,x,y,w,h,c){
 for(let yy=Math.max(0,y);yy<Math.min(m.length,y+h);yy++)
  for(let xx=Math.max(0,x);xx<Math.min(m[0].length,x+w);xx++)m[yy][xx]=clamp(c);
}
function outline(m,cTop,cLeft,cBottom,cRight){
 const w=m[0].length,h=m.length;
 box(m,1,1,w-2,1,cTop);box(m,1,1,1,h-2,cLeft);
 box(m,1,h-2,w-2,1,cBottom);box(m,w-2,1,1,h-2,cRight);
}
function tilePixels(kind){
 const m=matrix(SIZE,SIZE),L=PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
 const bright=clamp(L+25);
 switch(kind){
 case 'O': // luminous top-left corner within a recessed medium-gray face
  box(m,1,1,10,10,L-95);
  outline(m,bright,bright,L-45,L-48);
  box(m,3,3,5,1,bright);box(m,3,3,1,5,bright);
  box(m,4,4,3,1,L+5);box(m,4,4,1,3,L+5);
  box(m,2,9,8,1,L-125);
  break;
 case 'T': // intentionally plain, without an invented frame or texture
  box(m,1,1,10,10,L-5);
  break;
 case 'S': // bright flat square with one small black central recess
  box(m,1,1,10,10,L+12);
  box(m,1,1,10,1,L+25);box(m,1,1,1,10,L+25);
  box(m,5,5,2,2,8);
  break;
 case 'Z': // black field, bright nested square, dark centered pixel
  box(m,1,1,10,10,10);
  outline(m,bright,bright,L+5,L+5);
  box(m,4,4,4,4,L+48);
  box(m,5,5,2,2,8);
  break;
 case 'J': // scattered isolated dark dots, never checkerboard
  box(m,1,1,10,10,L+17);
  outline(m,L+45,L+45,L+35,L+35);
  for(const [x,y,w,h] of J_GRAVEL_BITS)box(m,x,y,w,h,12);
  break;
 case 'L': // medium face with a square beveled recess
  box(m,1,1,10,10,L-26);
  outline(m,L+24,L+18,L-12,L-12);
  box(m,3,3,7,7,L-54);
  box(m,3,3,7,1,L-3);box(m,3,3,1,7,L-3);
  box(m,4,4,5,5,L-46);
  box(m,9,3,1,7,L-108);box(m,3,9,7,1,L-108);
  break;
 default:
  return barPixels(1,false);
 }
 return m;
}
function rotate90(m){
 const h=m.length,w=m[0].length;
 const rotated=matrix(h,w);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)rotated[x][h-1-y]=m[y][x];
 return rotated;
}
function barPixels(length,vertical,sourceOffset=0,rotation=vertical?1:0){
 const count=Math.round(length),offset=Math.round(sourceOffset);
 if(count<1||count>4||offset<0||offset+count>4)
  throw new RangeError('Invalid I fragment length or sourceOffset');
 if(!Number.isInteger(rotation)||rotation<0||rotation>3)
  throw new RangeError('Invalid I fragment rotation');
 const w=SIZE*count,L=PIECE_LUMINANCE.I;
 let m=matrix(w,SIZE);
 // Face and outer rim belong to this one contiguous fragment, never each
 // adjacent block. Only actual source gravel spots appear inside this rim.
 box(m,1,1,w-2,10,L-55);
 outline(m,L+16,L+16,L+8,L+8);
 for(const [x,y,dw,dh] of I_GRAVEL_BITS){
  const localX=x-offset*SIZE;
  if(localX>=2&&localX+dw<=w-2)box(m,localX,y,dw,dh,L-167);
 }
 for(let n=0;n<rotation;n++)m=rotate90(m);
 return m;
}
const tileCache=new Map();
function sprite(kind){
 if(!tileCache.has(kind))tileCache.set(kind,tilePixels(kind));
 return tileCache.get(kind);
}
const barCache=new Map();
function barSprite(length,vertical){
 const key=length+':'+vertical;
 if(!barCache.has(key))barCache.set(key,barPixels(length,vertical));
 return barCache.get(key);
}
function raster(g,pixels,x,y,w,h){
 if(!(w>0&&h>0)||!pixels.length)return;
 const rows=pixels.length,cols=pixels[0].length;
 const dx=w/cols,dy=h/rows;
 for(let yy=0;yy<rows;yy++){
  const line=pixels[yy];
  for(let xx=0;xx<cols;){
   const color=line[xx],start=xx++;
   while(xx<cols&&line[xx]===color)xx++;
   if(color<0)continue;
   g.fillStyle=gray(color);
   // Fractional cell sizes are allowed; tiny overlap avoids raster cracks.
   g.fillRect(x+start*dx,y+yy*dy,(xx-start)*dx+.001,dy+.001);
  }
 }
}
export function drawIFragment(g,x,y,w,h,{sourceOffset=0,length=4,rotation=0}={}){
 if(!(w>0&&h>0))return;
 raster(g,barPixels(length,Boolean(rotation%2),sourceOffset,rotation),x,y,w,h);
}
export function drawIBar(g,x,y,w,h){
 if(!(w>0&&h>0))return;
 const vertical=h>w;
 const length=Math.max(1,Math.round((vertical?h:w)/(vertical?w:h)));
 raster(g,barSprite(length,vertical),x,y,w,h);
}
export function drawTileFace(g,x,y,w,h,kind){
 if(kind==='I'){drawIBar(g,x,y,w,h);return;}
 raster(g,sprite(kind),x,y,w,h);
}
// The four I cells share ONE continuous rectangle in NEXT/HOLD and in flight.
export function drawPieceTiles(g,tiles,kind,{rotation}={}){
 if(!Array.isArray(tiles)||!tiles.length)return;
 if(kind==='I'){
  const minX=Math.min(...tiles.map(t=>t.x)),minY=Math.min(...tiles.map(t=>t.y));
  const maxX=Math.max(...tiles.map(t=>t.x+t.size));
  const maxY=Math.max(...tiles.map(t=>t.y+t.size));
  const vertical=maxY-minY>maxX-minX;
  drawIFragment(g,minX,minY,maxX-minX,maxY-minY,
   {sourceOffset:0,length:tiles.length,rotation:rotation??(vertical?1:0)});
  return;
 }
 for(const t of tiles)drawTileFace(g,t.x,t.y,t.size,t.size,kind);
}
