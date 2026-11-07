/* NOMAD V129 — one authored running-bond brick texture in pixel and vector form.
 * Grayscale geometry only; the existing CRT compositor supplies phosphor tint.
 * Rails sit outside the playable grid; the authored pattern tile matches one cell.
 */
export const BRICK_UNIT=Object.freeze({width:12,height:12,courses:2});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const fmt=n=>Number(n.toFixed(3)).toString();
const rgb=n=>'rgb('+n+','+n+','+n+')';
// A single 12x12 texture tile matches one tetromino block, with two
// staggered half-height brick courses contained within that single tile.
const COURSES=Object.freeze([
 Object.freeze({y:1,bricks:Object.freeze([{x:1,w:10}])}),
 Object.freeze({y:7,bricks:Object.freeze([{x:-4,w:9},{x:6,w:9}])})
]);
export function brickShapes(style='vector'){
 if(style!=='pixel'&&style!=='vector')throw new RangeError('Unknown brick style');
 const pixel=style==='pixel',layers=[];
 function add(x,y,w,h,shade){if(w>0&&h>0)layers.push(Object.freeze({x,y,w,h,shade}));}
 for(const course of COURSES)for(const {x,w} of course.bricks){
  const y=course.y,h=4;
  // Face coordinates are identical in both artworks; only the bevel is finer
  // in the vector version. No gradients, radius, texture noise or runtime RNG.
  add(x,y,w,h,pixel?173:178);
  const rim=pixel?1:.65;
  add(x,y,w,rim,pixel?218:230);
  add(x,y,rim,h,pixel?209:217);
  add(x,y+h-rim,w,rim,pixel?77:81);
  add(x+w-rim,y,rim,h,pixel?89:103);
 }
 return layers;
}
export function renderBrickSVG(style='vector'){
 const shapes=brickShapes(style).map(({x,y,w,h,shade})=>
  '<rect x="'+fmt(x)+'" y="'+fmt(y)+'" width="'+fmt(w)+
  '" height="'+fmt(h)+'" fill="'+rgb(shade)+'"/>');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" '+
  'width="12" height="12" shape-rendering="'+
  (style==='pixel'?'crispEdges':'geometricPrecision')+'" '+
  'data-design="nomad-bricks-v129" data-style="'+style+'">\n'+
  '<title>NOMAD staggered '+style+' brick rail</title>\n'+
  shapes.join('\n')+'\n</svg>\n';
}
// Stamp size equals the actual cell size: (boardW-4)/10.
// The full rails live OUTSIDE the game board, with a half-pixel gutter.
export function brickRailGeometry(r){
 const {boardX:x,boardY:y,boardW:w,boardH:h}=r;
 if(!(w>4&&h>4))return null;
 const cell=(w-4)/10,gap=.5;
 const outerLeft=(r.off??0)+Math.max(3,(r.pad??11)-6)+1;
 const sidebarLeft=r.sideX??x+w;
 const left=Object.freeze({x:x-gap-cell,y:y+2,w:cell,h:cell*20});
 const right=Object.freeze({x:x+w+gap,y:y+2,w:cell,h:cell*20});
 // Constrained layouts clip the full-size texture at the available edges.
 // Neither the grid nor the sidebar is ever overpainted.
 const leftVisible=Object.freeze({
  x:Math.max(left.x,outerLeft),
  w:Math.max(0,Math.min(cell,x-gap-Math.max(left.x,outerLeft)))
 });
 const rightVisible=Object.freeze({
  x:right.x,
  w:Math.max(0,Math.min(cell,sidebarLeft-gap-right.x))
 });
 return Object.freeze({width:cell,height:cell,left,right,leftVisible,
  rightVisible,boardLeft:x,boardRight:x+w});
}
// Device-DPR raster stamp, cached at physical size for fast cropped redraws.
// Both image assets and live stamps come from brickShapes(), not separate art.
export function createBrickFrame({
 createCanvas=()=>document.createElement('canvas'),
 pixelRatio=()=>1
}={}){
 const stamps=new Map();
 function stamp(width,style){
  const dpr=clamp(Number(pixelRatio())||1,1,4);
  const pixelW=Math.max(1,Math.round(width*dpr));
  const key=style+':'+pixelW;
  if(stamps.has(key))return stamps.get(key);
  const canvas=createCanvas();
  canvas.width=pixelW;canvas.height=pixelW;
  const c=canvas.getContext('2d');
  if(!c)return null;
  const sx=canvas.width/BRICK_UNIT.width,sy=canvas.height/BRICK_UNIT.height;
  for(const {x,y,w,h,shade} of brickShapes(style)){
   c.fillStyle=rgb(shade);c.fillRect(x*sx,y*sy,w*sx,h*sy);
  }
  if(stamps.size>=12)stamps.delete(stamps.keys().next().value);
  stamps.set(key,canvas);
  return canvas;
 }
 function draw(ctx,r,style='vector'){
  const geometry=brickRailGeometry(r);
  if(!geometry)return;
  const tile=stamp(geometry.width,style);
  if(!tile)return;
  for(const [rail,visible] of [
   [geometry.left,geometry.leftVisible],
   [geometry.right,geometry.rightVisible]
  ]){
   if(!(visible.w>0))continue;
   ctx.save();
   ctx.beginPath();ctx.rect(visible.x,rail.y,visible.w,rail.h);ctx.clip();
   // One repeating pattern tile per game-grid row, for both pixel and vector.
   // Exactly 20 courses without floating-point accumulation or a 21st
   // draw on fractional device CSS pixels.
   for(let row=0;row<20;row++)
    ctx.drawImage(tile,rail.x,rail.y+row*geometry.height,
     geometry.width,geometry.height);
   ctx.restore();
  }
 }
 return Object.freeze({draw,dispose:()=>stamps.clear(),get cachedStamps(){return stamps.size;}});
}
