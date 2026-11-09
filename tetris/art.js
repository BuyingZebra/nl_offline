/* Piece sprites, tile fallback, fragments and shadows. */
import {I_GRAVEL_BITS,J_GRAVEL_BITS} from './assets/tiles/gravel-layout.mjs?v119';
import {PIECE_LUMINANCE,renderIFragmentSVG} from './assets/tiles/smooth-geometry.mjs?v126';

export {PIECE_LUMINANCE};
export function pieceLuminance(kind){
 return PIECE_LUMINANCE[kind]??PIECE_LUMINANCE.T;
}

/* NOMAD V118 — approved 1989 Game Boy tile motifs.
 * Exactly the seven approved lower-row designs (I/O/T/S/Z/J/L).
 * Pixel-art source is grayscale; the existing phosphor compositor provides
 * green/amber tint, CRT bloom and scanlines. No layout or rules changes.
 */

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

/* NOMAD V121 — cached SVG sprite rendering for grayscale CRT source.
 * Uses the authored /assets/tiles/vector/*.svg files, not approximated
 * Canvas paths. SVGs are decoded once per shape; responsive sizes are then
 * rasterized at display DPR and cached. I-fragment variants are generated
 * from the same authored SVG geometry with original source coordinates.
 * Pixel renderer is a resilient fallback while SVG images finish loading.
 */

const KINDS=Object.freeze(['I','J','L','O','S','T','Z']);
export const VECTOR_PIECE_KINDS=KINDS;
export function spriteIdentity(kind,{sourceOffset=0,length=4,rotation=0}={}){
 if(kind!=='I'){
  if(!KINDS.includes(kind))throw new RangeError('Unknown tile kind: '+kind);
  return kind;
 }
 if(!Number.isInteger(sourceOffset)||!Number.isInteger(length)||
  !Number.isInteger(rotation)||rotation<0||rotation>3||
  length<1||length>4||sourceOffset<0||sourceOffset+length>4)
  throw new RangeError('Invalid I fragment source metadata');
 return 'I:'+sourceOffset+':'+length+':'+rotation;
}

export function createVectorTileRenderer({
 createImage=()=>new Image(),
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1,
 onReady=()=>{},
 assetPrefix='./assets/tiles/vector/'
}={}){
 const images=new Map(),rasterized=new Map();
 let disposed=false;
 const MAX_RASTERS=128;
 const sendReady=()=>{if(!disposed)onReady();};
 function spriteSource(key){
  if(key.length===1||key==='I:0:4:0')return assetPrefix+key[0]+'.svg?v126';
  const [,offset,length,rotation]=key.split(':').map((n,i)=>i?Number(n):n);
  const svg=renderIFragmentSVG({sourceOffset:offset,length,rotation});
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 }
 function load(key){
  let asset=images.get(key);
  if(asset)return asset;
  const image=createImage();
  asset={status:'loading',image};
  images.set(key,asset);
  image.onload=()=>{
   if(disposed)return;
   asset.status='ready';
   sendReady();
  };
  image.onerror=()=>{
   if(disposed)return;
   asset.status='failed';
   sendReady(); // repaint using the pixel fallback
  };
  image.src=spriteSource(key);
  return asset;
 }
 function draw(key,g,x,y,w,h,fallback){
  if(disposed||!(w>0&&h>0))return false;
  const asset=load(key);
  if(asset.status!=='ready'){fallback?.();return false;}
  const dpr=Math.max(1,Math.min(4,Number(pixelRatio())||1));
  const pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));
  const cacheKey=key+'@'+pw+'x'+ph;
  let canvas=rasterized.get(cacheKey);
  if(!canvas){
   canvas=createCanvas();
   canvas.width=pw;canvas.height=ph;
   const ctx=canvas.getContext('2d',{alpha:true});
   if(!ctx){fallback?.();return false;}
   ctx.imageSmoothingEnabled=true;
   if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
   try{ctx.drawImage(asset.image,0,0,pw,ph);}
   catch(error){fallback?.();return false;}
   if(rasterized.size>=MAX_RASTERS){
    const oldest=rasterized.keys().next().value;
    rasterized.delete(oldest);
   }
   rasterized.set(cacheKey,canvas);
  }else{
   // Recently used sprites remain in the small least-recently-used cache.
   rasterized.delete(cacheKey);rasterized.set(cacheKey,canvas);
  }
  g.drawImage(canvas,x,y,w,h);
  return true;
 }
 function drawTile(g,x,y,w,h,kind){
  if(!KINDS.includes(kind))return false;
  if(kind==='I')return drawVectorIFragment(g,x,y,w,h,{
   sourceOffset:0,length:1,rotation:0
  });
  return draw(spriteIdentity(kind),g,x,y,w,h,()=>drawTileFace(g,x,y,w,h,kind));
 }
 function drawVectorIFragment(g,x,y,w,h,{sourceOffset=0,length=4,rotation=0}={}){
  const options={sourceOffset,length,rotation};
  const key=spriteIdentity('I',options);
  return draw(key,g,x,y,w,h,()=>drawIFragment(g,x,y,w,h,options));
 }
 function drawPiece(g,tiles,kind,{rotation=0}={}){
  if(!Array.isArray(tiles)||!tiles.length)return;
  if(kind!=='I'){
   for(const t of tiles)drawTile(g,t.x,t.y,t.size,t.size,kind);
   return;
  }
  const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x+t.size));
  const minY=Math.min(...tiles.map(t=>t.y)),maxY=Math.max(...tiles.map(t=>t.y+t.size));
  drawVectorIFragment(g,minX,minY,maxX-minX,maxY-minY,{
   sourceOffset:0,length:tiles.length,rotation
  });
 }
 function preload(){for(const kind of KINDS)load(kind==='I'?'I:0:4:0':kind);}
 function dispose(){
  disposed=true;
  for(const asset of images.values()){
   asset.image.onload=null;asset.image.onerror=null;
  }
  images.clear();rasterized.clear();
 }
 return Object.freeze({
  drawTile,drawIFragment:drawVectorIFragment,drawPiece,preload,dispose,
  get imageCount(){return images.size;},
  get rasterCount(){return rasterized.size;}
 });
}

/* NOMAD piece-instance layout. Rendering only; game rules and board cell kinds
 * remain untouched. A contiguous I fragment must belong to ONE locked piece,
 * have consecutive original source indexes, and be physically adjacent in the
 * same direction. Clearing rows never re-seeds the remaining texture.
 */
export function collectIFragments(board,metadata,{hiddenRows=null}={}){
 const grouped=new Map(),missing=[];
 const hidden=y=>hiddenRows?.has(y)===true;
 for(let y=0;y<board.length;y++)for(let x=0;x<(board[y]?.length||0);x++){
  if(board[y][x]!=='I'||hidden(y))continue;
  const cell=metadata?.[y]?.[x];
  const valid=cell?.kind==='I'&&Number.isSafeInteger(cell.pieceId)&&
   cell.pieceId>0&&Number.isInteger(cell.sourceIndex)&&
   cell.sourceIndex>=0&&cell.sourceIndex<4&&
   Number.isInteger(cell.rotation)&&cell.rotation>=0&&cell.rotation<=3;
  if(!valid){
   missing.push(Object.freeze({x,y,pieceId:null,sourceOffset:0,length:1,rotation:0,untracked:true}));
   continue;
  }
  if(!grouped.has(cell.pieceId))grouped.set(cell.pieceId,[]);
  grouped.get(cell.pieceId).push({x,y,pieceId:cell.pieceId,index:cell.sourceIndex,rotation:cell.rotation});
 }
 const runs=[];
 for(const entries of grouped.values()){
  entries.sort((a,b)=>a.index-b.index);
  let group=[];
  const emit=()=>{
   if(!group.length)return;
   runs.push(Object.freeze({
    pieceId:group[0].pieceId,
    x:Math.min(...group.map(e=>e.x)),
    y:Math.min(...group.map(e=>e.y)),
    sourceOffset:group[0].index,
    length:group.length,
    rotation:group[0].rotation,
    untracked:false
   }));
   group=[];
  };
  for(const entry of entries){
   if(group.length){
    const last=group[group.length-1],dr=entry.rotation;
    // 0=right,1=down,2=left,3=up in source-index order.
    const dx=[1,0,-1,0][dr],dy=[0,1,0,-1][dr];
    if(dr!==last.rotation||entry.index!==last.index+1||
      entry.x!==last.x+dx||entry.y!==last.y+dy)emit();
   }
   group.push(entry);
  }
  emit();
 }
 return Object.freeze([...runs,...missing].sort((a,b)=>a.y-b.y||a.x-b.x||String(a.pieceId).localeCompare(String(b.pieceId))));
}

/* NOMAD V163 — deeper per-piece raised cast shadows.
 * Preserve core piece IDs and current rotated matrices. Pre-rasterized stamps
 * are cached by SILHOUETTE (not position) for fast movement and rotation on iOS.
 * Shadows darken the floor/grid only; SVG piece artwork remains untouched.
 */
const COLS=10,ROWS=20;
const depthForTile=tile=>Math.min(20,Math.max(8,tile*.8));
const cappedDpr=n=>Math.max(1,Math.min(3,Number(n)||1));

// Respect immutable boardMeta.pieceId even when two independent tetrominoes
// share edges or have been split by completed rows. Fallback legacy cells
// have distinct IDs rather than merging every connected block.
export function collectPieceShadowGroups(board,meta,active=null,hiddenRows=null){
 const groups=new Map();
 function add(id,x,y){
  if(!Number.isInteger(x)||!Number.isInteger(y)||
     x<0||x>=COLS||y<0||y>=ROWS)return;
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push({x,y});
 }
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(!board?.[y]?.[x]||hiddenRows?.has(y))continue;
  const pieceId=meta?.[y]?.[x]?.pieceId;
  add(Number.isSafeInteger(pieceId)&&pieceId>0?'locked:'+pieceId:'cell:'+x+':'+y,x,y);
 }
 // A new group is rebuilt from the live matrix EVERY repaint. Rotations,
 // wall kicks, gravity and hold therefore update the silhouette immediately.
 if(active?.matrix){
  const id='active:'+(Number.isSafeInteger(active.id)?active.id:'current');
  active.matrix.forEach((row,dy)=>row.forEach((kind,dx)=>{
   if(kind)add(id,active.x+dx,active.y+dy);
  }));
 }
 return [...groups].map(([id,cells])=>{
  cells.sort((a,b)=>a.y-b.y||a.x-b.x);
  const minX=Math.min(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y));
  const maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
  return {id,cells,minX,minY,maxX,maxY};
 });
}

export function pieceShadowProfile(tile){
 const depth=depthForTile(tile);
 return Object.freeze({
  // Keep the existing shadow reach, but deepen its projection so phosphor
  // bloom doesn't wash it out. An opaque central shadow is offset below
  // the piece, while a soft penumbra gradually extinguishes the grid.
  cast:{blur:depth,offsetX:6,offsetY:7,alpha:1},
  core:{blur:5,offsetX:6,offsetY:7,alpha:1},
  // Tight contact shadow preserves the apparent separation at each edge.
  contact:{blur:2.25,offsetX:2.5,offsetY:3.5,alpha:1},
  depth
 });
}

export function createPieceShadowRenderer({
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1,capacity=48
}={}){
 const cache=new Map();
 const limit=Math.max(1,Math.floor(capacity)||48);
 function stamp(group,tile,dpr){
  const profile=pieceShadowProfile(tile);
  const normalized=group.cells.map(c=>(c.x-group.minX)+','+(c.y-group.minY)).sort().join(';');
  const key=tile.toFixed(4)+'@'+dpr.toFixed(2)+':'+normalized;
  const prev=cache.get(key);
  if(prev){cache.delete(key);cache.set(key,prev);return prev;}
  const pad=Math.ceil(profile.depth*2+Math.max(
   profile.cast.offsetX,profile.cast.offsetY)+4);
  const shapeW=(group.maxX-group.minX+1)*tile;
  const shapeH=(group.maxY-group.minY+1)*tile;
  const width=shapeW+2*pad,height=shapeH+2*pad;
  const canvas=createCanvas();
  canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return null;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const silhouette=()=>{
   ctx.beginPath();
   for(const {x,y} of group.cells)ctx.rect(
    pad+(x-group.minX)*tile,pad+(y-group.minY)*tile,tile,tile);
  };
  // Apply physical pixel offsets to Canvas2D shadow props because shadowBlur
  // and shadowOffset are not transformed with the canvas coordinate matrix.
  for(const layer of [profile.cast,profile.core,profile.contact]){
   ctx.save();
   ctx.fillStyle='#000000';
   ctx.shadowColor='rgba(0,0,0,'+layer.alpha+')';
   ctx.shadowBlur=layer.blur*dpr;
   ctx.shadowOffsetX=layer.offsetX*dpr;
   ctx.shadowOffsetY=layer.offsetY*dpr;
   silhouette();ctx.fill();
   ctx.restore();
  }
  // Erase each source silhouette from the offscreen shadow, so transparent
  // motifs in the actual SVG pieces still show their correct original floor.
  ctx.save();
  ctx.globalCompositeOperation='destination-out';
  ctx.fillStyle='#000000';
  silhouette();ctx.fill();
  ctx.restore();
  const item={canvas,width,height,pad};
  if(cache.size>=limit)cache.delete(cache.keys().next().value);
  cache.set(key,item);
  return item;
 }
 function draw(g,groups,offX,offY,tile){
  if(!(tile>0)||!groups?.length)return 0;
  const dpr=cappedDpr(pixelRatio());
  let drawn=0;
  // The board's existing clip confines every shadow to the recessed floor.
  for(const group of groups){
   if(!group.cells.length)continue;
   const item=stamp(group,tile,dpr);
   if(!item)continue;
   g.drawImage(item.canvas,
    offX+group.minX*tile-item.pad,
    offY+group.minY*tile-item.pad,item.width,item.height);
   drawn++;
  }
  return drawn;
 }
 return Object.freeze({
  draw,dispose:()=>cache.clear(),
  get cacheSize(){return cache.size;}
 });
}
