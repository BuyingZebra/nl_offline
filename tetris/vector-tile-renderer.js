/* NOMAD V121 — cached SVG sprite rendering for grayscale CRT source.
 * Uses the authored /assets/tiles/vector/*.svg files, not approximated
 * Canvas paths. SVGs are decoded once per shape; responsive sizes are then
 * rasterized at display DPR and cached. I-fragment variants are generated
 * from the same authored SVG geometry with original source coordinates.
 * Pixel renderer is a resilient fallback while SVG images finish loading.
 */
import {renderIFragmentSVG} from './assets/tiles/smooth-geometry.mjs?v125';
import {drawTileFace,drawIFragment as drawPixelIFragment} from './tile-face.js?v120';

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
  if(key.length===1||key==='I:0:4:0')return assetPrefix+key[0]+'.svg?v125';
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
  if(kind==='I')return drawIFragment(g,x,y,w,h,{
   sourceOffset:0,length:1,rotation:0
  });
  return draw(spriteIdentity(kind),g,x,y,w,h,()=>drawTileFace(g,x,y,w,h,kind));
 }
 function drawIFragment(g,x,y,w,h,{sourceOffset=0,length=4,rotation=0}={}){
  const options={sourceOffset,length,rotation};
  const key=spriteIdentity('I',options);
  return draw(key,g,x,y,w,h,()=>drawPixelIFragment(g,x,y,w,h,options));
 }
 function drawPiece(g,tiles,kind,{rotation=0}={}){
  if(!Array.isArray(tiles)||!tiles.length)return;
  if(kind!=='I'){
   for(const t of tiles)drawTile(g,t.x,t.y,t.size,t.size,kind);
   return;
  }
  const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x+t.size));
  const minY=Math.min(...tiles.map(t=>t.y)),maxY=Math.max(...tiles.map(t=>t.y+t.size));
  drawIFragment(g,minX,minY,maxX-minX,maxY-minY,{
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
  drawTile,drawIFragment,drawPiece,preload,dispose,
  get imageCount(){return images.size;},
  get rasterCount(){return rasterized.size;}
 });
}
